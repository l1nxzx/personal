import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';
import { memoryFiles } from './memory.js';

const png = () =>
  sharp({ create: { width: 40, height: 80, channels: 3, background: '#224466' } })
    .png()
    .toBuffer();

describe('miniapps', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/miniapps').expect(401);
    await request(app).get('/api/miniapps/apps/teeth/data').expect(401);
  });

  it('starts empty with the default wallpaper', async () => {
    const { agent } = await signedUpAgent();
    const state = (await agent.get('/api/miniapps').expect(200)).body.state;
    expect(state).toEqual({
      settings: {
        wallpaper: { kind: 'template', id: 'plain' },
        order: [],
        layout: null,
        folders: {},
      },
      apps: {},
    });
  });

  it('enables and disables apps; disabling takes the widget off Home and keeps the data', async () => {
    const { agent } = await signedUpAgent();
    let state = (await agent.put('/api/miniapps/apps/teeth').send({ enabled: true }).expect(200))
      .body.state;
    expect(state.settings.order).toEqual(['teeth']);
    await agent.put('/api/miniapps/apps/water').send({ enabled: true }).expect(200);
    state = (await agent.put('/api/miniapps/apps/teeth').send({ onHome: true }).expect(200)).body
      .state;
    expect(state.apps.teeth).toMatchObject({ enabled: true, onHome: true, hasData: false });
    await agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: { n: 1 } })
      .expect(200);
    state = (await agent.put('/api/miniapps/apps/teeth').send({ enabled: false }).expect(200)).body
      .state;
    expect(state.apps.teeth).toMatchObject({ enabled: false, onHome: false, hasData: true });
    expect(state.settings.order).toEqual(['water']);
    expect((await agent.get('/api/miniapps/apps/teeth/data').expect(200)).body.data).toEqual({
      n: 1,
    });
  });

  it('saves the screen layout, and orders apps by it', async () => {
    const { agent } = await signedUpAgent();
    await agent.put('/api/miniapps/apps/teeth').send({ enabled: true }).expect(200);
    await agent.put('/api/miniapps/apps/water').send({ enabled: true }).expect(200);
    const layout = ['widget:clock', 'water', 'store', 'widget:teeth', 'teeth', 'wallpaper'];
    const state = (await agent.put('/api/miniapps/layout').send({ layout }).expect(200)).body.state;
    expect(state.settings.layout).toEqual(layout);
    expect(state.settings.order).toEqual(['water', 'teeth']);
    await agent
      .put('/api/miniapps/layout')
      .send({ layout: ['widget:Bad'] })
      .expect(400);
  });

  it('keeps folders on the screen, orders apps inside them in place, drops unused ones', async () => {
    const { agent } = await signedUpAgent();
    for (const id of ['teeth', 'water', 'mood'])
      await agent.put(`/api/miniapps/apps/${id}`).send({ enabled: true }).expect(200);
    const folders = {
      fab: { name: 'Health', apps: ['mood', 'teeth', 'mood'] },
      fzz: { name: 'Gone', apps: ['water'] },
    };
    let state = (
      await agent
        .put('/api/miniapps/layout')
        .send({ layout: ['water', 'folder:fab', 'store', 'folder:nope'], folders })
        .expect(200)
    ).body.state;
    expect(state.settings.layout).toEqual(['water', 'folder:fab', 'store']);
    expect(state.settings.folders).toEqual({ fab: { name: 'Health', apps: ['mood', 'teeth'] } });
    expect(state.settings.order).toEqual(['water', 'mood', 'teeth']);
    // Without folders, the saved ones stay.
    state = (
      await agent
        .put('/api/miniapps/layout')
        .send({ layout: ['folder:fab', 'water'] })
        .expect(200)
    ).body.state;
    expect(state.settings.folders.fab.name).toBe('Health');
    expect(state.settings.order).toEqual(['mood', 'teeth', 'water']);
  });

  it('stores any JSON per app with a revision check, and deletes it on request', async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.get('/api/miniapps/apps/teeth/data').expect(200)).body).toEqual({
      data: null,
      rev: 0,
      updatedAt: null,
    });
    const first = await agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: { days: { '2026-11-11': { m: 'x' } } }, rev: 0 })
      .expect(200);
    expect(first.body.rev).toBe(1);
    const stale = await agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: { days: {} }, rev: 0 })
      .expect(409);
    expect(stale.body.error).toMatchObject({ code: 'EDIT_CONFLICT', details: { rev: 1 } });
    await agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: [1, [2, 3]], rev: 1 })
      .expect(200);
    expect((await agent.get('/api/miniapps/apps/teeth/data').expect(200)).body).toMatchObject({
      data: [1, [2, 3]],
      rev: 2,
    });
    // Another app's data is separate.
    expect((await agent.get('/api/miniapps/apps/water/data').expect(200)).body.data).toBeNull();
    await agent.delete('/api/miniapps/apps/teeth/data').expect(204);
    expect((await agent.get('/api/miniapps/apps/teeth/data').expect(200)).body.data).toBeNull();
    const state = (await agent.get('/api/miniapps').expect(200)).body.state;
    expect(state.apps.teeth.hasData).toBe(false);
  });

  it('validates app ids and data size', async () => {
    const { agent } = await signedUpAgent();
    await agent.get('/api/miniapps/apps/Bad_Id/data').expect(400);
    await agent.put('/api/miniapps/apps/x/data').send({ data: 1 }).expect(400);
    await agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: 'x'.repeat(300_001) })
      .expect(400);
  });

  it('keeps users apart', async () => {
    const a = await signedUpAgent(1);
    const b = await signedUpAgent(2);
    await a.agent
      .put('/api/miniapps/apps/teeth/data')
      .send({ data: { mine: true } })
      .expect(200);
    expect((await b.agent.get('/api/miniapps/apps/teeth/data').expect(200)).body.data).toBeNull();
  });

  it('sets a template or an uploaded wallpaper, replacing the old picture', async () => {
    const { agent } = await signedUpAgent();
    const up = await agent
      .post('/api/miniapps/wallpaper')
      .attach('image', await png(), 'w.png')
      .expect(200);
    const version = up.body.settings.wallpaper.version as string;
    expect(up.body.settings.wallpaper).toEqual({ kind: 'image', version });
    const img = await agent.get(`/api/miniapps/wallpaper/${version}`).expect(200);
    expect(img.headers['content-type']).toBe('image/webp');
    const files = () => [...memoryFiles.keys()].filter((k) => k.includes('/miniapps/'));
    expect(files()).toHaveLength(1);
    const again = await agent
      .post('/api/miniapps/wallpaper')
      .attach('image', await png(), 'w.png')
      .expect(200);
    expect(files()).toHaveLength(1);
    await agent.get(`/api/miniapps/wallpaper/${version}`).expect(404);
    const tpl = await agent.put('/api/miniapps/wallpaper').send({ template: 'dawn' }).expect(200);
    expect(tpl.body.settings.wallpaper).toEqual({ kind: 'template', id: 'dawn' });
    expect(files()).toHaveLength(0);
    await agent.get(`/api/miniapps/wallpaper/${again.body.settings.wallpaper.version}`).expect(404);
    await agent
      .post('/api/miniapps/wallpaper')
      .attach('image', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
  });
});
