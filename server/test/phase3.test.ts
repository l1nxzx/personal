import { describe, expect, it } from 'vitest';
import { advance } from '../src/services/expenseService.js';
import { credentials, signedUpAgent } from './helpers.js';
import { ageEntry } from './memory.js';

const HOUR = 60 * 60 * 1000;

describe('money-making ideas', () => {
  it('starts from just a name and fills in later; experiments survive being dropped', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/money-ideas')
      .send({ name: 'Paid reading guides' })
      .expect(201);
    const id = body.idea.id;
    expect(body.idea).toMatchObject({
      status: 'idea',
      experiments: [],
      nextStep: '',
      projectId: null,
    });

    const experiment = {
      id: 'e1',
      date: '2026-10-01',
      tried: 'Landing page',
      outcome: '3 sign-ups',
      lessons: 'Price unclear',
      hours: 4,
      spentMinor: 1200,
      currency: 'EUR',
    };
    await agent
      .patch(`/api/money-ideas/${id}`)
      .send({
        status: 'testing',
        nextStep: 'Email the 3 sign-ups',
        whyItMightWork: 'People ask for it',
        experiments: [experiment],
      })
      .expect(200);
    const dropped = await agent
      .patch(`/api/money-ideas/${id}`)
      .send({ status: 'dropped' })
      .expect(200);
    expect(dropped.body.idea.experiments).toEqual([experiment]);

    const list = (await agent.get('/api/money-ideas')).body.items;
    expect(list).toMatchObject([
      { id, status: 'dropped', experimentCount: 1, nextStep: 'Email the 3 sign-ups' },
    ]);
    expect((await agent.get('/api/me/search?q=landing&types=moneyIdea')).body.items).toHaveLength(
      1,
    );
  });

  it('lists testing and running ideas before new ones, and hides archived', async () => {
    const { agent } = await signedUpAgent();
    for (const [name, status] of [
      ['A', 'idea'],
      ['B', 'running'],
      ['C', 'testing'],
      ['D', 'dropped'],
    ] as const) {
      await agent.post('/api/money-ideas').send({ name, status });
    }
    const e = (await agent.post('/api/money-ideas').send({ name: 'E' })).body.idea;
    await agent.patch(`/api/money-ideas/${e.id}`).send({ archived: true });
    expect(
      (await agent.get('/api/money-ideas')).body.items.map((i: { name: string }) => i.name),
    ).toEqual(['C', 'B', 'A', 'D']);
    expect(
      (await agent.get('/api/money-ideas?archived=true')).body.items.map(
        (i: { name: string }) => i.name,
      ),
    ).toEqual(['E']);
  });

  it('turns an idea into a project that stays linked', async () => {
    const { agent } = await signedUpAgent();
    const idea = (await agent.post('/api/money-ideas').send({ name: 'Course' })).body.idea;
    await agent
      .patch(`/api/money-ideas/${idea.id}`)
      .send({ description: 'A small course', whyItMightWork: 'Waitlist of 40' });
    const res = await agent.post(`/api/money-ideas/${idea.id}/project`).expect(201);
    expect(res.body.project).toMatchObject({ name: 'Course' });
    expect(res.body.project.description).toContain('Waitlist of 40');
    expect(res.body.idea.projectId).toBe(res.body.project.id);
    const linked = (await agent.get(`/api/links?type=project&id=${res.body.project.id}`)).body
      .items;
    expect(linked).toMatchObject([{ ref: { type: 'moneyIdea', id: idea.id } }]);

    await agent.delete(`/api/projects/${res.body.project.id}`).expect(204);
    expect((await agent.get(`/api/money-ideas/${idea.id}`)).body.idea.projectId).toBeNull();
  });
});

describe('expenses & subscriptions', () => {
  it('records expenses, keeps totals by category, and connects them to an idea', async () => {
    const { agent } = await signedUpAgent();
    const idea = (await agent.post('/api/money-ideas').send({ name: 'Ads test' })).body.idea;
    await agent
      .post('/api/expenses')
      .send({
        date: '2026-10-02',
        amountMinor: 2500,
        currency: 'EUR',
        category: 'Ads',
        moneyIdeaId: idea.id,
      })
      .expect(201);
    await agent
      .post('/api/expenses')
      .send({ date: '2026-10-03', amountMinor: 900, currency: 'EUR', category: 'ads ' })
      .expect(201);
    const summary = (await agent.get('/api/expenses/summary')).body.summary;
    expect(summary.months['2026-10'].EUR).toEqual({ total: 3400, categories: { ads: 3400 } });
    const forIdea = (await agent.get(`/api/expenses?moneyIdeaId=${idea.id}`)).body.items;
    expect(forIdea).toMatchObject([{ amountMinor: 2500 }]);
  });

  it('turns a subscription renewal into a real expense and moves the renewal on', async () => {
    const { agent } = await signedUpAgent();
    const sub = (
      await agent
        .post('/api/subscriptions')
        .send({
          name: 'Newsletter platform',
          amountMinor: 2900,
          currency: 'EUR',
          frequency: 'monthly',
          nextRenewal: '2026-01-31',
        })
        .expect(201)
    ).body.subscription;
    const res = await agent
      .post(`/api/subscriptions/${sub.id}/payments`)
      .send({ date: '2026-02-01' })
      .expect(201);
    expect(res.body.expense).toMatchObject({
      amountMinor: 2900,
      subscriptionId: sub.id,
      description: 'Newsletter platform',
    });
    expect(res.body.subscription.nextRenewal).toBe('2026-02-28');
    expect(
      (await agent.get('/api/expenses/summary')).body.summary.months['2026-02'].EUR.total,
    ).toBe(2900);
  });

  it('advances renewal dates sensibly', () => {
    expect(advance('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advance('2026-03-15', 'quarterly')).toBe('2026-06-15');
    expect(advance('2026-12-29', 'weekly')).toBe('2027-01-05');
    expect(advance('2024-02-29', 'yearly')).toBe('2025-02-28');
  });
});

describe('version history', () => {
  it('keeps earlier text now and then while writing, and by hand', async () => {
    const { agent, user } = await signedUpAgent();
    const e = (await agent.post('/api/writing').send({ title: 'Essay', body: 'First draft.' })).body
      .entry;

    await agent.patch(`/api/writing/${e.id}`).send({ body: 'Second draft.' }).expect(200);
    expect((await agent.get(`/api/writing/${e.id}/versions`)).body.items).toHaveLength(0); // too soon

    ageEntry(user.id, 'writing', e.id, HOUR);
    await agent.patch(`/api/writing/${e.id}`).send({ body: 'Third draft.' }).expect(200);
    let list = (await agent.get(`/api/writing/${e.id}/versions`)).body.items;
    expect(list).toHaveLength(1);
    const v = (await agent.get(`/api/versions/${list[0].id}`)).body.version;
    expect(v).toMatchObject({ body: 'Second draft.', title: 'Essay', label: null });

    await agent.post(`/api/writing/${e.id}/versions`).send({ label: 'Sent to Martin' }).expect(201);
    list = (await agent.get(`/api/writing/${e.id}/versions`)).body.items;
    expect(list.map((x: { label: string | null }) => x.label)).toContain('Sent to Martin');

    // Pinning is not an edit.
    ageEntry(user.id, 'writing', e.id, HOUR);
    await agent.patch(`/api/writing/${e.id}`).send({ pinned: true });
    expect((await agent.get(`/api/writing/${e.id}/versions`)).body.items).toHaveLength(2);

    await agent.delete(`/api/writing/${e.id}`).expect(204);
    await agent.get(`/api/versions/${v.id}`).expect(404);
  });
});

describe('decisions, On this day, reviews and the timeline', () => {
  it('records decisions and brings them back when it is time to revisit', async () => {
    const { agent } = await signedUpAgent();
    const d = (
      await agent.post('/api/notes').send({ title: 'Quit the agency job?', noteType: 'decision' })
    ).body.entry;
    expect(d.note.decision).toMatchObject({ outcome: '', revisitOn: null });
    const decision = {
      madeOn: '2026-04-01',
      reasons: 'Income covers costs',
      expected: 'Calmer, more writing',
      revisitOn: '2026-10-01',
      outcome: '',
      outcomeOn: null,
    };
    await agent.patch(`/api/notes/${d.id}`).send({ decision }).expect(200);

    let home = (await agent.get('/api/me/home?date=2026-10-19')).body;
    expect(home.toRevisit).toMatchObject([
      { id: d.id, note: { revisitOn: '2026-10-01', decided: false } },
    ]);
    expect((await agent.get('/api/me/home?date=2026-09-01')).body.toRevisit).toEqual([]);

    await agent
      .patch(`/api/notes/${d.id}`)
      .send({ decision: { ...decision, outcome: 'Mostly right', outcomeOn: '2026-10-19' } });
    home = (await agent.get('/api/me/home?date=2026-10-19')).body;
    expect(home.toRevisit).toEqual([]);
  });

  it('shows entries from this day in earlier years only', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/journal').send({ date: '2024-10-19', title: 'Two years ago' });
    await agent.post('/api/journal').send({ date: '2026-10-19', title: 'Today' });
    await agent.post('/api/journal').send({ date: '2025-10-18', title: 'Wrong day' });
    const home = (await agent.get('/api/me/home?date=2026-10-19')).body;
    expect(home.onThisDay.map((x: { title: string }) => x.title)).toEqual(['Two years ago']);
  });

  it('prefills a weekly review from the week and saves any answers', async () => {
    const { agent } = await signedUpAgent();
    const t = (await agent.post('/api/tasks').send({ title: 'Ship the newsletter' })).body.task;
    await agent.patch(`/api/tasks/${t.id}`).send({ status: 'done' });
    await agent
      .post('/api/journal')
      .send({ date: new Date().toISOString().slice(0, 10), title: 'A good week' });
    await agent.post('/api/income').send({
      date: new Date().toISOString().slice(0, 10),
      source: 'Gumroad',
      amountMinor: 4000,
      currency: 'EUR',
    });

    const now = new Date();
    const monday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
      ),
    );
    const week = monday.toISOString().slice(0, 10);

    const res = await agent.get(`/api/reviews/${week}`).expect(200);
    expect(res.body.review).toBeNull();
    expect(res.body.context.tasksDone).toMatchObject([{ title: 'Ship the newsletter' }]);
    expect(res.body.context.journal).toMatchObject([{ title: 'A good week' }]);
    expect(res.body.context.income).toEqual({ EUR: 4000 });

    const saved = await agent
      .put(`/api/reviews/${week}`)
      .send({ learned: 'Shipping beats polishing.' })
      .expect(200);
    expect(saved.body.review.answers).toMatchObject({
      learned: 'Shipping beats polishing.',
      happened: '',
    });
    expect((await agent.get('/api/reviews')).body.items).toHaveLength(1);
    await agent.put(`/api/reviews/${week}`).send({ learned: '' }).expect(200);
    expect((await agent.get('/api/reviews')).body.items).toHaveLength(0);

    await agent.get('/api/reviews/2026-10-21').expect(400); // a Wednesday
  });

  it('keeps a timeline of moments chosen by hand', async () => {
    const { agent } = await signedUpAgent();
    const e = (
      await agent.post('/api/journal').send({ date: '2025-06-01', title: 'Moved to Vienna' })
    ).body.entry;
    await agent
      .post('/api/moments')
      .send({ date: '2025-06-01', title: 'Moved to Vienna', ref: { type: 'journal', id: e.id } })
      .expect(201);
    await agent
      .post('/api/moments')
      .send({ date: '2026-03-10', title: 'First €1,000 month' })
      .expect(201);
    await agent
      .post('/api/moments')
      .send({ date: '2026-03-10', title: 'x', ref: { type: 'book', id: 'missing' } })
      .expect(404);
    const list = (await agent.get('/api/moments')).body.items;
    expect(list.map((m: { title: string }) => m.title)).toEqual([
      'First €1,000 month',
      'Moved to Vienna',
    ]);
  });
});

describe('private vault', () => {
  const meta = {
    salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
    iterations: 600000,
    wrappedKey: 'd3JhcHBlZGtleWJ5dGVz',
    wrapIv: 'aXZpdml2aXZpdml2',
  };

  it('stores only ciphertext and key material, once', async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.get('/api/vault/meta')).body.meta).toBeNull();
    await agent.post('/api/vault/meta').send(meta).expect(201);
    await agent.post('/api/vault/meta').send(meta).expect(409);
    await agent
      .post('/api/vault/meta')
      .send({ ...meta, iterations: 1000 })
      .expect(400); // too weak

    const item = (
      await agent
        .post('/api/vault/items')
        .send({ iv: 'aXY=', data: 'Y2lwaGVydGV4dA==' })
        .expect(201)
    ).body.item;
    await agent.post('/api/vault/items').send({ iv: 'aXY=', data: 'not base64 !' }).expect(400);
    expect((await agent.get('/api/vault/items')).body.items).toMatchObject([
      { id: item.id, data: 'Y2lwaGVydGV4dA==' },
    ]);
    // Vault content never shows up in search.
    expect((await agent.get('/api/me/search?q=ciphertext')).body.items).toEqual([]);
  });

  it('detects edits from another device', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/vault/meta').send(meta);
    const item = (await agent.post('/api/vault/items').send({ iv: 'aXY=', data: 'QQ==' })).body
      .item;
    const next = await agent
      .put(`/api/vault/items/${item.id}`)
      .send({ iv: 'aXY=', data: 'Qg==', expectedUpdatedAt: item.updatedAt })
      .expect(200);
    await agent
      .put(`/api/vault/items/${item.id}`)
      .send({ iv: 'aXY=', data: 'Qw==', expectedUpdatedAt: item.updatedAt })
      .expect(409);
    await agent
      .put(`/api/vault/items/${item.id}`)
      .send({ iv: 'aXY=', data: 'Qw==', expectedUpdatedAt: next.body.item.updatedAt })
      .expect(200);
  });

  it('stores encrypted files and wipes everything on reset (with the account password)', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/vault/meta').send(meta);
    const item = (await agent.post('/api/vault/items').send({ iv: 'aXY=', data: 'QQ==' })).body
      .item;
    const bytes = Buffer.from([1, 2, 3, 250, 251]);
    await agent
      .put(`/api/vault/files/${item.id}`)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(204);
    const got = await agent
      .get(`/api/vault/files/${item.id}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(got.body as Buffer, bytes)).toBe(0);

    await agent
      .put('/api/vault/meta')
      .send({ ...meta, password: 'wrong-password' })
      .expect(401);
    await agent
      .put('/api/vault/meta')
      .send({ ...meta, wrappedKey: 'bmV3a2V5', password: credentials().password })
      .expect(200);
    await agent.post('/api/vault/reset').send({ password: 'wrong-password' }).expect(401);
    await agent.post('/api/vault/reset').send({ password: credentials().password }).expect(204);
    expect((await agent.get('/api/vault/meta')).body.meta).toBeNull();
    expect((await agent.get('/api/vault/items')).body.items).toEqual([]);
    await agent.get(`/api/vault/files/${item.id}`).expect(404);
  });
});
