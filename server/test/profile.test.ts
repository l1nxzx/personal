import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { ActivityBeat, ProfileStats } from '../../shared/types.js';
import { textStats } from '../src/lib/text.js';
import { recordActivity, SESSION_GAP_MS } from '../src/services/activityService.js';
import { app, signedUpAgent } from './helpers.js';
import { activityDays, seedRaw } from './memory3.js';

const MIN = 60 * 1000;

const profileOf = async (agent: request.Agent): Promise<ProfileStats> =>
  (await agent.get('/api/me/profile').expect(200)).body.profile;

const count = (p: ProfileStats, key: string) => p.content.items.find((c) => c.key === key)?.count;
const writingOf = (p: ProfileStats, key: string) => p.writing.items.find((w) => w.key === key)!;

describe('counting written text', () => {
  it('counts words and characters of the text, not the Markdown around it', () => {
    expect(textStats(['# Heading\n\nSome **bold** and _italic_ words.'])).toEqual({
      textWords: 6,
      textChars: 30, // "Heading" + "Someboldanditalicwords." with spaces left out
    });
    // Links keep their text, images and code blocks are not writing, HTML tags are dropped.
    expect(
      textStats([
        'See [the site](https://example.com) ![pic](a.png)\n\n```\nconst x = 1;\n```\n<br/>end',
      ]),
    ).toEqual({ textWords: 4, textChars: 13 });
    // Lists, quotes, task boxes, rules and table pipes are syntax too.
    expect(textStats(['- [x] done\n> quoted\n\n---\n\n| a | b |\n|---|---|\n| c | d |'])).toEqual({
      textWords: 6,
      textChars: 14,
    });
  });

  it('counts an accented letter or an emoji as one character, and sums several fields', () => {
    expect(textStats(['Café 👍🏽', 'naïve'])).toEqual({ textWords: 2, textChars: 10 });
    expect(textStats(['', '   '])).toEqual({ textWords: 0, textChars: 0 });
    expect(textStats(["don't stop-gap"])).toEqual({ textWords: 2, textChars: 13 });
  });
});

describe('profile statistics', () => {
  it('needs a signed-in user', async () => {
    await request(app).get('/api/me/profile').expect(401);
    await request(app)
      .post('/api/me/activity')
      .send({ beats: [{ id: 'abcdefgh', seconds: 60, ago: 0, date: '2026-10-24' }] })
      .expect(401);
  });

  it('counts every kind of item once and totals the writing across them', async () => {
    const { agent, user } = await signedUpAgent();
    const journal = (
      await agent
        .post('/api/journal')
        .send({ date: '2026-10-01', title: 'A title', body: 'One two three' })
        .expect(201)
    ).body.entry;
    await agent.post('/api/writing').send({ body: 'Four five' }).expect(201);
    await agent.post('/api/notes').send({ body: 'Six' }).expect(201);
    const belief = (
      await agent.post('/api/notes').send({ noteType: 'belief', title: 'On work' }).expect(201)
    ).body.entry;
    await agent
      .patch(`/api/notes/${belief.id}`)
      .send({
        perspectives: [
          {
            id: 'p1',
            date: '2026-10-02',
            position: 'Seven eight',
            reasons: 'nine',
            influences: '',
            uncertainties: '',
          },
        ],
      })
      .expect(200);
    await agent.post('/api/notes').send({ noteType: 'question', body: 'Ten?' }).expect(201);
    await agent.put('/api/reviews/2026-10-05').send({ learned: 'eleven twelve' }).expect(200);
    await agent
      .post('/api/moments')
      .send({ date: '2026-10-03', title: 'Moved', description: 'thirteen' })
      .expect(201);
    const book = (await agent.post('/api/books').send({ title: 'A book' }).expect(201)).body.book;
    await agent
      .patch(`/api/books/${book.id}`)
      .send({
        notes: 'fourteen',
        quotes: [{ id: 'q1', text: 'Not my words at all', page: null, note: '' }],
      })
      .expect(200);
    await agent
      .post('/api/projects')
      .send({ name: 'Garden', description: 'fifteen sixteen' })
      .expect(201);
    const task = (await agent.post('/api/tasks').send({ title: 'Water plants' }).expect(201)).body
      .task;
    await agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    await agent.post('/api/tasks').send({ title: 'Not yet' }).expect(201);

    let p = await profileOf(agent);
    expect(new Date(p.memberSince).getTime()).toBeGreaterThan(Date.now() - MIN);
    expect(count(p, 'journal')).toBe(1);
    expect(count(p, 'note')).toBe(3);
    expect(p.content.noteTypes).toEqual(
      expect.arrayContaining([
        { type: 'note', count: 1 },
        { type: 'belief', count: 1 },
        { type: 'question', count: 1 },
        { type: 'quote', count: 0 },
      ]),
    );
    expect(count(p, 'task')).toBe(2);
    expect(p.content.tasksDone).toBe(1);
    // journal, writing, 3 notes, review, moment, book, project, 2 tasks
    expect(p.content.total).toBe(11);

    // Titles and quoted passages are not counted; belief perspectives are.
    expect(writingOf(p, 'journal')).toEqual({ key: 'journal', words: 3, chars: 11, items: 1 });
    expect(writingOf(p, 'note').words).toBe(5);
    expect(writingOf(p, 'book').words).toBe(1);
    expect(p.writing.words).toBe(16);
    // Entries with text: journal, writing, 3 notes, review, moment (not the book or project).
    expect(p.writing.entries).toBe(7);

    // Edits and deletes show up straight away.
    await agent.patch(`/api/journal/${journal.id}`).send({ body: 'Just one' }).expect(200);
    p = await profileOf(agent);
    expect(writingOf(p, 'journal').words).toBe(2);
    await agent.delete(`/api/journal/${journal.id}`).expect(204);
    p = await profileOf(agent);
    expect(count(p, 'journal')).toBe(0);
    expect(writingOf(p, 'journal')).toEqual({ key: 'journal', words: 0, chars: 0, items: 0 });
    expect(p.writing.words).toBe(13);

    // Another account sees only its own numbers.
    const other = await signedUpAgent(2);
    const q = await profileOf(other.agent);
    expect(q.content.total).toBe(0);
    expect(q.writing.words).toBe(0);
    expect(user.id).not.toBe(other.user.id);
  });

  it('counts writing saved before statistics existed, once, and recounts on request', async () => {
    const { agent, user } = await signedUpAgent();
    seedRaw(user.id, 'journal', 'old1', { title: 'Old', body: 'Written long ago, before stats.' });
    seedRaw(user.id, 'notes', 'old2', { body: 'An old note', noteType: 'note' });

    let p = await profileOf(agent);
    expect(writingOf(p, 'journal')).toEqual({ key: 'journal', words: 5, chars: 27, items: 1 });
    expect(writingOf(p, 'note').words).toBe(3);

    // Counted once: a document changed behind the app's back is only fixed by a recount.
    seedRaw(user.id, 'journal', 'old3', { body: 'Another one' });
    p = await profileOf(agent);
    expect(count(p, 'journal')).toBe(2);
    expect(writingOf(p, 'journal').words).toBe(5);

    p = (await agent.post('/api/me/profile/recount').expect(200)).body.profile;
    expect(writingOf(p, 'journal').words).toBe(7);
  });
});

describe('active time', () => {
  const NOW = Date.parse('2026-10-24T12:00:00Z');
  const DATE = '2026-10-24';
  let n = 0;
  const beat = (seconds: number, agoMs = 0, date = DATE): ActivityBeat => ({
    id: `beat-${++n}-xxxx`,
    seconds,
    ago: Math.round(agoMs / 1000),
    date,
  });
  const statsOf = async (agent: request.Agent) => (await profileOf(agent)).activity;

  it('adds up visible time and counts a repeated beat once', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    const b = beat(60, 2 * MIN);
    expect(await recordActivity(ctx, [b], NOW)).toEqual({ counted: 60 });
    expect(await recordActivity(ctx, [b], NOW + 10_000)).toEqual({ counted: 0 });
    expect(await recordActivity(ctx, [beat(45)], NOW)).toEqual({ counted: 45 });

    const a = await statsOf(agent);
    expect(a.totalSeconds).toBe(105);
    expect(a.days).toBe(1);
    expect(a.sessions).toBe(1);
    expect(a.months).toEqual([
      { month: '2026-10', seconds: 105, days: 1, sections: [], actions: [] },
    ]);
    expect(a.lastActiveAt).toBe(new Date(NOW).toISOString());
  });

  it('counts time once when two tabs or devices are visible at the same time', async () => {
    const { user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat(60)], NOW); // tab A: 11:59–12:00
    // Tab B reports 11:59:30–12:00:30: only the last 30 s are new.
    expect(await recordActivity(ctx, [beat(60)], NOW + 30_000)).toEqual({ counted: 30 });
    // Arriving out of order still overlaps: 11:58:30–11:59:30 → 30 s new.
    expect(await recordActivity(ctx, [beat(60, 60_000)], NOW + 30_000)).toEqual({ counted: 30 });
  });

  it('starts a new session only after 30 minutes without a visible tab', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    // Moving between pages and reloading: a steady stream of beats, one session.
    for (let i = 0; i < 5; i++) await recordActivity(ctx, [beat(60)], NOW + i * MIN);
    // Back after 20 minutes away: same session.
    await recordActivity(ctx, [beat(60)], NOW + 25 * MIN);
    // Back after more than 30 minutes: a new session.
    await recordActivity(ctx, [beat(120)], NOW + 25 * MIN + SESSION_GAP_MS + 3 * MIN);

    const a = await statsOf(agent);
    expect(a.sessions).toBe(2);
    expect(a.totalSeconds).toBe(6 * 60 + 120);
    expect(a.longestSessionSeconds).toBe(6 * 60);
  });

  it('keeps distinct local days and lets a beat sent after a crash count', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat(60, 0, '2026-10-24')], NOW);
    // A stretch from yesterday evening, kept in the browser and sent today.
    expect(await recordActivity(ctx, [beat(50, 15 * 60 * MIN, '2026-10-23')], NOW)).toEqual({
      counted: 50,
    });
    const a = await statsOf(agent);
    expect(a.days).toBe(2);
    expect(a.sessions).toBe(2);
    expect(
      activityDays(user.id)
        .map((d) => d.date)
        .sort(),
    ).toEqual(['2026-10-23', '2026-10-24']);
  });

  it('drops beats with an impossible date and caps a day at 24 hours', async () => {
    const { user } = await signedUpAgent();
    const ctx = { userId: user.id };
    expect(await recordActivity(ctx, [beat(60, 0, '2026-10-20')], NOW)).toEqual({ counted: 0 });
    // 24 h of non-overlapping beats sent late (no overlap memory that far back) stop at the cap.
    const day = Array.from({ length: 20 }, (_, i) =>
      beat(120, 2 * 24 * 60 * MIN - i * 3 * MIN, '2026-10-22'),
    );
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const batch = day.map((b) => ({ ...b, id: `${b.id}-${i}`, ago: b.ago - i * 60 }));
      total += (await recordActivity(ctx, batch, NOW)).counted;
    }
    expect(total).toBe(86_400);
  });

  it('validates beats and records them through the API', async () => {
    const { agent } = await signedUpAgent();
    const date = new Date().toISOString().slice(0, 10);
    await agent.post('/api/me/activity').send({ beats: [] }).expect(400);
    await agent
      .post('/api/me/activity')
      .send({ beats: [{ id: 'abcdefgh', seconds: 3600, ago: 0, date }] })
      .expect(400);
    await agent
      .post('/api/me/activity')
      .send({ beats: [{ id: 'bad id!', seconds: 60, ago: 0, date }] })
      .expect(400);
    const res = await agent
      .post('/api/me/activity')
      .send({ beats: [{ id: 'abcdefgh', seconds: 60, ago: 0, date }] })
      .expect(200);
    expect(res.body).toEqual({ counted: 60 });
    expect((await statsOf(agent)).totalSeconds).toBe(60);
  });

  it('rebuilds the totals from the daily records', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat(60, 0, '2026-10-24')], NOW);
    await recordActivity(ctx, [beat(30, 15 * 60 * MIN, '2026-10-23')], NOW);
    const before = await statsOf(agent);
    const after = (await agent.post('/api/me/profile/recount').expect(200)).body.profile.activity;
    expect(after).toEqual(before);
    expect(after.totalSeconds).toBe(90);
  });
});
