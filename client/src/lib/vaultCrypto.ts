import type { VaultMetaInput } from '../../../shared/types';

/**
 * Private Vault cryptography (Web Crypto only, no libraries).
 *
 * - A random 256-bit vault key encrypts every item with AES-GCM (random 96-bit IV per write).
 * - The vault key is stored only wrapped: AES-GCM-encrypted with a key derived from the vault
 *   passphrase via PBKDF2-SHA-256 (600,000 iterations, random 128-bit salt).
 * - Unwrapped, the vault key is a non-extractable CryptoKey that lives in memory only.
 *
 * The server stores salt, iteration count, wrapped key and ciphertext. Without the passphrase
 * none of it can be read, by the server or anyone else, and a lost passphrase cannot be reset.
 */

export const ITERATIONS = 600_000;
export type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Bytes {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKek(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export const importVaultKey = (raw: Bytes) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

async function wrap(raw: Bytes, passphrase: string): Promise<VaultMetaInput> {
  const salt = random(16);
  const wrapIv = random(12);
  const kek = await deriveKek(passphrase, salt, ITERATIONS);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, raw),
  );
  return {
    salt: toBase64(salt),
    iterations: ITERATIONS,
    wrappedKey: toBase64(wrapped),
    wrapIv: toBase64(wrapIv),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase doesn't open this vault.");
    this.name = 'WrongPassphraseError';
  }
}

/** The raw vault key (callers must wipe it with `fill(0)` once done). */
export async function unwrapRaw(passphrase: string, meta: VaultMetaInput): Promise<Bytes> {
  const kek = await deriveKek(passphrase, fromBase64(meta.salt), meta.iterations);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(meta.wrapIv) },
        kek,
        fromBase64(meta.wrappedKey),
      ),
    );
  } catch {
    // AES-GCM authentication fails for a wrong passphrase.
    throw new WrongPassphraseError();
  }
}

/** New vault: a fresh random key, wrapped with the passphrase. */
export async function createVault(
  passphrase: string,
): Promise<{ meta: VaultMetaInput; key: CryptoKey }> {
  const raw = random(32);
  try {
    return { meta: await wrap(raw, passphrase), key: await importVaultKey(raw) };
  } finally {
    raw.fill(0);
  }
}

export async function unlockVault(passphrase: string, meta: VaultMetaInput): Promise<CryptoKey> {
  const raw = await unwrapRaw(passphrase, meta);
  try {
    return await importVaultKey(raw);
  } finally {
    raw.fill(0);
  }
}

/** Same vault key, wrapped with a new passphrase; nothing else needs re-encrypting. */
export async function rewrapVault(
  oldPassphrase: string,
  newPassphrase: string,
  meta: VaultMetaInput,
): Promise<VaultMetaInput> {
  const raw = await unwrapRaw(oldPassphrase, meta);
  try {
    return await wrap(raw, newPassphrase);
  } finally {
    raw.fill(0);
  }
}

export async function encryptJSON(
  key: CryptoKey,
  value: unknown,
): Promise<{ iv: string; data: string }> {
  const iv = random(12);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))),
  );
  return { iv: toBase64(iv), data: toBase64(data) };
}

export async function decryptJSON<T>(
  key: CryptoKey,
  item: { iv: string; data: string },
): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(item.iv) },
    key,
    fromBase64(item.data),
  );
  return JSON.parse(dec.decode(plain)) as T;
}

/** Files: output is IV (12 bytes) followed by the ciphertext. */
export async function encryptBytes(key: CryptoKey, bytes: ArrayBuffer): Promise<Bytes> {
  const iv = random(12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + cipher.length);
  out.set(iv);
  out.set(cipher, 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const all = new Uint8Array(blob);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, key, all.subarray(12));
}

/** Rough passphrase guidance (length and variety); no passphrase is ever sent anywhere. */
export function passphraseHint(p: string): { ok: boolean; text: string } {
  if (p.length < 12)
    return { ok: false, text: 'Use at least 12 characters. Several unrelated words work well.' };
  const words = p.trim().split(/\s+/).length;
  if (p.length >= 20 || words >= 4)
    return { ok: true, text: 'Strong enough, if it isn’t used anywhere else.' };
  return { ok: true, text: 'Okay. Longer is stronger: four or more random words is ideal.' };
}
