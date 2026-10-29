import type { Readable } from 'node:stream';
import type {
  VaultItem,
  VaultItemInput,
  VaultMeta,
  VaultMetaInput,
} from '../../../shared/types.js';
import * as users from '../data/userRepo.js';
import * as storage from '../data/storage.js';
import * as vault from '../data/vaultRepo.js';
import { AppError, conflict, notFound, unauthorized } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';
import { notifyChange, type Ctx } from './context.js';
import { recordAction } from './activityService.js';

/**
 * The Private Vault, server side. The server never sees a passphrase, a key or any plaintext:
 * it stores key material wrapped in the browser and opaque ciphertext. It can't search it, log it,
 * or recover it. Changing key material or wiping the vault also requires the account password.
 */

const fileKey = (uid: string, id: string) => `users/${uid}/vault/${id}.bin`;

async function requirePassword(ctx: Ctx, password: string) {
  const user = await users.findById(ctx.userId);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Your account password is incorrect', 'INVALID_CREDENTIALS');
  }
}

export const getMeta = (ctx: Ctx): Promise<VaultMeta | null> => vault.getMeta(ctx.userId);

/** First-time setup. Refuses if a vault already exists (use change instead). */
export async function setupVault(ctx: Ctx, input: VaultMetaInput): Promise<VaultMeta> {
  if (await vault.getMeta(ctx.userId))
    throw conflict('The vault is already set up', 'VAULT_EXISTS');
  const now = new Date().toISOString();
  const meta: VaultMeta = { version: 1, ...input, createdAt: now, updatedAt: now };
  await vault.setMeta(ctx.userId, meta);
  notifyChange(ctx, 'vault');
  return meta;
}

/** New passphrase: the same vault key, re-wrapped in the browser. Items are untouched. */
export async function changePassphrase(
  ctx: Ctx,
  input: VaultMetaInput,
  password: string,
): Promise<VaultMeta> {
  await requirePassword(ctx, password);
  const current = await vault.getMeta(ctx.userId);
  if (!current) throw notFound('There is no vault yet');
  const meta: VaultMeta = { ...current, ...input, updatedAt: new Date().toISOString() };
  await vault.setMeta(ctx.userId, meta);
  notifyChange(ctx, 'vault');
  return meta;
}

/** Deletes everything in the vault for good (for a forgotten passphrase). */
export async function resetVault(ctx: Ctx, password: string): Promise<void> {
  await requirePassword(ctx, password);
  const ids = await vault.removeAll(ctx.userId);
  await Promise.all(ids.map((id) => storage.deleteFile(fileKey(ctx.userId, id))));
  notifyChange(ctx, 'vault');
}

const toItem = (r: vault.VaultItemRecord): VaultItem => ({ ...r });

export async function listItems(ctx: Ctx): Promise<VaultItem[]> {
  return (await vault.listItems(ctx.userId)).map(toItem);
}

export async function createItem(ctx: Ctx, input: VaultItemInput): Promise<VaultItem> {
  if (!(await vault.getMeta(ctx.userId))) throw notFound('Set up the vault first');
  const now = new Date().toISOString();
  const item = {
    id: vault.newId(ctx.userId),
    iv: input.iv,
    data: input.data,
    createdAt: now,
    updatedAt: now,
  };
  await vault.createItem(ctx.userId, item);
  notifyChange(ctx, 'vault', item.id);
  // Only that something was stored or changed, never what (it is encrypted anyway).
  await recordAction(ctx, 'vault.created', item.id);
  return item;
}

export async function updateItem(ctx: Ctx, id: string, input: VaultItemInput): Promise<VaultItem> {
  const result = await vault.updateItem(
    ctx.userId,
    id,
    { iv: input.iv, data: input.data, updatedAt: new Date().toISOString() },
    input.expectedUpdatedAt,
  );
  if (result.status === 'missing') throw notFound('This vault item no longer exists');
  if (result.status === 'conflict') {
    throw new AppError(
      409,
      'EDIT_CONFLICT',
      'This item was changed on another device. Reload it to see the newer version.',
    );
  }
  notifyChange(ctx, 'vault', id);
  await recordAction(ctx, 'vault.edited', id);
  return result.item;
}

/** Deletes an item and its encrypted file, if it has one. */
export async function deleteItem(ctx: Ctx, id: string): Promise<void> {
  if (!(await vault.removeItem(ctx.userId, id))) throw notFound('This vault item no longer exists');
  await storage.deleteFile(fileKey(ctx.userId, id));
  notifyChange(ctx, 'vault', id);
}

/** Encrypted bytes of a vault document, stored next to its item (same id). */
export async function putFile(ctx: Ctx, id: string, data: Buffer): Promise<void> {
  if (!(await vault.getItem(ctx.userId, id))) throw notFound('This vault item no longer exists');
  await storage.uploadFile(fileKey(ctx.userId, id), data, 'application/octet-stream');
}

export async function openFile(ctx: Ctx, id: string): Promise<Readable> {
  const found = await storage.openFile(fileKey(ctx.userId, id));
  if (!found) throw notFound('This file is missing');
  return found.stream;
}
