import { Router } from 'express';
import { z } from 'zod';
import type { EntryKind } from '../../../shared/types.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as entryService from '../services/entryService.js';
import * as versionService from '../services/versionService.js';
import { idParams, localDate, tagList } from './schemas.js';

const MAX_BODY = 200_000;
/** Base64 AES-GCM of a body up to MAX_BODY (JSON with tags), with room to spare. */
const sealedBox = z.object({
  iv: z.string().min(16).max(32),
  data: z.string().min(1).max(1_200_000),
  /** The entries key that sealed it (absent: the vault key, before the entries key existed). */
  k: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
});
const anchors = z.array(z.string().regex(/^(document|folder):[A-Za-z0-9_-]{1,64}$/)).max(500);

const noteType = z.enum(['note', 'question', 'belief', 'quote', 'decision']);
const decision = z
  .object({
    madeOn: localDate.nullable(),
    reasons: z.string().max(20_000),
    expected: z.string().max(20_000),
    revisitOn: localDate.nullable(),
    outcome: z.string().max(20_000),
    outcomeOn: localDate.nullable(),
  })
  .nullable();
const topic = z.string().max(80).nullable();
const sources = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().max(300),
      url: z.string().url().max(2000).nullable(),
    }),
  )
  .max(50);
const perspectives = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      date: localDate,
      position: z.string().max(20_000),
      reasons: z.string().max(20_000),
      influences: z.string().max(20_000),
      uncertainties: z.string().max(20_000),
    }),
  )
  .max(200);

const createBody = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(MAX_BODY).optional(),
  date: localDate.optional(),
  tags: tagList.optional(),
  noteType: noteType.optional(),
  topic: topic.optional(),
  sources: sources.optional(),
  /** Beliefs: where you stand can be written before anything else. */
  perspectives: perspectives.optional(),
  /** Created locked: the text arrives encrypted, never readable. */
  sealed: sealedBox.optional(),
  anchors: anchors.optional(),
});

const updateBody = z
  .object({
    rev: z.number().int().positive().optional(),
    title: z.string().max(300).optional(),
    body: z.string().max(MAX_BODY).optional(),
    date: localDate.optional(),
    tags: tagList.optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    noteType: noteType.optional(),
    topic: topic.optional(),
    sources: sources.optional(),
    perspectives: perspectives.optional(),
    decision: decision.optional(),
    sealed: sealedBox.optional(),
    anchors: anchors.optional(),
  })
  .strict();

const lockBody = z
  .object({
    rev: z.number().int().positive(),
    sealed: sealedBox,
    anchors,
    versions: z.array(z.object({ id: z.string().min(1).max(64), sealed: sealedBox })).max(1000),
  })
  .strict();

const resealBody = z
  .object({
    rev: z.number().int().positive(),
    sealed: sealedBox,
    versions: z.array(z.object({ id: z.string().min(1).max(64), sealed: sealedBox })).max(1000),
  })
  .strict();

const unlockBody = z
  .object({
    rev: z.number().int().positive(),
    body: z.string().max(MAX_BODY),
    tags: tagList,
    versions: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          body: z.string().max(MAX_BODY),
          tags: tagList,
          label: z.string().max(120).nullable(),
        }),
      )
      .max(1000),
  })
  .strict();

const journalQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
  from: localDate.optional(),
  to: localDate.optional(),
  tag: z.string().max(64).optional(),
});
type JournalQuery = z.infer<typeof journalQuery>;

const writingQuery = z.object({
  archived: z.enum(['true', 'false']).default('false'),
  tag: z.string().max(64).optional(),
});
type WritingQuery = z.infer<typeof writingQuery>;

const notesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().max(200).optional(),
  topic: z.string().max(80).optional(),
  type: noteType.optional(),
  tag: z.string().max(64).optional(),
});
type NotesQuery = z.infer<typeof notesQuery>;

/** Same CRUD for /api/journal, /api/writing and /api/notes; only listing differs. */
function entryRoutes(kind: EntryKind) {
  const router = Router();
  router.use(authenticate, requirePermission('content:manage-own'));

  if (kind === 'journal') {
    router.get(
      '/',
      validate({ query: journalQuery }),
      asyncHandler(async (req, res) => {
        res.json(await entryService.listJournal(ctxOf(req), req.query as unknown as JournalQuery));
      }),
    );
  } else if (kind === 'note') {
    router.get(
      '/',
      validate({ query: notesQuery }),
      asyncHandler(async (req, res) => {
        res.json(await entryService.listNotes(ctxOf(req), req.query as unknown as NotesQuery));
      }),
    );
    router.get(
      '/topics',
      asyncHandler(async (req, res) => {
        res.json({ items: await entryService.listTopics(ctxOf(req)) });
      }),
    );
  } else {
    router.get(
      '/',
      validate({ query: writingQuery }),
      asyncHandler(async (req, res) => {
        const q = req.query as unknown as WritingQuery;
        res.json({
          items: await entryService.listWritings(ctxOf(req), {
            archived: q.archived === 'true',
            tag: q.tag,
          }),
        });
      }),
    );
  }

  router.get(
    '/tags',
    asyncHandler(async (req, res) => {
      res.json({ items: await entryService.listTags(ctxOf(req), kind) });
    }),
  );

  router.post(
    '/',
    validate({ body: createBody }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ entry: await entryService.createEntry(ctxOf(req), kind, req.body) });
    }),
  );

  router.get(
    '/:id',
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      res.json({ entry: await entryService.getEntry(ctxOf(req), kind, req.params.id!) });
    }),
  );

  /** Earlier versions (version history). */
  router.get(
    '/:id/versions',
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      res.json({ items: await versionService.listVersions(ctxOf(req), kind, req.params.id!) });
    }),
  );

  /** "Keep this version": a snapshot by hand, with an optional label. */
  router.post(
    '/:id/versions',
    validate({
      params: idParams,
      body: z.object({
        label: z.string().max(120).nullable().optional(),
        /** Locked entries: the text and label, encrypted in the browser (no readable label). */
        sealed: sealedBox.optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      res.status(201).json({
        version: await versionService.saveVersion(
          ctxOf(req),
          kind,
          req.params.id!,
          req.body.label ?? null,
          req.body.sealed,
        ),
      });
    }),
  );

  router.patch(
    '/:id',
    validate({ params: idParams, body: updateBody }),
    asyncHandler(async (req, res) => {
      res.json({
        entry: await entryService.updateEntry(ctxOf(req), kind, req.params.id!, req.body),
      });
    }),
  );

  if (kind !== 'note') {
    /** Lock with the PIN: the text and all versions arrive encrypted, replacing readable ones. */
    router.post(
      '/:id/lock',
      validate({ params: idParams, body: lockBody }),
      asyncHandler(async (req, res) => {
        res.json({
          entry: await entryService.lockEntry(ctxOf(req), kind, req.params.id!, req.body),
        });
      }),
    );
    /** Migration: re-sealed with the entries key, replacing what the vault key sealed. */
    router.post(
      '/:id/reseal',
      validate({ params: idParams, body: resealBody }),
      asyncHandler(async (req, res) => {
        res.json({
          entry: await entryService.resealEntry(ctxOf(req), kind, req.params.id!, req.body),
        });
      }),
    );
    router.post(
      '/:id/unlock',
      validate({ params: idParams, body: unlockBody }),
      asyncHandler(async (req, res) => {
        res.json({
          entry: await entryService.unlockEntry(ctxOf(req), kind, req.params.id!, req.body),
        });
      }),
    );
  }

  router.delete(
    '/:id',
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      await entryService.deleteEntry(ctxOf(req), kind, req.params.id!);
      res.status(204).end();
    }),
  );

  return router;
}

export const journalRoutes = entryRoutes('journal');
export const writingRoutes = entryRoutes('writing');
export const noteRoutes = entryRoutes('note');

/** One stored version, with its full text. */
export const versionRoutes = Router();
versionRoutes.use(authenticate, requirePermission('content:manage-own'));
versionRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ version: await versionService.getVersion(ctxOf(req), req.params.id!) });
  }),
);
