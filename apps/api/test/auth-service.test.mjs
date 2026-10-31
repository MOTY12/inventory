import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { JwtService } from "@nestjs/jwt";
import { AccessTokenService } from "../dist/identity/access-token.service.js";
import { AccessTokenGuard } from "../dist/identity/access-token.guard.js";
import { AuthService } from "../dist/identity/auth.service.js";
import { AuthRateLimiter } from "../dist/identity/auth-rate-limiter.js";
import { DevelopmentEmailDelivery } from "../dist/identity/email-delivery.js";
import { PasswordHasher } from "../dist/identity/password-hasher.js";

class FakePrisma {
  users = [];
  sessions = [];
  verificationTokens = [];
  resetTokens = [];

  constructor() {
    this.user = {
      create: async ({ data }) => {
        if (
          this.users.some(
            (user) => user.emailNormalized === data.emailNormalized,
          )
        ) {
          const error = new Error("unique constraint");
          error.code = "P2002";
          throw error;
        }
        const user = {
          id: randomUUID(),
          email: data.email,
          emailNormalized: data.emailNormalized,
          passwordHash: data.passwordHash,
          status: "PENDING_VERIFICATION",
          emailVerifiedAt: null,
        };
        this.users.push(user);
        if (data.verificationTokens?.create) {
          this.verificationTokens.push({
            id: randomUUID(),
            userId: user.id,
            ...data.verificationTokens.create,
            consumedAt: null,
          });
        }
        return user;
      },
      findUnique: async ({ where }) =>
        this.users.find((user) =>
          where.emailNormalized
            ? user.emailNormalized === where.emailNormalized
            : user.id === where.id,
        ) ?? null,
      update: async ({ where, data }) => {
        const user = this.users.find((item) => item.id === where.id);
        Object.assign(user, data);
        return user;
      },
      updateMany: async ({ where, data }) => {
        const found = this.users.filter(
          (user) =>
            user.id === where.id &&
            user.status === where.status &&
            user.emailVerifiedAt === where.emailVerifiedAt,
        );
        for (const user of found) Object.assign(user, data);
        return { count: found.length };
      },
    };
    this.refreshSession = {
      create: async ({ data }) => {
        const session = { id: randomUUID(), revokedAt: null, ...data };
        this.sessions.push(session);
        return session;
      },
      findUnique: async ({ where, include }) => {
        const session = this.sessions.find(
          (item) => item.tokenHash === where.tokenHash,
        );
        return session && include?.user
          ? {
              ...session,
              user: this.users.find((user) => user.id === session.userId),
            }
          : (session ?? null);
      },
      findFirst: async ({ where }) =>
        this.sessions.find(
          (session) =>
            session.id === where.id &&
            session.userId === where.userId &&
            !session.revokedAt &&
            session.expiresAt > where.expiresAt.gt,
        ) ?? null,
      updateMany: async ({ where, data }) => {
        const found = this.sessions.filter((session) => {
          if (where.id) return session.id === where.id && !session.revokedAt;
          if (where.familyId)
            return session.familyId === where.familyId && !session.revokedAt;
          if (where.tokenHash)
            return session.tokenHash === where.tokenHash && !session.revokedAt;
          if (where.userId)
            return session.userId === where.userId && !session.revokedAt;
          return false;
        });
        for (const session of found) Object.assign(session, data);
        return { count: found.length };
      },
    };
    this.emailVerificationToken = {
      findUnique: async ({ where }) =>
        this.verificationTokens.find(
          (token) => token.tokenHash === where.tokenHash,
        ) ?? null,
      updateMany: async ({ where, data }) => {
        const found = this.verificationTokens.filter(
          (token) =>
            token.id === where.id &&
            !token.consumedAt &&
            token.expiresAt > where.expiresAt.gt,
        );
        for (const token of found) Object.assign(token, data);
        return { count: found.length };
      },
    };
    this.passwordResetToken = {
      create: async ({ data }) => {
        const token = { id: randomUUID(), consumedAt: null, ...data };
        this.resetTokens.push(token);
        return token;
      },
      findUnique: async ({ where }) =>
        this.resetTokens.find((token) => token.tokenHash === where.tokenHash) ??
        null,
      updateMany: async ({ where, data }) => {
        const found = this.resetTokens.filter(
          (token) =>
            token.id === where.id &&
            !token.consumedAt &&
            token.expiresAt > where.expiresAt.gt,
        );
        for (const token of found) Object.assign(token, data);
        return { count: found.length };
      },
    };
  }

  async $transaction(callback) {
    return callback(this);
  }
}

function createAuth(prisma = new FakePrisma()) {
  const mail = new DevelopmentEmailDelivery();
  const auth = new AuthService(
    prisma,
    new PasswordHasher(),
    new AccessTokenService(
      new JwtService(),
      "a-local-test-secret-with-more-than-32-bytes",
    ),
    mail,
  );
  return { auth, mail, prisma };
}

test("registration stores only a password verifier and sends a one-time verification message", async () => {
  const { auth, mail, prisma } = createAuth();
  await auth.register(" Test@Example.com ", "a long password that passes 123");

  assert.equal(prisma.users[0].emailNormalized, "test@example.com");
  assert.match(prisma.users[0].passwordHash, /^\$argon2id\$/);
  assert.equal(prisma.verificationTokens[0].tokenHash.length, 64);
  assert.notEqual(
    prisma.verificationTokens[0].tokenHash,
    mail.messages[0].token,
  );
  assert.equal(mail.messages[0].type, "verify-email");
  const duplicateResponse = await auth.register(
    "test@example.com",
    "a long password that passes 123",
  );
  assert.match(duplicateResponse.message, /If the address can be registered/);
  assert.equal(prisma.users.length, 1);
});

test("login requires verified credentials and returns an access token with a persisted refresh digest", async () => {
  const { auth, mail, prisma } = createAuth();
  await auth.register("person@example.com", "correct horse battery staple 42");
  await auth.verifyEmail(mail.messages[0].token);

  const session = await auth.login(
    "person@example.com",
    "correct horse battery staple 42",
  );
  const accessTokens = new AccessTokenService(
    new JwtService(),
    "a-local-test-secret-with-more-than-32-bytes",
  );
  assert.deepEqual(await accessTokens.verify(session.accessToken), {
    sub: prisma.users[0].id,
    sid: prisma.sessions[0].id,
  });
  assert.equal(prisma.sessions.length, 1);
  assert.equal(prisma.sessions[0].tokenHash.length, 64);
  assert.notEqual(prisma.sessions[0].tokenHash, session.refreshToken);
  await assert.rejects(
    auth.login("person@example.com", "incorrect password"),
    /Invalid email or password/,
  );
});

test("refresh rotates once and reuse revokes the remaining token family", async () => {
  const { auth, mail, prisma } = createAuth();
  await auth.register("person@example.com", "correct horse battery staple 42");
  await auth.verifyEmail(mail.messages[0].token);
  const first = await auth.login(
    "person@example.com",
    "correct horse battery staple 42",
  );

  const second = await auth.rotateRefreshToken(first.refreshToken);
  assert.equal(prisma.sessions[0].revokedAt instanceof Date, true);
  await assert.rejects(
    auth.rotateRefreshToken(first.refreshToken),
    /Invalid refresh session/,
  );
  assert.equal(
    prisma.sessions.every((session) => session.revokedAt instanceof Date),
    true,
  );
  await assert.rejects(
    auth.rotateRefreshToken(second.refreshToken),
    /Invalid refresh session/,
  );
});

test("logout revokes the access-token session and protected routes reject it", async () => {
  const { auth, mail, prisma } = createAuth();
  await auth.register("person@example.com", "correct horse battery staple 42");
  await auth.verifyEmail(mail.messages[0].token);
  const session = await auth.login(
    "person@example.com",
    "correct horse battery staple 42",
  );
  const request = {
    headers: { authorization: `Bearer ${session.accessToken}` },
  };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  const accessTokens = new AccessTokenService(
    new JwtService(),
    "a-local-test-secret-with-more-than-32-bytes",
  );
  const guard = new AccessTokenGuard(accessTokens, prisma);
  assert.equal(await guard.canActivate(context), true);

  await auth.logout(session.refreshToken);
  await assert.rejects(
    guard.canActivate(context),
    (error) => error.getStatus() === 401,
  );
});

test("password recovery uses a one-time token and revokes active sessions", async () => {
  const { auth, mail, prisma } = createAuth();
  await auth.register("person@example.com", "correct horse battery staple 42");
  await auth.verifyEmail(mail.messages[0].token);
  await auth.login("person@example.com", "correct horse battery staple 42");

  await auth.requestPasswordReset("person@example.com");
  const resetToken = mail.messages.at(-1).token;
  await auth.resetPassword(resetToken, "a replacement password with 123");
  assert.equal(prisma.sessions[0].revokedAt instanceof Date, true);
  await assert.rejects(
    auth.resetPassword(resetToken, "another replacement password 123"),
  );
  await assert.rejects(
    auth.login("person@example.com", "correct horse battery staple 42"),
  );
  await assert.doesNotReject(
    auth.login("person@example.com", "a replacement password with 123"),
  );
});

test("auth rate limiter rejects excess attempts within a rolling minute", () => {
  const limiter = new AuthRateLimiter();
  for (let index = 0; index < 3; index += 1) limiter.consume("ip", 1000, 3);
  assert.throws(
    () => limiter.consume("ip", 1001, 3),
    (error) => error.getStatus() === 429,
  );
  assert.doesNotThrow(() => limiter.consume("ip", 62_000, 3));
});
