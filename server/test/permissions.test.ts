import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { can, canModifyUser } from '../src/permissions.js';
import { app, loggedInAs, signedUpAgent } from './helpers.js';

describe('permissions module', () => {
  it('grants permissions by role', () => {
    expect(can({ role: 'user' }, 'content:manage-own')).toBe(true);
    expect(can({ role: 'user' }, 'users:read')).toBe(false);
    expect(can({ role: 'admin' }, 'users:update')).toBe(true);
    expect(can({ role: 'superadmin' }, 'users:update')).toBe(true);
  });

  it('applies the user-modification rules', () => {
    const admin = { id: 'a', role: 'admin' } as const;
    const root = { id: 'r', role: 'superadmin' } as const;
    expect(canModifyUser({ id: 'u', role: 'user' }, { id: 'x', role: 'user' }, {})).toBe(false);
    expect(canModifyUser(admin, { id: 'x', role: 'user' }, { role: 'admin' })).toBe(false); // can't grant own rank
    expect(canModifyUser(admin, { id: 'x', role: 'user' }, { disabled: true })).toBe(true);
    expect(canModifyUser(admin, { id: 'y', role: 'admin' }, { disabled: true })).toBe(false); // peer
    expect(canModifyUser(admin, { id: 'z', role: 'superadmin' }, { disabled: true })).toBe(false);
    expect(canModifyUser(admin, { id: 'a', role: 'admin' }, { disabled: true })).toBe(false); // self
    expect(canModifyUser(root, { id: 'y', role: 'admin' }, { role: 'superadmin' })).toBe(true);
    expect(canModifyUser(root, { id: 'r', role: 'superadmin' }, { disabled: true })).toBe(false); // self
  });
});

describe('user management routes', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/users').expect(401);
  });

  it('forbids plain users', async () => {
    const { agent } = await signedUpAgent();
    await agent.get('/api/users').expect(403);
  });

  it('lets an admin list users and disable a user, whose sessions are then revoked', async () => {
    const { agent: victim, user } = await signedUpAgent(1);
    const { agent: admin } = await loggedInAs('admin');

    const list = await admin.get('/api/users').expect(200);
    expect(list.body.items.length).toBe(2);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');

    await admin.patch(`/api/users/${user.id}`).send({ disabled: true }).expect(200);
    await victim.post('/api/auth/refresh').expect(401);
  });

  it('stops an admin from touching a superadmin or promoting to superadmin', async () => {
    const { user: root } = await loggedInAs('superadmin', 200);
    const { user: plain } = await signedUpAgent(1);
    const { agent: admin } = await loggedInAs('admin', 201);

    await admin.patch(`/api/users/${root.id}`).send({ disabled: true }).expect(403);
    await admin.patch(`/api/users/${plain.id}`).send({ role: 'superadmin' }).expect(403);
  });

  it('lets a superadmin change roles', async () => {
    const { user: plain } = await signedUpAgent(1);
    const { agent: root } = await loggedInAs('superadmin', 200);
    const res = await root.patch(`/api/users/${plain.id}`).send({ role: 'admin' }).expect(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects unknown fields and empty updates', async () => {
    const { user } = await signedUpAgent(1);
    const { agent: root } = await loggedInAs('superadmin', 200);
    await root.patch(`/api/users/${user.id}`).send({ passwordHash: 'x' }).expect(400);
    await root.patch(`/api/users/${user.id}`).send({}).expect(400);
  });
});
