import * as argon2 from "argon2";

export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  async verify(passwordHash: string, candidate: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, candidate);
    } catch {
      return false;
    }
  }
}
