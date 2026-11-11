import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, signedUpAgent } from './helpers.js';
import { entryLockRepo } from './memory3.js';
import { stores } from './memory.js';

const key = { keyId: 'key_abcdef12', iv: 'AAAAAAAAAAAAAAAA', data: 'd3JhcHBlZA==' };
const v = (s: string) => Buffer.from(s.padEnd(32, '.')).toString('base64');
const box = (tag: string, k?: string) => ({
  iv: 'AAAAAAAAAAAAAAAA',
  data: `c-${tag}`,
  ...(k && { k }),
});

async function enrolled() {
  const ctx = await signedUpAgent();
  await ctx.agent.post('/api/entry-lock/key').send(key).expect(200);
  const res = await ctx.agent
    .post('/api/entry-lock/devices')
    .send({ deviceId: 'device_0001', verifier: v('right'), keyId: key.keyId, label: 'Pixel' })
    .expect(201);
  return { ...ctx, serverHalf: res.body.serverHalf as string };
}

describe('entries key and PIN devices', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/entry-lock/key').expect(401);
    await request(app).post('/api/entry-lock/unlock').send({}).expect(401);
  });

  it('stores the entries key once; the first one wins', async () => {
    const { agent } = await signedUpAgent();
    expect((await agent.get('/api/entry-lock/key').expect(200)).body.key).toBeNull();
    await agent.post('/api/entry-lock/key').send(key).expect(200);
    const second = await agent
      .post('/api/entry-lock/key')
      .send({ ...key, keyId: 'key_other123' })
      .expect(200);
    expect(second.body.key.keyId).toBe(key.keyId);
  });

  it('releases the server half only for the right PIN check value', async () => {
    const { agent, user, serverHalf } = await enrolled();
    expect(Buffer.from(serverHalf, 'base64')).toHaveLength(32);
    // The server keeps a hash of the check value, never the value itself.
    const stored = entryLockRepo.device(user.id, 'device_0001')!;
    expect(JSON.stringify(stored)).not.toContain(v('right'));
    const ok = await agent
      .post('/api/entry-lock/unlock')
      .send({ deviceId: 'device_0001', verifier: v('right') })
      .expect(200);
    expect(ok.body.serverHalf).toBe(serverHalf);
    const bad = await agent
      .post('/api/entry-lock/unlock')
      .send({ deviceId: 'device_0001', verifier: v('wrong') })
      .expect(403);
    expect(bad.body.error).toMatchObject({ code: 'WRONG_PIN', details: { attemptsLeft: 4 } });
    expect(bad.body.serverHalf).toBeUndefined();
  });

  it('deletes the server half after five wrong PINs; a right one resets the count', async () => {
    const { agent, user } = await enrolled();
    const tryPin = (s: string) =>
      agent.post('/api/entry-lock/unlock').send({ deviceId: 'device_0001', verifier: v(s) });
    await tryPin('w1').expect(403);
    await tryPin('right').expect(200);
    for (let i = 4; i >= 1; i--) {
      const r = await tryPin('w').expect(403);
      expect(r.body.error.details.attemptsLeft).toBe(i);
    }
    const last = await tryPin('w').expect(403);
    expect(last.body.error.details.attemptsLeft).toBe(0);
    expect(entryLockRepo.device(user.id, 'device_0001')).toBeUndefined();
    const gone = await tryPin('right').expect(404);
    expect(gone.body.error.code).toBe('PIN_GONE');
  });

  it('refuses a device for a key that is not the current one', async () => {
    const { agent } = await signedUpAgent();
    await agent
      .post('/api/entry-lock/devices')
      .send({ deviceId: 'device_0001', verifier: v('x'), keyId: key.keyId, label: 'x' })
      .expect(409);
  });

  it('lists and removes devices', async () => {
    const { agent } = await enrolled();
    const list = (await agent.get('/api/entry-lock/devices').expect(200)).body.items;
    expect(list).toEqual([expect.objectContaining({ id: 'device_0001', label: 'Pixel' })]);
    expect(list[0].serverHalf).toBeUndefined();
    await agent.delete('/api/entry-lock/devices/device_0001').expect(204);
    await agent
      .post('/api/entry-lock/unlock')
      .send({ deviceId: 'device_0001', verifier: v('right') })
      .expect(404);
  });

  it('lists entries still sealed with the vault key, and re-seals them', async () => {
    const { agent } = await enrolled();
    const old = (
      await agent
        .post('/api/writing')
        .send({ sealed: box('old') })
        .expect(201)
    ).body.entry;
    const fresh = (
      await agent
        .post('/api/writing')
        .send({ sealed: box('new', key.keyId) })
        .expect(201)
    ).body.entry;
    const kept = (
      await agent
        .post(`/api/writing/${old.id}/versions`)
        .send({ sealed: box('v-old') })
        .expect(201)
    ).body.version;
    const legacy = (
      await agent.get('/api/entry-lock/legacy').query({ keyId: key.keyId }).expect(200)
    ).body.items;
    expect(legacy).toEqual([{ kind: 'writing', id: old.id }]);
    expect(legacy.some((x: { id: string }) => x.id === fresh.id)).toBe(false);

    // A version left out is refused; a box without the key id is refused.
    await agent
      .post(`/api/writing/${old.id}/reseal`)
      .send({ rev: 1, sealed: box('re', key.keyId), versions: [] })
      .expect(409);
    await agent
      .post(`/api/writing/${old.id}/reseal`)
      .send({ rev: 1, sealed: box('re'), versions: [{ id: kept.id, sealed: box('rv') }] })
      .expect(400);
    const done = await agent
      .post(`/api/writing/${old.id}/reseal`)
      .send({
        rev: 1,
        sealed: box('re', key.keyId),
        versions: [{ id: kept.id, sealed: box('rv', key.keyId) }],
      })
      .expect(200);
    expect(done.body.entry).toMatchObject({ rev: 1, sealed: box('re', key.keyId) });
    const all = JSON.stringify([...stores.versions.values()]);
    expect(all).not.toContain('c-v-old');
    expect(
      (await agent.get('/api/entry-lock/legacy').query({ keyId: key.keyId }).expect(200)).body
        .items,
    ).toEqual([]);
  });

  it('a vault reset removes the entries key and every PIN device', async () => {
    const { agent, user } = await enrolled();
    await agent.post('/api/vault/meta').send({
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
      iterations: 600000,
      wrappedKey: 'AAAA',
      wrapIv: 'AAAAAAAAAAAAAAAA',
    });
    await agent.post('/api/vault/reset').send({ password: 'correct-horse-battery' }).expect(204);
    expect((await agent.get('/api/entry-lock/key').expect(200)).body.key).toBeNull();
    expect(entryLockRepo.device(user.id, 'device_0001')).toBeUndefined();
  });
});
