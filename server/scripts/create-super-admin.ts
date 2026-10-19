/**
 * Creates the first super admin (or promotes an existing user to it).
 *
 *   npm run create-super-admin -- --email you@example.com --name "Your Name" [--password ...]
 *
 * Omitted values are prompted for. The password can also come from SUPERADMIN_PASSWORD.
 */
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import * as users from '../src/data/userRepo.js';
import { hashPassword } from '../src/lib/password.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (label: string, given?: string) => given ?? (await rl.question(`${label}: `));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .parse(await ask('Email', values.email));
const existing = await users.findByEmail(email);

if (existing) {
  await users.update(existing.id, { role: 'superadmin', disabled: false });
  console.log(`Promoted existing user ${email} to superadmin.`);
} else {
  const displayName = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .parse(await ask('Display name', values.name));
  const password = z
    .string()
    .min(8)
    .max(72)
    .parse(
      await ask(
        'Password (8-72 chars, shown as you type)',
        values.password ?? process.env.SUPERADMIN_PASSWORD,
      ),
    );
  const user = await users.create({
    email,
    displayName,
    passwordHash: await hashPassword(password),
    role: 'superadmin',
    disabled: false,
    createdAt: new Date().toISOString(),
  });
  console.log(`Created superadmin ${email} (id ${user.id}).`);
}

rl.close();
process.exit(0);
