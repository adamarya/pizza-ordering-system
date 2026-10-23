import { describe, expect, it } from 'vitest';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../src/modules/auth/password.js';

// S2-02: passwords are stored only as salted Argon2id hashes. No database is needed here.
describe('password hashing (S2-02)', () => {
  it('stores an Argon2id hash, never the password itself', async () => {
    const hash = await hashPassword('Correct-Horse-9!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Correct-Horse-9!');
  });

  it('salts each hash, so the same password gives a different hash every time', async () => {
    const [a, b] = await Promise.all([hashPassword('Correct-Horse-9!'), hashPassword('Correct-Horse-9!')]);
    expect(a).not.toBe(b);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Correct-Horse-9!');
    expect(await verifyPassword(hash, 'Correct-Horse-9!')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse-9!')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('treats a malformed stored hash as a mismatch instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });

  it('keeps the minimum length at twelve characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });
});