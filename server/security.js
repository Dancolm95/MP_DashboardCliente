import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, saved) {
  if (!saved?.includes(':')) return false;
  const [salt, hashHex] = saved.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function newSessionToken() { return randomBytes(32).toString('hex'); }
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function publicUser(user) { return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt }; }
