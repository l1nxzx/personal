import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';
import { memoryFiles } from './memory.js';

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

    const res = await agent
      .post('/api/documents')
      .field('folder', 'Receipts')
      .attach('file', jpeg, { filename: 'Účtenka 1.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const doc = res.body.document;
    expect(doc).toMatchObject({
      name: 'Účtenka 1.jpg',
      mime: 'image/jpeg',
      folder: 'Receipts',
      hasThumb: true,
      previewable: true,
    });

    const file = await binary(agent.get(`/api/documents/${doc.id}/file`)).expect(200);
    expect(file.headers['content-disposition']).toMatch(/^inline/);
    const meta = await sharp(file.body as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(2400);
    expect(meta.exif).toBeUndefined();

    const thumb = await binary(agent.get(`/api/documents/${doc.id}/thumb`)).expect(200);
    expect(thumb.headers['content-type']).toBe('image/webp');

    const dl = await agent.get(`/api/documents/${doc.id}/file?download=1`).expect(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''%C3%9A/);

    expect((await agent.get('/api/documents/folders')).body.items).toEqual([
      { folder: 'Receipts', count: 1 },
    ]);
    expect((await agent.get('/api/documents?folder=Receipts')).body.items).toHaveLength(1);
    expect((await agent.get('/api/me/search?q=uctenka')).body.items).toMatchObject([
      { type: 'document', id: doc.id },
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
    await agent
      .patch(`/api/documents/${id}`)
      .send({ name: 'Lease 2026.pdf', favorite: true, folder: 'Home' })
      .expect(200);
    expect((await agent.get('/api/documents?favorite=true')).body.items).toMatchObject([
      { name: 'Lease 2026.pdf', folder: 'Home' },
    ]);

    await agent.delete(`/api/documents/${id}`).expect(204);
    expect(memoryFiles.size).toBe(0);
    expect((await agent.get('/api/documents/folders')).body.items).toEqual([]);
  });

  it('rejects uploads without a file', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/documents').field('folder', 'x').expect(400);
  });
});
