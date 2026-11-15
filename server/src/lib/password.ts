import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns `scrypt$N$r$p$salt$hash` so parameters can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await derive(password, Buffer.from(saltB64, 'base64url'), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
