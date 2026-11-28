import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { AuthenticatedRequest, AccessTokenGuard } from "./access-token.guard";
import { AuthRateLimiter } from "./auth-rate-limiter";
import { AuthService } from "./auth.service";
import {
  DevelopmentEmailDelivery,
  EMAIL_DELIVERY,
  EmailDelivery,
} from "./email-delivery";
import { issueRefreshToken } from "./refresh-token";
import {
  EmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from "./auth.dto";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const csrfCookie = "csrf_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AuthRateLimiter,
    @Inject(EMAIL_DELIVERY) private readonly emailDelivery: EmailDelivery,
  ) {}

  @Get("csrf")
  @ApiOperation({
    summary: "Issue a CSRF token for cookie-authenticated requests",
  })
  csrf(@Res({ passthrough: true }) response: Response) {
    const token = issueRefreshToken().token;
    this.setCsrfCookie(response, token);
    return { csrfToken: token };
  }

  @Get("dev-mailbox")
  @ApiExcludeEndpoint()
  devMailbox(@Query() input: EmailDto, @Req() request: Request) {
    if (
      process.env.NODE_ENV !== "development" ||
      !isLoopbackAddress(request.ip) ||
      !(this.emailDelivery instanceof DevelopmentEmailDelivery)
    ) {
      throw new NotFoundException();
    }
    return { messages: this.emailDelivery.readMessages(input.email) };
  }

  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Register an account and send email verification" })
  register(@Body() input: RegisterDto, @Req() request: Request) {
    this.limiter.consume(`register:${request.ip}`);
    return this.auth.register(input.email, input.password);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sign in and create a refresh session" })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limiter.consume(`login:${request.ip}`);
    const session = await this.auth.login(input.email, input.password);
    this.setSessionCookies(response, session.refreshToken, session.csrfToken);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      csrfToken: session.csrfToken,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate the refresh session" })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.limiter.consume(`refresh:${request.ip}`);
    const refreshToken = readCookie(request, this.refreshCookieName());
    this.assertCsrf(request, refreshToken);
    const session = await this.auth.rotateRefreshToken(refreshToken!);
    this.setSessionCookies(response, session.refreshToken, session.csrfToken);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      csrfToken: session.csrfToken,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the current refresh session" })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = readCookie(request, this.refreshCookieName());
    if (refreshToken) this.assertCsrf(request, refreshToken);
    await this.auth.logout(refreshToken);
    this.clearSessionCookies(response);
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the authenticated user profile" })
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.getUser(request.auth!.sub);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() input: TokenDto, @Req() request: Request) {
    this.limiter.consume(`verify:${request.ip}`, Date.now(), 5);
    return this.auth.verifyEmail(input.token);
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(@Body() input: EmailDto, @Req() request: Request) {
    this.limiter.consume(`resend:${request.ip}`);
    return this.auth.resendVerification(input.email);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() input: EmailDto, @Req() request: Request) {
    this.limiter.consume(`recovery:${request.ip}`, Date.now(), 5);
    return this.auth.requestPasswordReset(input.email);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request) {
    this.limiter.consume(`reset:${request.ip}`, Date.now(), 5);
    return this.auth.resetPassword(input.token, input.password);
  }

  private setSessionCookies(
    response: Response,
    refresh: string,
    csrf: string,
  ): void {
    const secure = process.env.NODE_ENV === "production";
    response.cookie(this.refreshCookieName(), refresh, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: secure ? "/" : "/api/v1/auth",
      maxAge: REFRESH_TTL_MS,
    });
    this.setCsrfCookie(response, csrf);
  }

  private setCsrfCookie(response: Response, csrf: string): void {
    const secure = process.env.NODE_ENV === "production";
    response.cookie(csrfCookie, csrf, {
      httpOnly: false,
      secure,
      sameSite: "strict",
      path: secure ? "/" : "/api/v1/auth",
      maxAge: REFRESH_TTL_MS,
    });
  }

  private clearSessionCookies(response: Response): void {
    const secure = process.env.NODE_ENV === "production";
    const path = secure ? "/" : "/api/v1/auth";
    response.clearCookie(this.refreshCookieName(), {
      path,
      secure,
      sameSite: "strict",
    });
    response.clearCookie(csrfCookie, { path, secure, sameSite: "strict" });
  }

  private refreshCookieName(): string {
    return process.env.NODE_ENV === "production"
      ? "__Host-refresh_token"
      : "refresh_token";
  }

  private assertCsrf(request: Request, refreshToken: string | undefined): void {
    const cookie = readCookie(request, csrfCookie);
    const header = request.headers["x-csrf-token"];
    const cookieBytes = cookie ? Buffer.from(cookie) : undefined;
    const headerBytes =
      typeof header === "string" ? Buffer.from(header) : undefined;
    if (
      !refreshToken ||
      !cookieBytes ||
      !headerBytes ||
      cookieBytes.length !== headerBytes.length ||
      !timingSafeEqual(cookieBytes, headerBytes)
    ) {
      throw new UnauthorizedException("Invalid session request");
    }
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}
