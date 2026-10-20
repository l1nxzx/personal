import { createHash } from 'node:crypto';
import * as documents from '../data/documentRepo.js';
import * as folders from '../data/folderRepo.js';
import { logger } from '../lib/logger.js';
import { buildSearchTerms } from '../lib/text.js';

/** Users whose library is known to be migrated in this process (saves a read per request). */
const done = new Set<string>();

/** Search terms for a file: its name (split on . _ -) and tags. Folder names are not included. */
export const documentTerms = (d: { name: string; tags: string[] }) =>
  buildSearchTerms(d.name.replace(/[._-]+/g, ' '), d.tags.join(' '));

/** Same name → same id, so a re-run (or two concurrent runs) writes the same folder docs. */
const legacyFolderId = (name: string) =>
  `lf${createHash('sha256').update(name).digest('hex').slice(0, 26)}`;

/**
 * Files used to carry a free-text `folder` name. The first time a library is opened after the
 * change, each distinct name becomes a top-level folder and every file gets a `folderId`.
 * Additive only: no file, byte or old field is deleted, and running it twice changes nothing.
 */
export async function ensureLibraryMigrated(uid: string): Promise<void> {
  if (done.has(uid)) return;
  if (!(await folders.isMigrated(uid))) {
    const unplaced = await documents.listUnplaced(uid);
    const now = new Date().toISOString();
    const byName = new Map<string, folders.FolderRecord>();
    for (const d of unplaced) {
      const name = d.legacyFolder?.trim();
      if (name && !byName.has(name)) {
        byName.set(name, {
          id: legacyFolderId(name),
          name,
          parentId: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await folders.putMany(uid, [...byName.values()]);
    await documents.placeMany(
      uid,
      unplaced.map((d) => {
        const name = d.legacyFolder?.trim();
        return {
          id: d.id,
          folderId: name ? byName.get(name)!.id : null,
          searchTerms: documentTerms(d),
        };
      }),
    );
    await folders.markMigrated(uid);
    if (unplaced.length) {
      logger.info(
        { files: unplaced.length, folders: byName.size },
        'library: moved files into folder documents',
      );
    }
  }
  done.add(uid);
}
