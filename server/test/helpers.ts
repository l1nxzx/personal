import request from 'supertest';
import { createApp } from '../src/app.js';
import * as users from '../src/data/userRepo.js';
import { hashPassword } from '../src/lib/password.js';
import type { Role } from '../../shared/types.js';

export const app = createApp();

export const credentials = (n = 1) => ({
  email: `user${n}@example.com`,
  password: 'correct-horse-battery',
  displayName: `User ${n}`,
});

/** Registers through the API and returns an agent holding the session cookies. */
export async function signedUpAgent(n = 1) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(credentials(n)).expect(201);
  return { agent, user: res.body.user as { id: string; role: Role } };
}

/** Seeds a user with a given role directly, then logs in through the API. */
export async function loggedInAs(role: Role, n = 100) {
  const c = credentials(n);
  const user = await users.create({
    email: c.email,
    displayName: c.displayName,
    passwordHash: await hashPassword(c.password),
    role,
    disabled: false,
    createdAt: new Date().toISOString(),
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: c.email, password: c.password }).expect(200);
  return { agent, user };
}
