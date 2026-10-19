import { describe, expect, it } from 'vitest';
import { buildSearchTerms, excerpt, fold, queryTokens, wordCount } from '../src/lib/text.js';
import { signedUpAgent } from './helpers.js';

const when = { localDate: '2026-10-19', localTime: '21:40' };

describe('quick capture & inbox', () => {
  it('keeps unclassified captures in the inbox', async () => {
    const { agent } = await signedUpAgent();
    const res = await agent
      .post('/api/inbox/capture')
      .send({ text: 'A thought', ...when })
      .expect(201);
    expect(res.body.destination).toBe('inbox');
    const inbox = (await agent.get('/api/inbox')).body.items;
    expect(inbox).toMatchObject([{ text: 'A thought', kind: null }]);
    expect((await agent.get('/api/me/home')).body.inboxCount).toBe(1);
  });

  it('files tasks straight away, splitting title and notes', async () => {
    const { agent } = await signedUpAgent();
    const res = await agent
      .post('/api/inbox/capture')
      .send({ text: 'Email the accountant\nabout Q3 invoices', kind: 'task', ...when })
      .expect(201);
    expect(res.body.destination).toBe('task');
    const [task] = (await agent.get('/api/tasks/open')).body.items;
    expect(task).toMatchObject({ title: 'Email the accountant', notes: 'about Q3 invoices' });
    expect((await agent.get('/api/inbox')).body.items).toHaveLength(0);
  });

  it("appends journal captures to today's entry", async () => {
    const { agent } = await signedUpAgent();
    const first = await agent
      .post('/api/inbox/capture')
      .send({ text: 'Morning coffee.', kind: 'journal', ...when })
      .expect(201);
    const second = await agent
      .post('/api/inbox/capture')
      .send({ text: 'Long call with mum.', kind: 'journal', ...when })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    const entry = (await agent.get(`/api/journal/${first.body.id}`)).body.entry;
    expect(entry.body).toBe('Morning coffee.\n\n*21:40* — Long call with mum.');
  });

  it('converts inbox items and removes them from the inbox', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/inbox/capture')
      .send({ text: 'Essay idea\nOn patience', ...when });
    const res = await agent
      .post(`/api/inbox/${body.id}/convert`)
      .send({ to: 'writing', ...when })
      .expect(200);
    expect(res.body.destination).toBe('writing');
    const entry = (await agent.get(`/api/writing/${res.body.id}`)).body.entry;
    expect(entry).toMatchObject({ title: 'Essay idea', body: 'On patience' });
    expect((await agent.get('/api/inbox')).body.items).toHaveLength(0);
    await agent
      .post(`/api/inbox/${body.id}/convert`)
      .send({ to: 'task', ...when })
      .expect(404);
  });

  it('rejects empty captures', async () => {
    const { agent } = await signedUpAgent();
    await agent
      .post('/api/inbox/capture')
      .send({ text: '   ', ...when })
      .expect(400);
  });
});

describe('universal search', () => {
  it('finds content across types by word and prefix, ignoring case and accents', async () => {
    const { agent } = await signedUpAgent();
    await agent
      .post('/api/journal')
      .send({ date: '2026-10-01', title: 'Prayer', body: 'Thinking about Augustine and grace.' });
    await agent.post('/api/writing').send({ title: 'On Augustine', body: 'Confessions, book X.' });
    await agent.post('/api/tasks').send({ title: 'Buy Augustine’s Confessions' });
    await agent.post('/api/inbox/capture').send({ text: 'Café Ženeva for writing', ...when });

    const all = (await agent.get('/api/me/search?q=augus')).body.items;
    expect(all.map((r: { type: string }) => r.type).sort()).toEqual(['journal', 'task', 'writing']);
    // Title matches rank first.
    expect(all[0].type).not.toBe('journal');
    expect(all.find((r: { type: string }) => r.type === 'journal').snippet).toContain('Augustine');

    const accent = (await agent.get('/api/me/search?q=zeneva')).body.items;
    expect(accent).toMatchObject([{ type: 'capture' }]);

    const both = (await agent.get('/api/me/search?q=augustine grace')).body.items;
    expect(both).toMatchObject([{ type: 'journal' }]);

    const onlyTasks = (await agent.get('/api/me/search?q=augustine&types=task')).body.items;
    expect(onlyTasks).toMatchObject([{ type: 'task' }]);

    expect((await agent.get('/api/me/search?q=a')).body.items).toEqual([]);
  });

  it("never returns another user's content", async () => {
    const { agent: a } = await signedUpAgent(1);
    const { agent: b } = await signedUpAgent(2);
    await a.post('/api/writing').send({ title: 'Secret plans' });
    expect((await b.get('/api/me/search?q=secret')).body.items).toEqual([]);
  });
});

describe('text helpers', () => {
  it('folds accents without shifting indexes', () => {
    expect(fold('Žluťoučký Kůň')).toBe('zlutoucky kun');
    expect(fold('Žluťoučký').length).toBe('Žluťoučký'.length);
  });

  it('builds prefix terms and query tokens', () => {
    const terms = buildSearchTerms('Philosophy');
    expect(terms).toEqual(expect.arrayContaining(['philosophy', 'phi', 'philo']));
    expect(terms).not.toContain('ph');
    expect(queryTokens('the Philosophy of')).toEqual(['philosophy', 'the', 'of']);
  });

  it('counts words and makes excerpts from markdown', () => {
    expect(wordCount('# Title\n\n- [ ] one item\n> a [link](http://x.y)')).toBe(5);
    expect(excerpt('**Bold** start. '.repeat(40), 50).length).toBeLessThanOrEqual(51);
    expect(excerpt('## The problem\n\nPatience is hard.\n\n- Reading slower\n- Writing')).toBe(
      'Patience is hard. Reading slower · Writing',
    );
  });
});

describe('preferences & home', () => {
  it('returns defaults and saves changes', async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.get('/api/me/prefs')).body.prefs).toEqual({
      focusLine: '',
      showPrompts: true,
      promptDismissedOn: null,
      writingFont: 'serif',
      baseCurrency: 'EUR',
      showOnThisDay: true,
    });
    const res = await agent
      .patch('/api/me/prefs')
      .send({ focusLine: 'Finish the essay' })
      .expect(200);
    expect(res.body.prefs.focusLine).toBe('Finish the essay');
    await agent.patch('/api/me/prefs').send({ theme: 'pink' }).expect(400);
  });

  it('lists recently edited writing on home', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/journal').send({ date: '2026-10-18', title: 'Old' });
    await new Promise((r) => setTimeout(r, 5));
    await agent.post('/api/writing').send({ title: 'Newer' });
    const recent = (await agent.get('/api/me/home')).body.recent;
    expect(recent.map((e: { title: string }) => e.title)).toEqual(['Newer', 'Old']);
  });
});
