import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type {
  ActivityBeat,
  ProfileStats,
  UsageAction,
  UsageRange,
  UsageSection,
} from '../../shared/types.js';
import { plausibleLocalDate } from '../src/services/context.js';
import { recordAction, recordActivity } from '../src/services/activityService.js';
import { createEntry } from '../src/services/entryService.js';
import { activityDays } from './memory3.js';
import { app, signedUpAgent } from './helpers.js';

const MIN = 60 * 1000;
const NOW = Date.parse('2026-10-24T12:00:00Z');
const DATE = '2026-10-24';

let n = 0;
const beat = (
  section: UsageSection | undefined,
  seconds: number,
  agoMs = 0,
  opts: { visit?: boolean; date?: string } = {},
): ActivityBeat => ({
  id: `usage-${++n}-xxxx`,
  seconds,
  ago: Math.round(agoMs / 1000),
  date: opts.date ?? DATE,
  ...(section && { section }),
  ...(opts.visit && { visit: true }),
});

const profileOf = async (agent: request.Agent): Promise<ProfileStats> =>
  (await agent.get('/api/me/profile').expect(200)).body.profile;
const rangeOf = async (agent: request.Agent, from: string, to: string): Promise<UsageRange> =>
  (await agent.get('/api/me/usage').query({ from, to }).expect(200)).body.usage;
const sectionOf = (p: ProfileStats, s: UsageSection) =>
  p.activity.sections.find((x) => x.section === s);
const actionOf = (list: { action: UsageAction; count: number }[], a: UsageAction) =>
  list.find((x) => x.action === a)?.count ?? 0;

describe('time per section', () => {
  it('gives each stretch to the section that was on screen, and counts visits', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    // Journal for two minutes (one visit, two stretches), then Projects for 40 s.
    await recordActivity(
      ctx,
      [beat('journal', 60, 100_000, { visit: true }), beat('journal', 60, 40_000)],
      NOW,
    );
    await recordActivity(ctx, [beat('projects', 40, 0, { visit: true })], NOW);

    const p = await profileOf(agent);
    expect(p.activity.totalSeconds).toBe(160);
    expect(sectionOf(p, 'journal')).toMatchObject({ seconds: 120, visits: 1 });
    expect(sectionOf(p, 'projects')).toMatchObject({ seconds: 40, visits: 1 });
    expect(sectionOf(p, 'projects')!.lastAt).toBe(new Date(NOW).toISOString());
    // Most time first.
    expect(p.activity.sections.map((s) => s.section)).toEqual(['journal', 'projects']);
    expect(p.activity.sectionsSince).toBe(new Date(NOW - 160_000).toISOString());
    expect(p.activity.months[0]!.sections).toEqual([
      { section: 'journal', seconds: 120, visits: 1 },
      { section: 'projects', seconds: 40, visits: 1 },
    ]);
  });

  it('counts a stretch and its visit once, even when sent twice', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    const b = beat('ideas', 60, 0, { visit: true });
    await recordActivity(ctx, [b], NOW);
    await recordActivity(ctx, [b], NOW + 5_000);
    expect(sectionOf(await profileOf(agent), 'ideas')).toMatchObject({ seconds: 60, visits: 1 });
  });

  it('gives time two visible tabs share to the first one reported, and only once', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    // Two windows side by side: Journal 11:59–12:00, Money 11:59:30–12:00:30.
    await recordActivity(ctx, [beat('journal', 60, 0, { visit: true })], NOW);
    await recordActivity(ctx, [beat('money', 60, 0, { visit: true })], NOW + 30_000);
    // A stretch entirely covered by another tab adds no time and no visit.
    await recordActivity(ctx, [beat('library', 30, 0, { visit: true })], NOW + 30_000);

    const p = await profileOf(agent);
    expect(p.activity.totalSeconds).toBe(90);
    expect(sectionOf(p, 'journal')!.seconds).toBe(60);
    expect(sectionOf(p, 'money')).toMatchObject({ seconds: 30, visits: 1 });
    expect(sectionOf(p, 'library')).toBeUndefined();
  });

  it('keeps time sent without a section in the totals but in no section', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat(undefined, 60, 60_000)], NOW); // a tab from before sections
    await recordActivity(ctx, [beat('home', 30, 0, { visit: true })], NOW);
    const p = await profileOf(agent);
    expect(p.activity.totalSeconds).toBe(90);
    expect(p.activity.sections).toEqual([
      expect.objectContaining({ section: 'home', seconds: 30, visits: 1 }),
    ]);
    const [day] = (await rangeOf(agent, DATE, DATE)).days;
    expect(day).toMatchObject({ date: DATE, seconds: 90, sessions: 1 });
    expect(day!.sections).toEqual([{ section: 'home', seconds: 30, visits: 1 }]);
  });

  it('refuses unknown sections and malformed visit flags', async () => {
    const { agent } = await signedUpAgent();
    const date = new Date().toISOString().slice(0, 10);
    const send = (b: Record<string, unknown>) =>
      agent
        .post('/api/me/activity')
        .send({ beats: [{ id: 'abcdefgh', seconds: 30, ago: 0, date, ...b }] });
    await send({ section: 'admin' }).expect(400);
    await send({ section: 'journal', visit: 'yes' }).expect(400);
    await send({ section: 'journal', visit: true }).expect(200);
  });
});

describe('usage by day', () => {
  it('lists recorded days in a range, oldest first, and only the asker’s own', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat('journal', 60, 0, { visit: true })], NOW);
    await recordActivity(
      ctx,
      [beat('tasks', 45, 26 * 60 * MIN, { visit: true, date: '2026-10-23' })],
      NOW,
    );
    await recordActivity(
      ctx,
      [beat('tasks', 50, 10 * 24 * 60 * MIN, { visit: true, date: '2026-10-14' })],
      NOW,
    );

    const week = await rangeOf(agent, '2026-10-19', '2026-10-25');
    expect(week.days.map((d) => [d.date, d.seconds])).toEqual([
      ['2026-10-23', 45],
      ['2026-10-24', 60],
    ]);
    expect((await rangeOf(agent, '2026-10-01', '2026-10-31')).days).toHaveLength(3);

    const other = await signedUpAgent(2);
    expect((await rangeOf(other.agent, '2026-10-01', '2026-10-31')).days).toEqual([]);
  });

  it('validates the range and needs a signed-in user', async () => {
    await request(app).get('/api/me/usage').query({ from: DATE, to: DATE }).expect(401);
    const { agent } = await signedUpAgent();
    await agent.get('/api/me/usage').query({ from: '2026-10-25', to: '2026-10-24' }).expect(400);
    await agent.get('/api/me/usage').query({ from: '2024-01-01', to: '2026-10-24' }).expect(400);
    await agent.get('/api/me/usage').query({ from: 'yesterday', to: DATE }).expect(400);
  });

  it('rebuilds section and action totals from the daily records', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id };
    await recordActivity(ctx, [beat('journal', 60, 0, { visit: true })], NOW);
    await recordActivity(
      ctx,
      [beat('ideas', 30, 0, { visit: true, date: '2026-10-24' })],
      NOW + MIN,
    );
    await recordAction({ ...ctx, localDate: DATE }, 'note.created', 'n1');
    const before = (await profileOf(agent)).activity;
    const after = (await agent.post('/api/me/profile/recount').expect(200)).body.profile.activity;
    expect(after).toEqual(before);
    expect(after.sections).toHaveLength(2);
    expect(actionOf(after.actions, 'note.created')).toBe(1);
  });
});

describe('meaningful actions', () => {
  const today = new Date().toISOString().slice(0, 10);
  const actionsToday = async (agent: request.Agent) =>
    (await rangeOf(agent, today, today)).days[0]?.actions ?? [];

  it('counts an entry created and then autosaved as created, not edited', async () => {
    const { agent } = await signedUpAgent();
    const entry = (await agent.post('/api/writing').send({ body: 'Draft' }).expect(201)).body.entry;
    for (const [i, body] of ['Draft one', 'Draft one two', 'Draft one two three'].entries())
      await agent
        .patch(`/api/writing/${entry.id}`)
        .send({ rev: i + 1, body })
        .expect(200);

    const actions = await actionsToday(agent);
    expect(actionOf(actions, 'writing.created')).toBe(1);
    expect(actionOf(actions, 'writing.edited')).toBe(0);
    const p = await profileOf(agent);
    expect(actionOf(p.activity.actions, 'writing.created')).toBe(1);
  });

  it('counts an older entry edited many times in a day once, and ignores pinning', async () => {
    const { agent, user } = await signedUpAgent();
    // Written on an earlier day: its creation counted then.
    const entry = await createEntry({ userId: user.id, localDate: '2026-10-20' }, 'note', {
      body: 'Idea',
    });
    await agent.patch(`/api/notes/${entry.id}`).send({ rev: 1, body: 'Idea, longer' }).expect(200);
    await agent
      .patch(`/api/notes/${entry.id}`)
      .send({ rev: 2, body: 'Idea, longer still' })
      .expect(200);
    await agent.patch(`/api/notes/${entry.id}`).send({ pinned: true }).expect(200);
    const actions = await actionsToday(agent);
    expect(actionOf(actions, 'note.edited')).toBe(1);
    expect(actionOf(actions, 'note.created')).toBe(0);
    const p = await profileOf(agent);
    expect(actionOf(p.activity.actions, 'note.created')).toBe(1);
    expect(actionOf(p.activity.actions, 'note.edited')).toBe(1);
  });

  it('counts a task completed once, however often it is reopened that day', async () => {
    const { agent } = await signedUpAgent();
    const task = (await agent.post('/api/tasks').send({ title: 'Water plants' }).expect(201)).body
      .task;
    await agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    await agent.patch(`/api/tasks/${task.id}`).send({ status: 'open' }).expect(200);
    await agent.patch(`/api/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    await agent.patch(`/api/tasks/${task.id}`).send({ title: 'Water the plants' }).expect(200);
    const actions = await actionsToday(agent);
    expect(actionOf(actions, 'task.created')).toBe(1);
    expect(actionOf(actions, 'task.completed')).toBe(1);
  });

  it('counts every Quick Capture, and what it filed where it went', async () => {
    const { agent } = await signedUpAgent();
    const localDate = today;
    await agent
      .post('/api/inbox/capture')
      .send({ text: 'Call the dentist', kind: 'task', localDate, localTime: '09:00' })
      .expect(201);
    await agent
      .post('/api/inbox/capture')
      .send({ text: 'Felt good', kind: 'journal', localDate, localTime: '09:01' })
      .expect(201);
    await agent
      .post('/api/inbox/capture')
      .send({ text: 'More of it', kind: 'journal', localDate, localTime: '09:02' })
      .expect(201);
    const waiting = (
      await agent
        .post('/api/inbox/capture')
        .send({ text: 'Someday: learn to sail', localDate, localTime: '09:03' })
        .expect(201)
    ).body;
    await agent
      .post(`/api/inbox/${waiting.id}/convert`)
      .send({ to: 'note', localDate, localTime: '09:04' })
      .expect(200);
    const actions = await actionsToday(agent);
    expect(actionOf(actions, 'capture.created')).toBe(4);
    expect(actionOf(actions, 'capture.filed')).toBe(1);
    expect(actionOf(actions, 'note.created')).toBe(1);
    expect(actionOf(actions, 'task.created')).toBe(1);
    // The first capture started the day's entry; the second added to it the same day.
    expect(actionOf(actions, 'journal.created')).toBe(1);
    expect(actionOf(actions, 'journal.edited')).toBe(0);
  });

  it('does not count what failed', async () => {
    const { agent } = await signedUpAgent();
    await agent.patch('/api/tasks/nope').send({ status: 'done' }).expect(404);
    await agent.post('/api/journal').send({ body: 'No date' }).expect(400);
    expect(await actionsToday(agent)).toEqual([]);
  });

  it('counts on the browser’s local date when it is plausible', async () => {
    const { agent } = await signedUpAgent();
    const now = Date.now();
    const local = new Date(now + 10 * 60 * MIN).toISOString().slice(0, 10); // UTC+10
    await agent.post('/api/projects').set('X-Local-Date', local).send({ name: 'A' }).expect(201);
    await agent
      .post('/api/projects')
      .set('X-Local-Date', '1999-01-01')
      .send({ name: 'B' })
      .expect(201);
    const range = await rangeOf(agent, '2026-01-01', '2026-12-31');
    const counts = Object.fromEntries(
      range.days.map((d) => [d.date, actionOf(d.actions, 'project.created')]),
    );
    if (local === today) expect(counts[today]).toBe(2);
    else expect(counts).toEqual({ [local]: 1, [today]: 1 });
    expect(plausibleLocalDate('2026-10-24', NOW)).toBe('2026-10-24');
    expect(plausibleLocalDate('2026-10-25', NOW)).toBe('2026-10-25'); // UTC+12 already there
    expect(plausibleLocalDate('2026-10-27', NOW)).toBeUndefined();
    expect(plausibleLocalDate('24/10/2026', NOW)).toBeUndefined();
  });

  it('counts an action on a day before any time on it, and the day turns active later', async () => {
    const { agent, user } = await signedUpAgent();
    const ctx = { userId: user.id, localDate: DATE };
    await recordAction(ctx, 'book.created', 'b1');
    let p = await profileOf(agent);
    expect(p.activity.days).toBe(0);
    await recordActivity({ userId: user.id }, [beat('library', 60, 0, { visit: true })], NOW);
    p = await profileOf(agent);
    expect(p.activity.days).toBe(1);
    const [day] = (await rangeOf(agent, DATE, DATE)).days;
    expect(day).toMatchObject({ seconds: 60, sessions: 1 });
    expect(actionOf(day!.actions, 'book.created')).toBe(1);
  });
});

describe('the Private Vault', () => {
  it('records nothing about it, and erases what an earlier version kept', async () => {
    const { agent, user } = await signedUpAgent();
    const { activityRepo } = await import('./memory3.js');
    // As stored by the earlier version: 60 s in Journal, 40 s in the vault, one vault item.
    await activityRepo.record(user.id, [DATE], () => ({
      meta: {
        totalSeconds: 100,
        days: 1,
        sessions: 1,
        longestSessionSeconds: 100,
        firstActiveAt: '2026-10-24T11:58:20.000Z',
        lastActiveAt: '2026-10-24T12:00:00.000Z',
        months: {
          '2026-10': {
            seconds: 100,
            days: 1,
            sections: { journal: { seconds: 60, visits: 1 }, vault: { seconds: 40, visits: 1 } },
            actions: { 'vault.created': 1 },
          },
        },
        sections: {
          journal: { seconds: 60, visits: 1, lastAt: '2026-10-24T11:59:20.000Z' },
          vault: { seconds: 40, visits: 1, lastAt: '2026-10-24T12:00:00.000Z' },
        },
        sectionsSince: '2026-10-24T11:58:20.000Z',
        actions: { 'vault.created': 1 },
        recentSessions: [],
        recent: [],
        beatIds: [],
      },
      days: [
        {
          date: DATE,
          seconds: 100,
          sessions: 1,
          firstAt: '2026-10-24T11:58:20.000Z',
          lastAt: '2026-10-24T12:00:00.000Z',
          sections: {
            journal: { seconds: 60, visits: 1, lastAt: '2026-10-24T11:59:20.000Z' },
            vault: { seconds: 40, visits: 1, lastAt: '2026-10-24T12:00:00.000Z' },
          },
          actions: { 'vault.created': ['v1'] },
        },
      ],
    }));

    const p = await profileOf(agent);
    expect(p.activity.totalSeconds).toBe(60);
    expect(p.activity.sections.map((s) => s.section)).toEqual(['journal']);
    expect(p.activity.actions).toEqual([]);
    expect(p.content.items.map((c) => c.key)).not.toContain('vault');
    // The flag saying it was erased is the only mention left.
    const vaultData = /"vault"|vault\./;
    expect(JSON.stringify(activityDays(user.id))).not.toMatch(vaultData);
    expect(JSON.stringify(await activityRepo.getMeta(user.id))).not.toMatch(vaultData);
  });

  it('drops vault time sent by a tab of an earlier version, and counts nothing done there', async () => {
    const { agent } = await signedUpAgent();
    const date = new Date().toISOString().slice(0, 10);
    const res = await agent
      .post('/api/me/activity')
      .send({
        beats: [
          { id: 'vaultbeat1', seconds: 30, ago: 40, date, section: 'vault', visit: true },
          { id: 'journalbeat', seconds: 30, ago: 0, date, section: 'journal', visit: true },
        ],
      })
      .expect(200);
    expect(res.body).toEqual({ counted: 30 });
    const p = await profileOf(agent);
    expect(p.activity.totalSeconds).toBe(30);
    expect(p.activity.sections.map((s) => s.section)).toEqual(['journal']);
    expect(JSON.stringify(await rangeOf(agent, date, date))).not.toContain('vault');
  });
});
