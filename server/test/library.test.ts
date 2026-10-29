import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';
import { memoryFiles, seedLegacyDocument } from './memory.js';

const binary = (r: request.Test): request.Test =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  }) as request.Test;

describe('books', () => {
  it('adds a book, moves it along, fills dates and keeps quotes', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/books')
      .send({ title: 'Meditations', author: 'Marcus Aurelius' })
      .expect(201);
    const id = body.book.id;
    expect(body.book).toMatchObject({ status: 'want', startedOn: null, quotes: [] });

    const reading = await agent.patch(`/api/books/${id}`).send({ status: 'reading' }).expect(200);
    expect(reading.body.book.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await agent
      .patch(`/api/books/${id}`)
      .send({
        quotes: [
          {
            id: 'q1',
            text: 'Waste no more time arguing what a good man should be.',
            page: '10.16',
            note: '',
          },
        ],
        rating: 5,
      })
      .expect(200);

    const list = (await agent.get('/api/books?status=reading')).body.items;
    expect(list).toMatchObject([{ id, quoteCount: 1, rating: 5 }]);
    expect((await agent.get('/api/books?status=want')).body.items).toEqual([]);
    await agent.patch(`/api/books/${id}`).send({ rating: 9 }).expect(400);
  });

  it('turns a quote into a linked quote note', async () => {
    const { agent } = await signedUpAgent();
    const book = (
      await agent.post('/api/books').send({ title: 'Confessions', author: 'Augustine' })
    ).body.book;
    await agent
      .patch(`/api/books/${book.id}`)
      .send({ quotes: [{ id: 'q1', text: 'Our heart is restless', page: '1', note: '' }] });

    const res = await agent.post(`/api/books/${book.id}/quotes/q1/note`).expect(201);
    expect(res.body.entry).toMatchObject({
      body: '> Our heart is restless',
      note: { noteType: 'quote', sources: [{ label: 'Augustine, Confessions, p. 1' }] },
    });
    const linked = (await agent.get(`/api/links?type=book&id=${book.id}`)).body.items;
    expect(linked).toMatchObject([
      { ref: { type: 'note', id: res.body.entry.id }, direction: 'in' },
    ]);
  });
});

describe('documents', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/documents').expect(401);
  });

  it('uploads an image: resized, metadata stripped, thumbnail made, shown inline', async () => {
    const { agent } = await signedUpAgent();
    const jpeg = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#557799' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } })
      .toBuffer();

    const folder = (
      await agent.post('/api/documents/folders').send({ name: 'Receipts' }).expect(201)
    ).body.folder;
    const res = await agent
      .post('/api/documents')
      .field('folderId', folder.id)
      .attach('file', jpeg, { filename: 'Účtenka 1.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const doc = res.body.document;
    expect(doc).toMatchObject({
      name: 'Účtenka 1.jpg',
      mime: 'image/jpeg',
      folderId: folder.id,
      hasThumb: true,
      previewable: true,
    });

    const file = await binary(agent.get(`/api/documents/${doc.id}/file`)).expect(200);
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    expect(file.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    const meta = await sharp(file.body as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(2400);
    expect(meta.exif).toBeUndefined();

    const thumb = await binary(agent.get(`/api/documents/${doc.id}/thumb`)).expect(200);
    expect(thumb.headers['content-type']).toBe('image/webp');

    const dl = await agent.get(`/api/documents/${doc.id}/file?download=1`).expect(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''%C3%9A/);

    expect((await agent.get(`/api/documents?folderId=${folder.id}`)).body.items).toHaveLength(1);
    expect((await agent.get('/api/documents?folderId=root')).body.items).toEqual([]);
    expect((await agent.get('/api/me/search?q=uctenka')).body.items).toMatchObject([
      { type: 'document', id: doc.id, snippet: 'Receipts' },
    ]);
  });

  it('never serves risky types inline', async () => {
    const { agent } = await signedUpAgent();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const { body } = await agent
      .post('/api/documents')
      .attach('file', svg, { filename: 'x.svg', contentType: 'image/svg+xml' })
      .expect(201);
    expect(body.document).toMatchObject({ previewable: false, hasThumb: false });
    const res = await agent.get(`/api/documents/${body.document.id}/file`).expect(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('renames, favorites, moves and deletes (including stored bytes)', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/documents')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      });
    const id = body.document.id;
    expect(body.document.folderId).toBeNull();
    const home = (await agent.post('/api/documents/folders').send({ name: 'Home' })).body.folder;
    await agent
      .patch(`/api/documents/${id}`)
      .send({ name: 'Lease 2026.pdf', favorite: true, folderId: home.id })
      .expect(200);
    expect((await agent.get('/api/documents?favorite=true')).body.items).toMatchObject([
      { name: 'Lease 2026.pdf', folderId: home.id },
    ]);
    await agent.patch(`/api/documents/${id}`).send({ folderId: 'nope' }).expect(404);

    await agent.delete(`/api/documents/${id}`).expect(204);
    expect(memoryFiles.size).toBe(0);
  });

  it('rejects uploads without a file, or into a folder that does not exist', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/documents').field('folderId', 'x').expect(400);
    await agent
      .post('/api/documents')
      .field('folderId', 'missing')
      .attach('file', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(404);
    expect(memoryFiles.size).toBe(0);
  });

  it('serves byte ranges so video can play and seek', async () => {
    const { agent } = await signedUpAgent();
    const bytes = Buffer.from('0123456789');
    const { body } = await agent
      .post('/api/documents')
      .attach('file', bytes, { filename: 'clip.mp4', contentType: 'video/mp4' })
      .expect(201);
    expect(body.document.previewable).toBe(true);
    const url = `/api/documents/${body.document.id}/file`;
    const part = await binary(agent.get(url).set('Range', 'bytes=2-5')).expect(206);
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    expect((part.body as Buffer).toString()).toBe('2345');
    const tail = await binary(agent.get(url).set('Range', 'bytes=7-')).expect(206);
    expect((tail.body as Buffer).toString()).toBe('789');
    const whole = await binary(agent.get(url)).expect(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect((whole.body as Buffer).toString()).toBe('0123456789');
  });
});

describe('library folders', () => {
  const upload = (agent: request.Agent, name: string, folderId?: string) => {
    const r = agent.post('/api/documents');
    if (folderId) r.field('folderId', folderId);
    return r
      .attach('file', Buffer.from(`%PDF ${name}`), {
        filename: name,
        contentType: 'application/pdf',
      })
      .expect(201)
      .then((res) => res.body.document as { id: string; folderId: string | null });
  };
  const mkdir = (agent: request.Agent, name: string, parentId: string | null = null) =>
    agent
      .post('/api/documents/folders')
      .send({ name, parentId })
      .expect(201)
      .then((res) => res.body.folder as { id: string; name: string; parentId: string | null });
  const names = async (agent: request.Agent, folderId = 'root') =>
    ((await agent.get(`/api/documents?folderId=${folderId}`)).body.items as { name: string }[])
      .map((d) => d.name)
      .sort();

  it('creates nested folders, refuses duplicate names among siblings', async () => {
    const { agent } = await signedUpAgent();
    const taxes = await mkdir(agent, 'Taxes');
    const y2025 = await mkdir(agent, '2025', taxes.id);
    expect(y2025.parentId).toBe(taxes.id);
    await mkdir(agent, '2025'); // same name, different parent: fine

    const dup = await agent
      .post('/api/documents/folders')
      .send({ name: ' taxes ', parentId: null })
      .expect(409);
    expect(dup.body.error.code).toBe('FOLDER_NAME_TAKEN');
    await agent.post('/api/documents/folders').send({ name: '   ' }).expect(400);
    await agent.post('/api/documents/folders').send({ name: 'x', parentId: 'gone' }).expect(404);

    const all = (await agent.get('/api/documents/folders')).body.items;
    expect(all).toHaveLength(3);
    await agent.get('/api/documents?folderId=gone').expect(404);
  });

  it('renames and moves folders, and refuses moving a folder into itself', async () => {
    const { agent } = await signedUpAgent();
    const a = await mkdir(agent, 'A');
    const b = await mkdir(agent, 'B', a.id);
    const c = await mkdir(agent, 'C', b.id);

    const renamed = await agent.patch(`/api/documents/folders/${a.id}`).send({ name: 'Alpha' });
    expect(renamed.body.folder).toMatchObject({ name: 'Alpha', parentId: null });

    for (const target of [a.id, c.id]) {
      const res = await agent
        .post('/api/documents/move')
        .send({ folderIds: [a.id], targetId: target })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_MOVE');
    }
    await agent.patch(`/api/documents/folders/${b.id}`).send({ parentId: c.id }).expect(400);

    // Move C up to the top level; B keeps its place.
    await agent.patch(`/api/documents/folders/${c.id}`).send({ parentId: null }).expect(200);
    const all = (await agent.get('/api/documents/folders')).body.items as {
      id: string;
      parentId: string | null;
    }[];
    expect(all.find((f) => f.id === c.id)?.parentId).toBeNull();
    expect(all.find((f) => f.id === b.id)?.parentId).toBe(a.id);

    // A name clash at the destination is refused rather than silently duplicated.
    const other = await mkdir(agent, 'B');
    const clash = await agent
      .post('/api/documents/move')
      .send({ folderIds: [b.id], targetId: null })
      .expect(409);
    expect(clash.body.error.code).toBe('FOLDER_NAME_TAKEN');
    expect(other.parentId).toBeNull();
  });

  it('moves files between folders without touching the stored bytes', async () => {
    const { agent } = await signedUpAgent();
    const inbox = await mkdir(agent, 'Inbox');
    const archive = await mkdir(agent, 'Archive');
    const one = await upload(agent, 'one.pdf', inbox.id);
    const two = await upload(agent, 'two.pdf', inbox.id);
    const filesBefore = new Map(memoryFiles);

    const res = await agent
      .post('/api/documents/move')
      .send({ fileIds: [one.id, two.id], folderIds: [], targetId: archive.id })
      .expect(200);
    expect(res.body).toEqual({ files: 2, folders: 0 });
    expect(await names(agent, inbox.id)).toEqual([]);
    expect(await names(agent, archive.id)).toEqual(['one.pdf', 'two.pdf']);
    expect(memoryFiles).toEqual(filesBefore); // same paths, same bytes, nothing re-uploaded
    await binary(agent.get(`/api/documents/${one.id}/file`)).expect(200);

    await agent
      .post('/api/documents/move')
      .send({ fileIds: [one.id], targetId: null })
      .expect(200);
    expect(await names(agent)).toEqual(['one.pdf']);
    await agent
      .post('/api/documents/move')
      .send({ fileIds: [one.id], targetId: 'gone' })
      .expect(404);
  });

  it('adds up stored bytes per folder, through every level below it', async () => {
    const { agent } = await signedUpAgent();
    const parent = await mkdir(agent, 'Parent');
    const child = await mkdir(agent, 'Child', parent.id);
    const empty = await mkdir(agent, 'Empty');
    await upload(agent, 'a.pdf', parent.id); // "%PDF a.pdf" = 10 bytes
    await upload(agent, 'bb.pdf', child.id); // 11 bytes
    await upload(agent, 'top.pdf'); // 12 bytes, at the top level

    const { sizes } = (await agent.get('/api/documents/folders/sizes').expect(200)).body;
    expect(sizes.folders[parent.id]).toEqual({ bytes: 21, files: 2 });
    expect(sizes.folders[child.id]).toEqual({ bytes: 11, files: 1 });
    expect(sizes.folders[empty.id]).toBeUndefined();
    expect(sizes.total).toEqual({ bytes: 33, files: 3 });
  });

  it('never deletes a non-empty folder unless asked what to do with its contents', async () => {
    const { agent } = await signedUpAgent();
    const parent = await mkdir(agent, 'Parent');
    const box = await mkdir(agent, 'Box', parent.id);
    const inner = await mkdir(agent, 'Inner', box.id);
    await mkdir(agent, 'Inner', parent.id); // clashes when Box's contents move up
    await upload(agent, 'a.pdf', box.id);
    await upload(agent, 'b.pdf', inner.id);

    const refused = await agent.delete(`/api/documents/folders/${box.id}`).expect(409);
    expect(refused.body.error).toMatchObject({
      code: 'FOLDER_NOT_EMPTY',
      details: { files: 2, folders: 1 },
    });
    expect((await agent.post('/api/documents/folders/usage').send({ ids: [box.id] })).body).toEqual(
      { files: 2, folders: 1 },
    );

    await agent.delete(`/api/documents/folders/${box.id}?contents=move`).expect(204);
    expect(await names(agent, parent.id)).toEqual(['a.pdf']);
    const folders = (await agent.get('/api/documents/folders')).body.items as {
      id: string;
      name: string;
      parentId: string | null;
    }[];
    expect(folders.find((f) => f.id === box.id)).toBeUndefined();
    expect(folders.find((f) => f.id === inner.id)).toMatchObject({
      name: 'Inner (2)',
      parentId: parent.id,
    });
    expect(await names(agent, inner.id)).toEqual(['b.pdf']);
    expect(memoryFiles.size).toBe(2); // nothing stored was lost

    const empty = await mkdir(agent, 'Empty');
    await agent.delete(`/api/documents/folders/${empty.id}`).expect(204);
  });

  it('deletes a folder with everything in it only when explicitly asked', async () => {
    const { agent } = await signedUpAgent();
    const top = await mkdir(agent, 'Top');
    const sub = await mkdir(agent, 'Sub', top.id);
    await upload(agent, 'a.pdf', top.id);
    await upload(agent, 'b.pdf', sub.id);
    const kept = await upload(agent, 'kept.pdf');

    await agent.delete(`/api/documents/folders/${top.id}?contents=delete`).expect(204);
    expect((await agent.get('/api/documents/folders')).body.items).toEqual([]);
    expect(memoryFiles.size).toBe(1);
    expect(await names(agent)).toEqual(['kept.pdf']);

    // Bulk delete: files and folders together.
    const f = await mkdir(agent, 'F');
    await upload(agent, 'c.pdf', f.id);
    await agent
      .post('/api/documents/delete')
      .send({ fileIds: [kept.id], folderIds: [f.id] })
      .expect(204);
    expect(memoryFiles.size).toBe(0);
    expect((await agent.get('/api/documents/folders')).body.items).toEqual([]);
  });

  it('searches files by name across all folders', async () => {
    const { agent } = await signedUpAgent();
    const f = await mkdir(agent, 'Deep');
    await upload(agent, 'Insurance policy 2026.pdf', f.id);
    await upload(agent, 'Insurance card.pdf');
    await upload(agent, 'Recipe.pdf');
    const hits = (await agent.get('/api/documents?q=insur pol')).body.items;
    expect(hits).toMatchObject([{ name: 'Insurance policy 2026.pdf', folderId: f.id }]);
    expect((await agent.get('/api/documents?q=insurance')).body.items).toHaveLength(2);
  });

  it('links folders to notes both ways, finds them in search, unlinks on delete', async () => {
    const { agent } = await signedUpAgent();
    const taxes = await mkdir(agent, 'Taxes');
    const y2025 = await mkdir(agent, 'Tax year 2025', taxes.id);
    const note = (await agent.post('/api/notes').send({ title: 'Filing plan' }).expect(201)).body
      .entry;

    await agent
      .post('/api/links')
      .send({ from: { type: 'note', id: note.id }, to: { type: 'folder', id: y2025.id } })
      .expect(204);
    expect((await agent.get(`/api/links?type=note&id=${note.id}`)).body.items).toMatchObject([
      {
        ref: { type: 'folder', id: y2025.id },
        title: 'Tax year 2025',
        subtitle: 'Folder in Taxes',
      },
    ]);
    expect((await agent.get(`/api/links?type=folder&id=${y2025.id}`)).body.items).toMatchObject([
      { ref: { type: 'note', id: note.id }, direction: 'in' },
    ]);
    await agent
      .post('/api/links')
      .send({ from: { type: 'note', id: note.id }, to: { type: 'folder', id: 'gone' } })
      .expect(404);

    const found = (await agent.get('/api/me/search?q=tax year')).body.items;
    expect(found).toMatchObject([{ type: 'folder', id: y2025.id, snippet: 'Taxes' }]);

    await agent.delete(`/api/documents/folders/${taxes.id}?contents=delete`).expect(204);
    expect((await agent.get(`/api/links?type=note&id=${note.id}`)).body.items).toEqual([]);
  });

  it('keeps folders separate per user', async () => {
    const { agent: a } = await signedUpAgent(1);
    const { agent: b } = await signedUpAgent(2);
    const mine = await mkdir(a, 'Private');
    await b.get(`/api/documents?folderId=${mine.id}`).expect(404);
    await b.patch(`/api/documents/folders/${mine.id}`).send({ name: 'x' }).expect(404);
    await b.delete(`/api/documents/folders/${mine.id}`).expect(404);
    const d = await upload(b, 'x.pdf');
    await b
      .post('/api/documents/move')
      .send({ fileIds: [d.id], targetId: mine.id })
      .expect(404);
  });

  it('turns old folder names into real folders the first time the library is opened', async () => {
    const { agent, user } = await signedUpAgent();
    const now = new Date().toISOString();
    const legacy = (id: string, name: string, folder: string | null) =>
      seedLegacyDocument(user.id, {
        id,
        name,
        folder,
        mime: 'application/pdf',
        size: 4,
        tags: [],
        favorite: false,
        storagePath: `users/${user.id}/documents/${id}/file`,
        thumbPath: null,
        createdAt: now,
        updatedAt: now,
        searchTerms: [],
      });
    legacy('d1', 'w2.pdf', 'Taxes');
    legacy('d2', 'w3.pdf', 'Taxes');
    legacy('d3', 'lease.pdf', 'Home');
    legacy('d4', 'loose.pdf', null);

    const folders = (await agent.get('/api/documents/folders')).body.items as {
      id: string;
      name: string;
    }[];
    expect(folders.map((f) => f.name)).toEqual(['Home', 'Taxes']);
    const taxes = folders.find((f) => f.name === 'Taxes')!;
    expect(await names(agent, taxes.id)).toEqual(['w2.pdf', 'w3.pdf']);
    expect(await names(agent)).toEqual(['loose.pdf']);
    // Search terms are rebuilt for old files too.
    expect((await agent.get('/api/documents?q=lease')).body.items).toHaveLength(1);

    // Running again changes nothing.
    expect((await agent.get('/api/documents/folders')).body.items).toHaveLength(2);
  });
});
