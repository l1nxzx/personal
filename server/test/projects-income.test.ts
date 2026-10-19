import { describe, expect, it } from 'vitest';
import { signedUpAgent } from './helpers.js';

describe('projects', () => {
  it('groups tasks under a project, and keeps them when the project is deleted', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/projects')
      .send({ name: 'Reading course', targetDate: '2026-12-01' })
      .expect(201);
    const pid = body.project.id;
    expect(body.project).toMatchObject({ status: 'active', milestones: [] });

    const t1 = (
      await agent.post('/api/tasks').send({ title: 'Outline lessons', projectId: pid }).expect(201)
    ).body.task;
    const t2 = (await agent.post('/api/tasks').send({ title: 'Record intro' }).expect(201)).body
      .task;
    await agent.patch(`/api/tasks/${t2.id}`).send({ projectId: pid }).expect(200);
    await agent.post('/api/tasks').send({ title: 'x', projectId: 'missing' }).expect(404);

    await agent
      .patch(`/api/projects/${pid}`)
      .send({
        milestones: [{ id: 'm1', title: 'Pilot with 10 people', date: '2026-11-15', done: false }],
      })
      .expect(200);

    const tasks = (await agent.get(`/api/projects/${pid}/tasks`)).body.items;
    expect(tasks.map((t: { title: string }) => t.title)).toEqual([
      'Outline lessons',
      'Record intro',
    ]);

    await agent.delete(`/api/projects/${pid}`).expect(204);
    const kept = (await agent.get(`/api/tasks/${t1.id}`)).body.task;
    expect(kept).toMatchObject({ title: 'Outline lessons', projectId: null });
  });

  it('lists active projects before paused and done ones', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/projects').send({ name: 'Done one', status: 'done' });
    await agent.post('/api/projects').send({ name: 'Active one' });
    await agent.post('/api/projects').send({ name: 'Paused one', status: 'paused' });
    const names = (await agent.get('/api/projects')).body.items.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual(['Active one', 'Paused one', 'Done one']);
  });

  it('keeps a one-line goal and counts tasks for progress', async () => {
    const { agent } = await signedUpAgent();
    const p = (await agent.post('/api/projects').send({ name: 'Course' }).expect(201)).body.project;
    expect(p.goal).toBe('');
    const done = (await agent.post('/api/projects').send({ name: 'Old', status: 'done' })).body
      .project;
    await agent
      .patch(`/api/projects/${p.id}`)
      .send({ goal: '  Ten people finish the pilot  ' })
      .expect(200);
    expect((await agent.get(`/api/projects/${p.id}`)).body.project.goal).toBe(
      'Ten people finish the pilot',
    );
    await agent
      .patch(`/api/projects/${p.id}`)
      .send({ goal: 'x'.repeat(301) })
      .expect(400);

    for (const title of ['One', 'Two', 'Three']) {
      await agent.post('/api/tasks').send({ title, projectId: p.id }).expect(201);
    }
    await agent.post('/api/tasks').send({ title: 'Loose' }).expect(201);
    const { counts } = (await agent.get('/api/projects/task-counts').expect(200)).body;
    expect(counts).toEqual({ [p.id]: 3 });
    expect(counts[done.id]).toBeUndefined();
  });
});

describe('income', () => {
  const add = (agent: Awaited<ReturnType<typeof signedUpAgent>>['agent'], body: object) =>
    agent
      .post('/api/income')
      .send({ currency: 'EUR', ...body })
      .expect(201);

  it('keeps monthly totals by currency and source in step with every change', async () => {
    const { agent } = await signedUpAgent();
    await add(agent, { date: '2026-10-03', source: 'Gumroad', amountMinor: 12_000 });
    await add(agent, { date: '2026-10-10', source: 'gumroad ', amountMinor: 3_050 });
    const sponsor = (
      await add(agent, {
        date: '2026-10-12',
        source: 'Newsletter sponsor',
        amountMinor: 40_000,
        status: 'pending',
      })
    ).body.entry;
    await add(agent, { date: '2026-09-20', source: 'Gumroad', amountMinor: 9_000 });
    await add(agent, { date: '2026-10-05', source: 'Upwork', amountMinor: 5_000, currency: 'USD' });

    let summary = (await agent.get('/api/income/summary')).body.summary;
    expect(summary.months['2026-10'].EUR).toEqual({
      received: 15_050,
      pending: 40_000,
      sources: { gumroad: 15_050 },
    });
    expect(summary.months['2026-10'].USD.received).toBe(5_000);
    expect(summary.months['2026-09'].EUR.received).toBe(9_000);
    expect(summary.sourceLabels.gumroad).toMatch(/Gumroad/i);

    // The sponsorship arrives, a bit later: moves from pending to received, and to November.
    await agent
      .patch(`/api/income/${sponsor.id}`)
      .send({ status: 'received', date: '2026-11-02' })
      .expect(200);
    summary = (await agent.get('/api/income/summary')).body.summary;
    expect(summary.months['2026-10'].EUR.pending).toBe(0);
    expect(summary.months['2026-11'].EUR).toMatchObject({
      received: 40_000,
      sources: { 'newsletter sponsor': 40_000 },
    });

    await agent.delete(`/api/income/${sponsor.id}`).expect(204);
    summary = (await agent.get('/api/income/summary')).body.summary;
    expect(summary.months['2026-11'].EUR.received).toBe(0);
  });

  it('lists entries newest first, optionally for one month, and finds them by source', async () => {
    const { agent } = await signedUpAgent();
    await add(agent, { date: '2026-09-20', source: 'Gumroad', amountMinor: 900 });
    await add(agent, {
      date: '2026-10-03',
      source: 'Patreon',
      amountMinor: 1200,
      description: 'October members',
    });
    const all = (await agent.get('/api/income')).body.items.map((e: { date: string }) => e.date);
    expect(all).toEqual(['2026-10-03', '2026-09-20']);
    expect((await agent.get('/api/income?month=2026-09')).body.items).toHaveLength(1);
    expect((await agent.get('/api/me/search?q=patreon')).body.items).toMatchObject([
      { type: 'income', title: 'Patreon' },
    ]);
  });

  it('validates amounts and currencies', async () => {
    const { agent } = await signedUpAgent();
    await agent
      .post('/api/income')
      .send({ date: '2026-10-01', source: 'x', amountMinor: 0, currency: 'EUR' })
      .expect(400);
    await agent
      .post('/api/income')
      .send({ date: '2026-10-01', source: 'x', amountMinor: 1.5, currency: 'EUR' })
      .expect(400);
    await agent
      .post('/api/income')
      .send({ date: '2026-10-01', source: 'x', amountMinor: 100, currency: 'euro' })
      .expect(400);
    await agent
      .post('/api/income')
      .send({ date: '2026-10-01', source: '', amountMinor: 100, currency: 'EUR' })
      .expect(400);
  });
});

describe('home', () => {
  it('shows recently added books, documents and projects', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/books').send({ title: 'Meditations' });
    await new Promise((r) => setTimeout(r, 5));
    await agent.post('/api/projects').send({ name: 'Course' });
    const home = (await agent.get('/api/me/home')).body;
    expect(home.added.map((a: { title: string }) => a.title)).toEqual(['Course', 'Meditations']);
  });
});
