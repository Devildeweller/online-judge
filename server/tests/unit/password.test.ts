import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery stapler', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$abc')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$16384$8$1$onlysalt')).toBe(false);
  });
});
