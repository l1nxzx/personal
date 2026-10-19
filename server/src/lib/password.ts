import bcrypt from 'bcryptjs';

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
