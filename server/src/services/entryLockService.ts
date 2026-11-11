import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  EnrollPinRequest,
  EntryKeyInfo,
  PinDevice,
  UnlockPinRequest,
} from '../../../shared/types.js';
import * as entries from '../data/entryRepo.js';
import * as lockRepo from '../data/entryLockRepo.js';
import * as versions from '../data/versionRepo.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import type { Ctx } from './context.js';

/**
 * The server's part in opening encrypted entries (see docs/DECISIONS.md 28). It holds no key
 * that can decrypt anything: the entries key is stored encrypted with the vault key, and a
 * device's "server half" is random bytes that open nothing without the device's own data and
 * its PIN. What the server adds is the attempt limit, which a copy of a device can't skip.
 */
export const PIN_ATTEMPTS = 5;

const hashOf = (verifier: string) => createHash('sha256').update(verifier).digest('hex');

export async function getKey(ctx: Ctx): Promise<EntryKeyInfo | null> {
  return lockRepo.getKey(ctx.userId);
}

/** Created once, by the first device (the browser makes it); afterwards the stored one wins. */
export async function createKey(
  ctx: Ctx,
  input: Omit<EntryKeyInfo, 'createdAt'>,
): Promise<EntryKeyInfo> {
  return lockRepo.createKey(ctx.userId, { ...input, createdAt: new Date().toISOString() });
}

const toDevice = (d: lockRepo.PinDeviceRecord): PinDevice => ({
  id: d.id,
  label: d.label,
  createdAt: d.createdAt,
  lastUsedAt: d.lastUsedAt,
});

export async function listDevices(ctx: Ctx): Promise<PinDevice[]> {
  return (await lockRepo.listDevices(ctx.userId))
    .map(toDevice)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A device sets (or resets) its PIN. Returns the new server half, which only it receives. */
export async function enroll(ctx: Ctx, input: EnrollPinRequest): Promise<{ serverHalf: string }> {
  const key = await lockRepo.getKey(ctx.userId);
  if (!key || key.keyId !== input.keyId)
    throw new AppError(409, 'KEY_CHANGED', 'The entries key changed; enter the passphrase again');
  const serverHalf = randomBytes(32).toString('base64');
  await lockRepo.putDevice(ctx.userId, {
    id: input.deviceId,
    keyId: input.keyId,
    label: input.label.trim().slice(0, 80) || 'Device',
    verifierHash: hashOf(input.verifier),
    serverHalf,
    attemptsLeft: PIN_ATTEMPTS,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  });
  return { serverHalf };
}

/** One PIN attempt. The server half only for the right PIN; too many wrong ones delete it. */
export async function unlock(ctx: Ctx, input: UnlockPinRequest): Promise<{ serverHalf: string }> {
  const given = Buffer.from(hashOf(input.verifier), 'hex');
  const result = await lockRepo.checkPin(
    ctx.userId,
    input.deviceId,
    (stored) => {
      const s = Buffer.from(stored, 'hex');
      return s.length === given.length && timingSafeEqual(s, given);
    },
    PIN_ATTEMPTS,
  );
  if (result.status === 'missing')
    throw new AppError(404, 'PIN_GONE', 'This device has no PIN any more. Enter the passphrase.');
  if (result.status === 'wrong')
    throw new AppError(
      403,
      'WRONG_PIN',
      result.attemptsLeft > 0
        ? `Wrong PIN. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'Wrong PIN too many times. Enter the vault passphrase to set a new PIN.',
      { attemptsLeft: result.attemptsLeft },
    );
  return { serverHalf: result.serverHalf };
}

export async function removeDevice(ctx: Ctx, id: string): Promise<void> {
  if (!(await lockRepo.deleteDevice(ctx.userId, id))) throw notFound('No such device');
}

/** Gone with the vault: a new vault key could never open the old entries key. */
export async function resetAll(ctx: Ctx): Promise<void> {
  await Promise.all([lockRepo.deleteKey(ctx.userId), lockRepo.deleteAllDevices(ctx.userId)]);
}

/**
 * Encrypted entries still sealed with the vault key (entry text or any version): the browser
 * re-seals them with the entries key (`entryService.resealEntry`).
 */
export async function legacyEntries(ctx: Ctx, keyId: string) {
  if (!keyId) throw badRequest('Missing key id');
  const out: { kind: 'journal' | 'writing'; id: string }[] = [];
  for (const { kind, id } of await entries.lockedIds(ctx.userId)) {
    const e = await entries.get(ctx.userId, kind, id);
    if (!e) continue;
    const states = await versions.sealStates(ctx.userId, id);
    if (e.sealed?.k !== keyId || states.some((s) => s.sealed && s.keyId !== keyId))
      out.push({ kind: kind as 'journal' | 'writing', id });
  }
  return out;
}
