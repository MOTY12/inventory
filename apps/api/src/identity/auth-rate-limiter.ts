import { HttpException, HttpStatus } from "@nestjs/common";

export class AuthRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  consume(key: string, now = Date.now(), maxAttempts = 10): void {
    if (!this.attempts.has(key) && this.attempts.size >= 10_000) {
      for (const [candidate, timestamps] of this.attempts) {
        if (timestamps.some((timestamp) => now - timestamp < 60_000)) continue;
        this.attempts.delete(candidate);
        if (this.attempts.size < 10_000) break;
      }
      if (this.attempts.size >= 10_000) {
        throw new HttpException(
          { code: "RATE_LIMITED", message: "Too many authentication attempts" },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < 60_000,
    );
    if (recent.length >= maxAttempts) {
      throw new HttpException(
        { code: "RATE_LIMITED", message: "Too many authentication attempts" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.attempts.set(key, recent);
  }
}
