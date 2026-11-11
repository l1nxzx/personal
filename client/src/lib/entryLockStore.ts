import { createStore, del, get, set } from 'idb-keyval';
import type { EntryKeyInfo, VaultMeta } from '../../../shared/types';
import { ApiError, apiFetch, NetworkError } from './apiFetch';
import { fromBase64, importVaultKey, random, toBase64, unwrapRaw, type Bytes } from './vaultCrypto';

/**
 * The PIN for encrypted entries (docs/DECISIONS.md 28).
 *
 * Encrypted entries have their own random key (the entries key). The server stores it only
 * encrypted with the vault key, so the vault passphrase can always recover it; the vault key
 * itself is never kept on a device.
 *
 * On a device, after the passphrase has been entered once, the entries key is kept in
 * IndexedDB inside a box that needs three things to open:
 *   - data only this device has: the box and a random salt,
 *   - a random "server half" that the server keeps and releases only for the right PIN,
 *   - the PIN.
 * From the PIN and the salt (PBKDF2-SHA-256, 600k iterations) the device derives a check value,
 * which it sends to the server, and a wrapping part, which never leaves the device. The box is
 * opened with HKDF(wrapping part + server half). A copy of the device's storage can't be used
 * to try PINs offline (there's no server half in it), and the server counts wrong PINs: five,
 * and it deletes the server half for good. The database alone opens nothing either.
 */
const ITERATIONS = 600_000;
const store = () => createStore('notebook-entry-lock-v2', 'pin');

// The first version kept the vault key itself on the device behind the PIN alone. Remove it.
try {
  indexedDB.deleteDatabase('notebook-entry-lock');
} catch {
  // no IndexedDB (private mode): nothing stored either
}

interface PinRecord {
  v: 2;
  deviceId: string;
  keyId: string;
  salt: string;
  iv: string;
  box: string;
}

const keyFor = (userId: string) => `pin:${userId}`;
const enc = new TextEncoder();

export class WrongPinError extends Error {
  constructor(public readonly attemptsLeft: number) {
    super(
      attemptsLeft > 0
        ? `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'Wrong PIN too many times. Enter the vault passphrase to set a new PIN.',
    );
    this.name = 'WrongPinError';
  }
}

/** The server no longer has this device's PIN (too many tries, removed, or a new key). */
export class PinGoneError extends Error {
  constructor() {
    super('This device needs the vault passphrase again to set a PIN.');
    this.name = 'PinGoneError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Opening encrypted entries needs an internet connection.');
    this.name = 'OfflineError';
  }
}

export const isValidPin = (pin: string) => /^\d{4,12}$/.test(pin);

const randomId = (prefix: string) =>
  `${prefix}_${Array.from(random(12), (b) => b.toString(16).padStart(2, '0')).join('')}`;

async function read(userId: string): Promise<PinRecord | null> {
  try {
    const rec = await get<PinRecord>(keyFor(userId), store());
    return rec?.v === 2 ? rec : null;
  } catch {
    return null;
  }
}

/** Whether this device has a PIN for the account. */
export async function hasPin(userId: string): Promise<boolean> {
  return !!(await read(userId));
}

/** Forgets the PIN on this device, and on the server if it can be reached. */
export async function forgetPin(userId: string, { remote = false } = {}): Promise<void> {
  const rec = await read(userId);
  await del(keyFor(userId), store()).catch(() => {});
  if (remote && rec)
    await apiFetch(`/entry-lock/devices/${rec.deviceId}`, { method: 'DELETE' }).catch(() => {});
}

export async function thisDeviceId(userId: string): Promise<string | null> {
  return (await read(userId))?.deviceId ?? null;
}

/** Check value (sent to the server) and wrapping part (stays here), from the PIN. */
async function fromPin(pin: string, salt: Bytes) {
  const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      material,
      512,
    ),
  );
  return { verifier: toBase64(bits.slice(0, 32)), wrapPart: bits.slice(32) };
}

async function boxKey(wrapPart: Bytes, serverHalf: Bytes, salt: Bytes): Promise<CryptoKey> {
  const ikm = new Uint8Array(64);
  ikm.set(wrapPart);
  ikm.set(serverHalf, 32);
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  ikm.fill(0);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('notebook entry lock v2') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * The entries key, opened with the vault key; made (and stored encrypted) the first time.
 * Returns its raw bytes: callers wipe them.
 */
async function entriesKeyRaw(vaultKey: CryptoKey): Promise<{ keyId: string; raw: Bytes }> {
  let info = (await apiFetch<{ key: EntryKeyInfo | null }>('/entry-lock/key')).key;
  if (!info) {
    const raw = random(32);
    const iv = random(12);
    const data = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, raw),
    );
    raw.fill(0);
    // If another device made one first, the server keeps (and returns) that one.
    info = (
      await apiFetch<{ key: EntryKeyInfo }>('/entry-lock/key', {
        method: 'POST',
        body: { keyId: randomId('ek'), iv: toBase64(iv), data: toBase64(data) },
      })
    ).key;
  }
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(info.iv) },
      vaultKey,
      fromBase64(info.data),
    ),
  );
  return { keyId: info.keyId, raw };
}

export interface OpenedKeys {
  key: CryptoKey;
  keyId: string;
}

/**
 * With the vault passphrase: opens the vault key (in memory, briefly), gets the entries key,
 * and keeps it on this device behind a new PIN. Returns the entries key and the vault key, which
 * the caller uses only to re-seal entries the vault key sealed, then drops.
 */
export async function setUpPin(
  userId: string,
  meta: VaultMeta,
  passphrase: string,
  pin: string,
  label: string,
): Promise<OpenedKeys & { vaultKey: CryptoKey }> {
  if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 12 digits.');
  const vaultRaw = await unwrapRaw(passphrase, meta);
  const vaultKey = await importVaultKey(vaultRaw);
  vaultRaw.fill(0);
  const { keyId, raw } = await entriesKeyRaw(vaultKey);
  try {
    const old = await read(userId);
    const deviceId = old?.deviceId ?? randomId('device');
    const salt = random(16);
    const { verifier, wrapPart } = await fromPin(pin, salt);
    const { serverHalf } = await apiFetch<{ serverHalf: string }>('/entry-lock/devices', {
      method: 'POST',
      body: { deviceId, verifier, keyId, label },
    });
    const half = fromBase64(serverHalf);
    const k = await boxKey(wrapPart, half, salt);
    wrapPart.fill(0);
    half.fill(0);
    const iv = random(12);
    const box = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw));
    const rec: PinRecord = {
      v: 2,
      deviceId,
      keyId,
      salt: toBase64(salt),
      iv: toBase64(iv),
      box: toBase64(box),
    };
    await set(keyFor(userId), rec, store());
    return { key: await importVaultKey(raw), keyId, vaultKey };
  } finally {
    raw.fill(0);
  }
}

/** Only the vault key, from the passphrase (to finish re-sealing old entries). */
export async function vaultKeyFrom(passphrase: string, meta: VaultMeta): Promise<CryptoKey> {
  const raw = await unwrapRaw(passphrase, meta);
  try {
    return await importVaultKey(raw);
  } finally {
    raw.fill(0);
  }
}

/** Opens the entries key with the PIN; the server checks it and counts wrong ones. */
export async function unlockWithPin(userId: string, pin: string): Promise<OpenedKeys> {
  const rec = await read(userId);
  if (!rec) throw new PinGoneError();
  const salt = fromBase64(rec.salt);
  const { verifier, wrapPart } = await fromPin(pin, salt);
  let serverHalf: string;
  try {
    serverHalf = (
      await apiFetch<{ serverHalf: string }>('/entry-lock/unlock', {
        method: 'POST',
        body: { deviceId: rec.deviceId, verifier },
      })
    ).serverHalf;
  } catch (err) {
    wrapPart.fill(0);
    if (err instanceof ApiError && err.code === 'WRONG_PIN') {
      const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft ?? 0;
      if (left <= 0) await forgetPin(userId);
      throw new WrongPinError(left);
    }
    if (err instanceof ApiError && err.code === 'PIN_GONE') {
      await forgetPin(userId);
      throw new PinGoneError();
    }
    if (err instanceof NetworkError) throw new OfflineError();
    throw err;
  }
  const half = fromBase64(serverHalf);
  const k = await boxKey(wrapPart, half, salt);
  wrapPart.fill(0);
  half.fill(0);
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(rec.iv) },
      k,
      fromBase64(rec.box),
    ),
  );
  try {
    return { key: await importVaultKey(raw), keyId: rec.keyId };
  } finally {
    raw.fill(0);
  }
}

/** A short name for this device in the list of devices with a PIN. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iPhone/iPad'
      : /Mac OS X/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'browser';
  const standalone = matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
  return `${os} · ${browser}${standalone}`;
}
