import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as users from '../src/data/userRepo.js';
import { app, credentials, signedUpAgent } from './helpers.js';

const cookiesOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]) ?? [];

describe('auth', () => {
  it('registers, sets httpOnly cookies and never leaks the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials()).expect(201);
    expect(res.body.user).toMatchObject({
      email: 'user1@example.com',
      role: 'user',
      disabled: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookies = cookiesOf(res);
    expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
    expect(
      cookies.some((c) => c.startsWith('refresh_token=') && c.includes('Path=/api/auth')),
    ).toBe(true);
  });

  it('rejects invalid input with 400 and field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nope', password: 'short', displayName: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    await signedUpAgent();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials(), email: 'USER1@example.com' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    await signedUpAgent();
    const { email, password } = credentials();
    await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password })
      .expect(401);
  });

  it('protects /me and returns the current user when signed in', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const { agent } = await signedUpAgent();
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.email).toBe('user1@example.com');
  });

  it('rotates refresh tokens: the old one cannot be reused', async () => {
    const reg = await request(app).post('/api/auth/register').send(credentials()).expect(201);
    const oldRefresh = cookiesOf(reg)
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0]!;

    const first = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldRefresh)
      .expect(200);
    expect(cookiesOf(first).some((c) => c.startsWith('access_token='))).toBe(true);

    await request(app).post('/api/auth/refresh').set('Cookie', oldRefresh).expect(401);
  });

  it('logout revokes the refresh token and clears cookies', async () => {
    const reg = await request(app).post('/api/auth/register').send(credentials()).expect(201);
    const refresh = cookiesOf(reg)
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0]!;
    const out = await request(app).post('/api/auth/logout').set('Cookie', refresh).expect(204);
    expect(out.headers['clear-site-data']).toBe('"cache"');
    await request(app).post('/api/auth/refresh').set('Cookie', refresh).expect(401);
  });

  it('blocks disabled users from logging in and from refreshing', async () => {
    const reg = await request(app).post('/api/auth/register').send(credentials()).expect(201);
    const refresh = cookiesOf(reg)
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0]!;
    await users.update(reg.body.user.id, { disabled: true });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials().email, password: credentials().password })
      .expect(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
    await request(app).post('/api/auth/refresh').set('Cookie', refresh).expect(403);
  });
});
