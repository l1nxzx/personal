import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';
import { ageEntry, stores } from './memory.js';
import request from 'supertest';

const box = (tag: string) => ({ iv: 'AAAAAAAAAAAAAAAA', data: `cipher-${tag}` });

/** Everything stored for one user, as text, to look for readable copies. */
const storedText = () =>
  JSON.stringify([...stores.entries.values()].map((b) => [...b.values()])) +
  JSON.stringify([...stores.versions.values()]);

describe('locked entries', () => {
  it('creates a locked entry without ever receiving its text', async () => {
    const { agent } = await signedUpAgent();
    const res = await agent
      .post('/api/journal')
      .send({ date: '2026-10-31', title: 'Private', sealed: box('a'), anchors: [] })
      .expect(201);
    expect(res.body.entry).toMatchObject({
      locked: true,
      sealed: box('a'),
      body: '',
      tags: [],
      wordCount: 0,
    });
    const list = await agent.get('/api/journal').expect(200);
    expect(list.body.items[0]).toMatchObject({ title: 'Private', locked: true, excerpt: '' });
    expect(list.body.items[0].sealed).toBeUndefined();
  });

  it('refuses readable text for a locked entry, and sealed text for an unlocked one', async () => {
    const { agent } = await signedUpAgent();
    await agent
      .post('/api/writing')
      .send({ title: 'x', body: 'readable', sealed: box('a') })
      .expect(400);
    const locked = (
      await agent
        .post('/api/writing')
        .send({ sealed: box('a') })
        .expect(201)
    ).body.entry;
    await agent.patch(`/api/writing/${locked.id}`).send({ rev: 1, body: 'leak' }).expect(400);
    await agent
      .patch(`/api/writing/${locked.id}`)
      .send({ rev: 1, tags: ['leak'] })
      .expect(400);
    const saved = await agent
      .patch(`/api/writing/${locked.id}`)
      .send({ rev: 1, sealed: box('b'), title: 'Draft' })
      .expect(200);
    expect(saved.body.entry).toMatchObject({ rev: 2, locked: true, sealed: box('b') });

    const open = (await agent.post('/api/writing').send({ body: 'open' }).expect(201)).body.entry;
    await agent
      .patch(`/api/writing/${open.id}`)
      .send({ rev: 1, sealed: box('c') })
      .expect(400);
    await agent
      .post('/api/notes')
      .send({ sealed: box('n') })
      .expect(400);
  });

  it('locking later replaces the text and every version, leaving no readable copy', async () => {
    const { agent, user } = await signedUpAgent();
    const e = (
      await agent
        .post('/api/journal')
        .send({ date: '2026-10-30', title: 'Day', body: 'secret one', tags: ['hidden-tag'] })
        .expect(201)
    ).body.entry;
    ageEntry(user.id, 'journal', e.id, 60 * 60_000);
    await agent.patch(`/api/journal/${e.id}`).send({ rev: 1, body: 'secret two' }).expect(200);
    await agent.post(`/api/journal/${e.id}/versions`).send({ label: 'kept' }).expect(201);
    const versions = (await agent.get(`/api/journal/${e.id}/versions`).expect(200)).body.items;
    expect(versions).toHaveLength(2);
    expect(storedText()).toContain('secret one');

    // A version left out is refused, and nothing changes.
    await agent
      .post(`/api/journal/${e.id}/lock`)
      .send({
        rev: 2,
        sealed: box('e'),
        anchors: [],
        versions: [{ id: versions[0].id, sealed: box('v0') }],
      })
      .expect(409);
    expect(storedText()).toContain('secret one');

    const locked = await agent
      .post(`/api/journal/${e.id}/lock`)
      .send({
        rev: 2,
        sealed: box('e'),
        anchors: [],
        versions: versions.map((v: { id: string }) => ({ id: v.id, sealed: box(v.id) })),
      })
      .expect(200);
    expect(locked.body.entry).toMatchObject({ locked: true, body: '', tags: [], title: 'Day' });
    const text = storedText();
    expect(text).not.toContain('secret');
    expect(text).not.toContain('hidden-tag');
    const v = await agent.get(`/api/versions/${versions[0].id}`).expect(200);
    expect(v.body.version).toMatchObject({ body: '', tags: [], sealed: box(versions[0].id) });

    // Search finds it only by title; tag counts no longer include its tags.
    const tags = await agent.get('/api/journal/tags').expect(200);
    expect(tags.body.items.map((t: { tag: string }) => t.tag)).not.toContain('hidden-tag');
  });

  it('a stale rev conflicts when locking', async () => {
    const { agent } = await signedUpAgent();
    const e = (await agent.post('/api/writing').send({ body: 'x' }).expect(201)).body.entry;
    await agent.patch(`/api/writing/${e.id}`).send({ rev: 1, body: 'y' }).expect(200);
    const res = await agent
      .post(`/api/writing/${e.id}/lock`)
      .send({ rev: 1, sealed: box('e'), anchors: [], versions: [] })
      .expect(409);
    expect(res.body.error.code).toBe('EDIT_CONFLICT');
  });

  it('unlocking restores readable text and versions', async () => {
    const { agent, user } = await signedUpAgent();
    const e = (
      await agent
        .post('/api/writing')
        .send({ sealed: box('a') })
        .expect(201)
    ).body.entry;
    ageEntry(user.id, 'writing', e.id, 60 * 60_000);
    await agent
      .patch(`/api/writing/${e.id}`)
      .send({ rev: 1, sealed: box('b') })
      .expect(200);
    const versions = (await agent.get(`/api/writing/${e.id}/versions`).expect(200)).body.items;
    expect(versions).toHaveLength(1);
    const v0 = (await agent.get(`/api/versions/${versions[0].id}`).expect(200)).body.version;
    expect(v0.sealed).toEqual(box('a'));

    const res = await agent
      .post(`/api/writing/${e.id}/unlock`)
      .send({
        rev: 2,
        body: 'now open',
        tags: ['t'],
        versions: [{ id: versions[0].id, body: 'older', tags: [] }],
      })
      .expect(200);
    expect(res.body.entry).toMatchObject({
      locked: false,
      sealed: null,
      body: 'now open',
      tags: ['t'],
    });
    const v = (await agent.get(`/api/versions/${versions[0].id}`).expect(200)).body.version;
    expect(v).toMatchObject({ body: 'older', sealed: null });
  });

  it('Quick Capture to a day whose entry is locked starts a new entry', async () => {
    const { agent } = await signedUpAgent();
    const locked = (
      await agent
        .post('/api/journal')
        .send({ date: '2026-10-31', sealed: box('a') })
        .expect(201)
    ).body.entry;
    await agent
      .post('/api/inbox/capture')
      .send({ text: 'a thought', kind: 'journal', localDate: '2026-10-31', localTime: '09:00' })
      .expect(201);
    const list = (await agent.get('/api/journal').expect(200)).body.items;
    const after = (await agent.get(`/api/journal/${locked.id}`).expect(200)).body.entry;
    expect(after).toMatchObject({ sealed: box('a'), body: '', rev: 1 });
    expect(list).toHaveLength(2);
    const added = list.find((x: { id: string }) => x.id !== locked.id);
    expect(added).toMatchObject({ locked: false, excerpt: 'a thought' });
  });

  it('requires authentication for lock and unlock', async () => {
    await request(app).post('/api/journal/x/lock').send({}).expect(401);
    await request(app).post('/api/journal/x/unlock').send({}).expect(401);
  });
});
