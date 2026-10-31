import { createStore, del, get, set } from 'idb-keyval';
import type { VaultMeta } from '../../../shared/types';
import {
  deriveKek,
  fromBase64,
  importVaultKey,
  random,
  toBase64,
  unwrapRaw,
  type Bytes,
} from './vaultCrypto';

/**
 * The PIN for locked entries, per device.
 *
 * Locked entries are encrypted with the vault key (whose strength is the vault passphrase).
 * On a device, after the passphrase has been entered once, the vault key is kept wrapped
 * twice, in IndexedDB:
 *   inner = AES-GCM(raw vault key) with a key from PBKDF2-SHA-256(PIN, 600k iterations)
 *   blob  = AES-GCM(inner) with a random, non-extractable device key (a CryptoKey that the
 *           browser stores but never hands out as bytes)
 * So the PIN only works on this device, and a copy of the database alone is no help: the
 * entries need the passphrase. Five wrong PINs in a row erase the record; the passphrase is
 * then needed again. Nothing here is ever sent to the server.
 */
export const PIN_ATTEMPTS = 5;
const ITERATIONS = 600_000;
const store = () => createStore('notebook-entry-lock', 'pin');

interface PinRecord {
  v: 1;
  /** The vault this key belongs to (`VaultMeta.createdAt`); a reset vault invalidates it. */
  vault: string;
  deviceKey: CryptoKey;
  salt: string;
  pinIv: string;
  deviceIv: string;
  blob: string;
  attemptsLeft: number;
}

const keyFor = (userId: string) => `pin:${userId}`;

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

export const isValidPin = (pin: string) => /^\d{4,12}$/.test(pin);

async function read(userId: string): Promise<PinRecord | null> {
  try {
    return (await get<PinRecord>(keyFor(userId), store())) ?? null;
  } catch {
    return null;
  }
}

/** Whether this device has a PIN for the given vault. */
export async function hasPin(userId: string, meta: VaultMeta): Promise<boolean> {
  const rec = await read(userId);
  if (rec && rec.vault !== meta.createdAt) {
    await forgetPin(userId);
    return false;
  }
  return !!rec;
}

export async function forgetPin(userId: string): Promise<void> {
  await del(keyFor(userId), store()).catch(() => {});
}

/** Checks the passphrase, then keeps the vault key on this device behind `pin`. */
export async function setUpPin(
  userId: string,
  meta: VaultMeta,
  passphrase: string,
  pin: string,
): Promise<CryptoKey> {
  if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 12 digits.');
  const raw = await unwrapRaw(passphrase, meta);
  try {
    const salt = random(16);
    const pinIv = random(12);
    const deviceIv = random(12);
    const kek = await deriveKek(pin, salt, ITERATIONS);
    const inner = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: pinIv }, kek, raw),
    );
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const blob = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: deviceIv }, deviceKey, inner),
    );
    const rec: PinRecord = {
      v: 1,
      vault: meta.createdAt,
      deviceKey,
      salt: toBase64(salt),
      pinIv: toBase64(pinIv),
      deviceIv: toBase64(deviceIv),
      blob: toBase64(blob),
      attemptsLeft: PIN_ATTEMPTS,
    };
    await set(keyFor(userId), rec, store());
    return await importVaultKey(raw);
  } finally {
    raw.fill(0);
  }
}

/** Opens the vault key with the PIN. Wrong PINs count down; at zero the record is erased. */
export async function unlockWithPin(
  userId: string,
  meta: VaultMeta,
  pin: string,
): Promise<CryptoKey> {
  const rec = await read(userId);
  if (!rec || rec.vault !== meta.createdAt) {
    await forgetPin(userId);
    throw new WrongPinError(0);
  }
  const inner = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(rec.deviceIv) },
      rec.deviceKey,
      fromBase64(rec.blob),
    ),
  );
  let raw: Bytes | null = null;
  try {
    const kek = await deriveKek(pin, fromBase64(rec.salt), ITERATIONS);
    raw = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(rec.pinIv) }, kek, inner),
    );
  } catch {
    const attemptsLeft = rec.attemptsLeft - 1;
    if (attemptsLeft <= 0) await forgetPin(userId);
    else await set(keyFor(userId), { ...rec, attemptsLeft }, store());
    throw new WrongPinError(attemptsLeft);
  }
  try {
    if (rec.attemptsLeft !== PIN_ATTEMPTS)
      await set(keyFor(userId), { ...rec, attemptsLeft: PIN_ATTEMPTS }, store());
    return await importVaultKey(raw);
  } finally {
    raw.fill(0);
  }
}
