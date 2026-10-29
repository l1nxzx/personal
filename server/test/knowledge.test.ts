import { describe, expect, it } from 'vitest';
import { signedUpAgent } from './helpers.js';
import { linkRepo } from './memory.js';

describe('knowledge notes', () => {
  it('creates notes with type, topic and sources', async () => {
    const { agent } = await signedUpAgent();
    const res = await agent
      .post('/api/notes')
      .send({
        title: 'Does prayer change anything?',
        noteType: 'question',
        topic: '  Religion ',
        sources: [{ id: 's1', label: 'Confessions, Book X', url: null }],
      })
      .expect(201);
    expect(res.body.entry).toMatchObject({
      kind: 'note',
      note: {
        noteType: 'question',
        topic: 'Religion',
        sources: [{ label: 'Confessions, Book X' }],
        perspectives: [],
      },
    });
  });

  it('lists by topic and type, and counts topics case-insensitively', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/notes').send({ title: 'A', topic: 'Religion', noteType: 'belief' });
    await agent.post('/api/notes').send({ title: 'B', topic: 'religion', noteType: 'question' });
    await agent.post('/api/notes').send({ title: 'C', topic: 'Stoicism' });
    await agent.post('/api/notes').send({ title: 'D' });

    expect((await agent.get('/api/notes/topics')).body.items).toEqual([
      { topic: 'Religion', count: 2 },
      { topic: 'Stoicism', count: 1 },
    ]);
    const religion = (await agent.get('/api/notes?topic=RELIGION')).body.items;
    expect(religion.map((n: { title: string }) => n.title).sort()).toEqual(['A', 'B']);
    const beliefs = (await agent.get('/api/notes?type=belief')).body.items;
    expect(beliefs.map((n: { title: string }) => n.title)).toEqual(['A']);
    const all = (await agent.get('/api/notes')).body.items;
    expect(all).toHaveLength(4);
    expect(all[0].note).toMatchObject({ noteType: 'note', topic: null });
  });

  it('creates a belief from where you stand alone, and ignores positions on other notes', async () => {
    const { agent } = await signedUpAgent();
    const stand = {
      id: 'p1',
      date: '2026-10-29',
      position: 'Habits beat motivation',
      reasons: '',
      influences: '',
      uncertainties: '',
    };
    const belief = (
      await agent
        .post('/api/notes')
        .send({ title: '', body: '', noteType: 'belief', perspectives: [stand] })
        .expect(201)
    ).body.entry;
    expect(belief.note.perspectives).toEqual([stand]);
    const listed = (await agent.get('/api/notes?type=belief')).body.items;
    expect(listed[0].note.lastConsidered).toBe('2026-10-29');
    expect(listed[0].excerpt).toBe('Habits beat motivation');

    const plain = (
      await agent
        .post('/api/notes')
        .send({ title: 'x', noteType: 'note', perspectives: [stand] })
        .expect(201)
    ).body.entry;
    expect(plain.note.perspectives).toEqual([]);
  });

  it('records perspectives on beliefs without disturbing the open editor (no rev bump)', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/notes')
      .send({ title: 'Free will', noteType: 'belief' });
    const id = body.entry.id;
    const first = {
      id: 'p1',
      date: '2025-03-01',
      position: 'Compatibilism',
      reasons: 'Reading Dennett',
      influences: '',
      uncertainties: 'Determinism',
    };
    const second = { ...first, id: 'p2', date: '2026-10-01', position: 'Less sure now' };

    const r1 = await agent
      .patch(`/api/notes/${id}`)
      .send({ perspectives: [first] })
      .expect(200);
    expect(r1.body.entry.rev).toBe(1);
    await agent
      .patch(`/api/notes/${id}`)
      .send({ perspectives: [first, second] })
      .expect(200);
    // The editor (still on rev 1) can save text without a conflict.
    await agent.patch(`/api/notes/${id}`).send({ rev: 1, body: 'Thinking it over.' }).expect(200);

    const note = (await agent.get(`/api/notes/${id}`)).body.entry;
    expect(note.note.perspectives.map((p: { position: string }) => p.position)).toEqual([
      'Compatibilism',
      'Less sure now',
    ]);
    const listed = (await agent.get('/api/notes?type=belief')).body.items[0];
    expect(listed.note.lastConsidered).toBe('2026-10-01');
    // Perspectives are searchable.
    const found = (await agent.get('/api/me/search?q=compatibilism')).body.items;
    expect(found).toMatchObject([{ type: 'note', id }]);
  });

  it('turns an inbox item into a note', async () => {
    const { agent } = await signedUpAgent();
    const when = { localDate: '2026-10-19', localTime: '10:00' };
    const { body } = await agent
      .post('/api/inbox/capture')
      .send({ text: 'Slow reading as a habit', kind: 'idea', ...when });
    const res = await agent
      .post(`/api/inbox/${body.id}/convert`)
      .send({ to: 'note', ...when })
      .expect(200);
    expect(res.body.destination).toBe('note');
    const note = (await agent.get(`/api/notes/${res.body.id}`)).body.entry;
    expect(note).toMatchObject({ body: 'Slow reading as a habit', tags: ['idea'] });
  });
});

describe('links', () => {
  it('links any two items and shows the link from both sides', async () => {
    const { agent } = await signedUpAgent();
    const note = (await agent.post('/api/notes').send({ title: 'On grace', topic: 'Religion' }))
      .body.entry;
    const journal = (
      await agent.post('/api/journal').send({ date: '2025-01-05', title: 'Old view' })
    ).body.entry;
    const book = (
      await agent.post('/api/books').send({ title: 'Confessions', author: 'Augustine' })
    ).body.book;

    await agent
      .post('/api/links')
      .send({ from: { type: 'note', id: note.id }, to: { type: 'journal', id: journal.id } })
      .expect(204);
    await agent
      .post('/api/links')
      .send({ from: { type: 'note', id: note.id }, to: { type: 'book', id: book.id } })
      .expect(204);

    const fromNote = (await agent.get(`/api/links?type=note&id=${note.id}`)).body.items;
    expect(fromNote).toEqual([
      {
        ref: { type: 'book', id: book.id },
        title: 'Confessions',
        subtitle: 'Augustine',
        direction: 'out',
      },
      {
        ref: { type: 'journal', id: journal.id },
        title: 'Old view',
        subtitle: '2025-01-05',
        direction: 'out',
      },
    ]);
    const fromBook = (await agent.get(`/api/links?type=book&id=${book.id}`)).body.items;
    expect(fromBook).toEqual([
      {
        ref: { type: 'note', id: note.id },
        title: 'On grace',
        subtitle: 'Note · Religion',
        direction: 'in',
      },
    ]);
  });

  it('rejects self-links and links to missing items', async () => {
    const { agent } = await signedUpAgent();
    const note = (await agent.post('/api/notes').send({ title: 'x' })).body.entry;
    const ref = { type: 'note', id: note.id };
    await agent.post('/api/links').send({ from: ref, to: ref }).expect(400);
    await agent
      .post('/api/links')
      .send({ from: ref, to: { type: 'book', id: 'nope' } })
      .expect(404);
    await agent
      .post('/api/links')
      .send({ from: ref, to: { type: 'vault', id: 'x' } })
      .expect(400);
  });

  it('removes links in both directions, and when an item is deleted', async () => {
    const { agent, user } = await signedUpAgent();
    const a = (await agent.post('/api/notes').send({ title: 'A' })).body.entry;
    const b = (await agent.post('/api/writing').send({ title: 'B' })).body.entry;
    const refA = { type: 'note', id: a.id };
    const refB = { type: 'writing', id: b.id };

    await agent.post('/api/links').send({ from: refA, to: refB }).expect(204);
    await agent.post('/api/links/remove').send({ from: refB, to: refA }).expect(204);
    expect((await agent.get(`/api/links?type=note&id=${a.id}`)).body.items).toEqual([]);

    await agent.post('/api/links').send({ from: refA, to: refB }).expect(204);
    await agent.delete(`/api/writing/${b.id}`).expect(204);
    expect(linkRepo.count(user.id)).toBe(0);
  });
});

describe('words linked to files', () => {
  const folder = async (agent: Awaited<ReturnType<typeof signedUpAgent>>['agent'], name: string) =>
    (await agent.post('/api/documents/folders').send({ name, parentId: null }).expect(201)).body
      .folder as { id: string };
  const linkedTo = async (
    agent: Awaited<ReturnType<typeof signedUpAgent>>['agent'],
    path: string,
  ) =>
    (
      (await agent.get(`/api/links?${path}`).expect(200)).body.items as { ref: { id: string } }[]
    ).map((l) => l.ref.id);

  it('links the entry while the words are there, and unlinks it when they are gone', async () => {
    const { agent } = await signedUpAgent();
    const school = await folder(agent, 'School');
    const entry = (
      await agent
        .post('/api/journal')
        .send({ date: '2026-10-29', body: `Filed with the [school papers](folder:${school.id}).` })
        .expect(201)
    ).body.entry;

    // The folder lists the entry (both sides of the link).
    expect(await linkedTo(agent, `type=folder&id=${school.id}`)).toEqual([entry.id]);

    // The words are deleted (or unlinked): the link goes too.
    await agent
      .patch(`/api/journal/${entry.id}`)
      .send({ rev: entry.rev, body: 'Filed with the school papers.' })
      .expect(200);
    expect(await linkedTo(agent, `type=folder&id=${school.id}`)).toEqual([]);
    expect(await linkedTo(agent, `type=journal&id=${entry.id}`)).toEqual([]);
  });

  it('keeps a link added by hand when the linked words go', async () => {
    const { agent } = await signedUpAgent();
    const school = await folder(agent, 'School');
    const entry = (
      await agent
        .post('/api/journal')
        .send({ date: '2026-10-29', body: `See [papers](folder:${school.id}).` })
        .expect(201)
    ).body.entry;
    await agent
      .post('/api/links')
      .send({ from: { type: 'journal', id: entry.id }, to: { type: 'folder', id: school.id } })
      .expect(204);
    await agent
      .patch(`/api/journal/${entry.id}`)
      .send({ rev: entry.rev, body: 'See papers.' })
      .expect(200);
    expect(await linkedTo(agent, `type=journal&id=${entry.id}`)).toEqual([school.id]);
  });

  it('clears links left behind by earlier versions, but never older hand-made ones', async () => {
    const { agent, user } = await signedUpAgent();
    const leftover = await folder(agent, 'Leftover');
    const handMade = await folder(agent, 'Hand made');
    const entry = (
      await agent.post('/api/journal').send({ date: '2026-10-29', body: 'No linked words now.' })
    ).body.entry;
    const self = `journal:${entry.id}`;
    linkRepo.seedLegacy(user.id, self, `folder:${leftover.id}`, '2026-10-29T15:00:00.000Z');
    linkRepo.seedLegacy(user.id, self, `folder:${handMade.id}`, '2026-03-01T09:00:00.000Z');

    expect(await linkedTo(agent, `type=journal&id=${entry.id}`)).toEqual([handMade.id]);
    expect(await linkedTo(agent, `type=folder&id=${leftover.id}`)).toEqual([]);
  });
});
