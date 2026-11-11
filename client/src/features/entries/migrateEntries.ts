import type {
  Entry,
  EntryKind,
  EntryVersion,
  EntryVersionSummary,
  ResealEntryRequest,
  SealedBox,
} from '../../../../shared/types';
import { ApiError, apiFetch } from '../../lib/apiFetch';
import { ENTRY_API } from '../../lib/routes';
import { decryptJSON, encryptJSON } from '../../lib/vaultCrypto';

/**
 * Re-seals encrypted entries that the vault key sealed (before the entries key existed) with the
 * entries key: text and every version, in this browser. The server replaces the old ciphertext
 * and refuses if anything sealed with another key was left out. Safe to run again; it only
 * picks up what is still left.
 */
export async function resealLegacyEntries(
  vaultKey: CryptoKey,
  entriesKey: CryptoKey,
  keyId: string,
): Promise<number> {
  const items = (
    await apiFetch<{ items: { kind: EntryKind; id: string }[] }>('/entry-lock/legacy', {
      query: { keyId },
    })
  ).items;
  const reseal = async (box: SealedBox): Promise<SealedBox> => {
    if (box.k === keyId) return box;
    const content = await decryptJSON<unknown>(vaultKey, box);
    return { ...(await encryptJSON(entriesKey, content)), k: keyId };
  };
  for (const { kind, id } of items) {
    for (let attempt = 0; ; attempt++) {
      try {
        const entry = (await apiFetch<{ entry: Entry }>(`${ENTRY_API[kind]}/${id}`)).entry;
        if (!entry.locked || !entry.sealed) break;
        const list = (
          await apiFetch<{ items: EntryVersionSummary[] }>(`${ENTRY_API[kind]}/${id}/versions`)
        ).items;
        const versions: ResealEntryRequest['versions'] = [];
        for (const s of list) {
          const v = (await apiFetch<{ version: EntryVersion }>(`/versions/${s.id}`)).version;
          if (v.sealed && v.sealed.k !== keyId)
            versions.push({ id: v.id, sealed: await reseal(v.sealed) });
        }
        const body: ResealEntryRequest = {
          rev: entry.rev,
          sealed: await reseal(entry.sealed),
          versions,
        };
        await apiFetch(`${ENTRY_API[kind]}/${id}/reseal`, { method: 'POST', body });
        break;
      } catch (err) {
        // Edited or snapshotted meanwhile: read it again and retry.
        if (err instanceof ApiError && err.status === 409 && attempt < 2) continue;
        throw err;
      }
    }
  }
  return items.length;
}
