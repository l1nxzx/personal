import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';

describe('tasks', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/tasks/open').expect(401);
  });

  it('creates, edits, completes and reopens a task', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent
      .post('/api/tasks')
      .send({ title: 'Renew passport', dueDate: '2026-10-24', plannedDate: null })
      .expect(201);
    const id = body.task.id;
    expect(body.task).toMatchObject({
      status: 'open',
      dueDate: '2026-10-24',
      plannedDate: null,
      priority: 'none',
    });

    await agent
      .patch(`/api/tasks/${id}`)
      .send({ subtasks: [{ id: 's1', title: 'Photos', done: false }], priority: 'high' })
      .expect(200);

    const done = await agent.patch(`/api/tasks/${id}`).send({ status: 'done' }).expect(200);
    expect(done.body.task.completedAt).toEqual(expect.any(String));
    expect((await agent.get('/api/tasks/open')).body.items).toHaveLength(0);
    const doneList = (await agent.get('/api/tasks/done')).body;
    expect(doneList.items.map((t: { id: string }) => t.id)).toEqual([id]);

    const reopened = await agent.patch(`/api/tasks/${id}`).send({ status: 'open' }).expect(200);
    expect(reopened.body.task.completedAt).toBeNull();
    expect((await agent.get('/api/tasks/done')).body.items).toHaveLength(0);
    expect((await agent.get('/api/tasks/open')).body.items[0]).toMatchObject({
      priority: 'high',
      subtasks: [{ id: 's1', title: 'Photos', done: false }],
    });
  });

  it('validates input', async () => {
    const { agent } = await signedUpAgent();
    await agent.post('/api/tasks').send({ title: '  ' }).expect(400);
    await agent.post('/api/tasks').send({ title: 'x', dueDate: '24/10/2026' }).expect(400);
    const { body } = await agent.post('/api/tasks').send({ title: 'x' }).expect(201);
    await agent.patch(`/api/tasks/${body.task.id}`).send({ status: 'waiting' }).expect(400);
  });

  it('deletes tasks', async () => {
    const { agent } = await signedUpAgent();
    const { body } = await agent.post('/api/tasks').send({ title: 'x' }).expect(201);
    await agent.delete(`/api/tasks/${body.task.id}`).expect(204);
    await agent.delete(`/api/tasks/${body.task.id}`).expect(404);
  });
});
