import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';

describe('journal & writing', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/journal').expect(401);
    await request(app).post('/api/writing').send({}).expect(401);
  });

  it('creates a journal entry with derived fields and returns it', async () => {
    const { agent } = await signedUpAgent();
    const res = await agent
      .post('/api/journal')
      .send({
        date: '2026-10-19',
        title: 'Rain',
        body: '# Evening\n\nA **quiet** walk home.',
        tags: ['Walks', 'walks', '#Life '],
      })
      .expect(201);
    expect(res.body.entry).toMatchObject({
      kind: 'journal',
      date: '2026-10-19',
      title: 'Rain',
      tags: ['walks', 'life'],
      wordCount: 5,
      rev: 1,
    });
    const got = await agent.get(`/api/journal/${res.body.entry.id}`).expect(200);
    expect(got.body.entry.body).toContain('quiet');
  });

  it('requires a date for journal entries but not for writings', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/journal').send({ title: 'x' }).expect(400);
    await agent.post('/api/writing').send({ title: 'Essay' }).expect(201);
  });

  it('autosaves with rev checks and reports conflicts with the stored version', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent.post('/api/writing').send({ title: 'Draft' }).expect(201);
    const id = body.entry.id;

    const first = await agent.patch(`/api/writing/${id}`).send({ rev: 1, body: 'one' }).expect(200);
    expect(first.body.entry.rev).toBe(2);
    expect(first.body.entry.body).toBeUndefined(); // autosave responses stay small

    // A second device still on rev 1:
    const stale = await agent.patch(`/api/writing/${id}`).send({ rev: 1, body: 'two' }).expect(409);
    expect(stale.body.error.code).toBe('EDIT_CONFLICT');
    expect(stale.body.error.details.current).toMatchObject({ body: 'one', rev: 2 });

    // "Keep mine" overwrites without a rev.
    await agent.patch(`/api/writing/${id}`).send({ body: 'two' }).expect(200);
    expect((await agent.get(`/api/writing/${id}`)).body.entry).toMatchObject({
      body: 'two',
      rev: 3,
    });
  });

  it('lists the journal newest first with cursor pagination', async () => {
    const { agent } = await signedUpAgent();
    for (const date of ['2026-10-01', '2026-10-03', '2026-10-02', '2026-10-03']) {
      await agent
        .post('/api/journal')
        .send({ date, body: `entry ${date}` })
        .expect(201);
    }
    const page1 = await agent.get('/api/journal?limit=3').expect(200);
    expect(page1.body.items.map((e: { date: string }) => e.date)).toEqual([
      '2026-10-03',
      '2026-10-03',
      '2026-10-02',
    ]);
    expect(page1.body.items[0].body).toBeUndefined();
    expect(page1.body.items[0].excerpt).toMatch(/^entry/);

    const page2 = await agent
      .get(`/api/journal?limit=3&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .expect(200);
    expect(page2.body.items.map((e: { date: string }) => e.date)).toEqual(['2026-10-01']);
    expect(page2.body.nextCursor).toBeNull();

    const range = await agent.get('/api/journal?from=2026-10-02&to=2026-10-02').expect(200);
    expect(range.body.items).toHaveLength(1);
  });

  it('keeps tag counts in step and filters by tag', async () => {
    const { agent } = await signedUpAgent();
    const a = await agent.post('/api/journal').send({ date: '2026-10-01', tags: ['faith'] });
    await agent.post('/api/journal').send({ date: '2026-10-02', tags: ['faith', 'work'] });

    let tags = (await agent.get('/api/journal/tags')).body.items;
    expect(tags).toEqual([
      { tag: 'faith', count: 2 },
      { tag: 'work', count: 1 },
    ]);

    await agent
      .patch(`/api/journal/${a.body.entry.id}`)
      .send({ tags: ['work'] })
      .expect(200);
    tags = (await agent.get('/api/journal/tags')).body.items;
    expect(tags).toEqual([
      { tag: 'work', count: 2 },
      { tag: 'faith', count: 1 },
    ]);

    const filtered = await agent.get('/api/journal?tag=faith').expect(200);
    expect(filtered.body.items).toHaveLength(1);
  });

  it('pins and archives writings, listing pinned first', async () => {
    const { agent } = await signedUpAgent();
    const a = (await agent.post('/api/writing').send({ title: 'A' })).body.entry;
    const b = (await agent.post('/api/writing').send({ title: 'B' })).body.entry;
    const c = (await agent.post('/api/writing').send({ title: 'C' })).body.entry;

    const pinned = await agent.patch(`/api/writing/${a.id}`).send({ pinned: true }).expect(200);
    // Flags don't count as edits: no rev bump (no conflict for an open editor), same updatedAt.
    expect(pinned.body.entry).toMatchObject({ rev: 1, updatedAt: a.updatedAt, pinned: true });
    await agent.patch(`/api/writing/${a.id}`).send({ rev: 1, body: 'still rev 1' }).expect(200);
    await agent.patch(`/api/writing/${b.id}`).send({ archived: true }).expect(200);

    const active = (await agent.get('/api/writing')).body.items.map(
      (e: { title: string }) => e.title,
    );
    expect(active).toEqual(['A', 'C']);
    const archived = (await agent.get('/api/writing?archived=true')).body.items;
    expect(archived.map((e: { id: string }) => e.id)).toEqual([b.id]);
    expect(c).toBeTruthy();
  });

  it('deletes entries and keeps other users out', async () => {
    const { agent: a } = await signedUpAgent(1);
    const { agent: b } = await signedUpAgent(2);
    const { body } = await a.post('/api/writing').send({ title: 'Mine' }).expect(201);

    await b.get(`/api/writing/${body.entry.id}`).expect(404);
    await b.patch(`/api/writing/${body.entry.id}`).send({ title: 'x' }).expect(404);
    await a.delete(`/api/writing/${body.entry.id}`).expect(204);
    await a.get(`/api/writing/${body.entry.id}`).expect(404);
  });

  it('rejects unknown fields', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent.post('/api/writing').send({}).expect(201);
    await agent.patch(`/api/writing/${body.entry.id}`).send({ rev: 1, owner: 'x' }).expect(400);
  });
});
