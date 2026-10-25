import { Algorithm, hash, verify } from '@node-rs/argon2';

// Password hashing for staff and manager accounts (S2-02, PB-11).
// Passwords are stored only as Argon2id hashes, the algorithm the OWASP password storage guidance
// recommends first. Each hash carries its own random salt and its parameters, so two accounts with
// the same password get different hashes and the cost can be raised later without a migration.
//
// Parameters follow the OWASP minimum for Argon2id: 19 MiB of memory, 2 passes, 1 lane.
const OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** The shortest password a new account or a reset may use (S2-04 enforces it at sign-in and reset). */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128; // long enough for any passphrase; stops huge inputs from slowing Argon2

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** True only when the password matches the stored hash. A malformed hash is a mismatch, not an error. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}