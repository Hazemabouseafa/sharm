import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { z } from 'zod';
import { ERROR_CODES, getRolePermissions } from '@sharm/contracts';
import { AuthService } from './auth.service';
import {
  RequireRecentReauth,
  RequestWithStaff,
  STAFF_COOKIE_NAME,
  StaffAuthGuard,
} from '../common/auth.guard';
import { resolveCookieSecure } from '../common/env';
import { DomainError } from '../common/http-exception.filter';
import { PrismaService } from '../common/prisma.service';
import { randomOpaqueToken, sha256Hex } from '../common/crypto';

const LoginBodySchema = z
  .object({
    email: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1),
    totpCode: z.string().optional(),
    recoveryCode: z.string().optional(),
  })
  .refine((d) => Boolean(d.email || d.username), {
    message: 'Username or email is required',
  });

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private setSessionCookie(res: Response, token: string, req?: RequestWithStaff): void {
    const secure = resolveCookieSecure(req);
    res.cookie(STAFF_COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 3600_000,
    });
  }

  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: RequestWithStaff,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = LoginBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Username or email and password are required');
    }
    const identifier = (parsed.data.email || parsed.data.username)!;
    const result = await this.auth.login({
      email: identifier,
      password: parsed.data.password,
      totpCode: parsed.data.totpCode,
      recoveryCode: parsed.data.recoveryCode,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
      correlationId: req.correlationId,
    });
    if (result.requiresTwoFactor) {
      return { requiresTwoFactor: true };
    }
    this.setSessionCookie(res, result.sessionToken!, req);
    return {
      user: result.user,
      csrfToken: result.csrfToken,
    };
  }

  @UseGuards(StaffAuthGuard)
  @Get('me')
  async me(@Req() req: RequestWithStaff) {
    const staff = req.staff!;
    const user = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staff.userId } });
    // Issue a fresh CSRF token bound to this active session so browser reload recovers cleanly without storing tokens in localStorage
    const csrfToken = randomOpaqueToken(24);
    await this.prisma.staffSession.update({
      where: { id: staff.sessionId },
      data: { csrfTokenHash: sha256Hex(csrfToken) },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username ?? null,
        fullName: user.fullName,
        role: user.role,
        totpEnabled: Boolean(user.totpEnabledAt),
        permissions: getRolePermissions(staff.role),
        lastReauthAt: staff.lastReauthAt,
      },
      csrfToken,
    };
  }

  @UseGuards(StaffAuthGuard)
  @Post('logout')
  async logout(@Req() req: RequestWithStaff, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.staff!.sessionId, req.staff!.userId, req.staff!.role, req.correlationId);
    res.clearCookie(STAFF_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: resolveCookieSecure(req),
      sameSite: 'lax',
    });
    res.setHeader('Clear-Site-Data', '"cookies", "storage", "cache"');
    return { ok: true };
  }

  @UseGuards(StaffAuthGuard)
  @Post('reauth')
  async reauth(
    @Body() body: { password?: string; totpCode?: string },
    @Req() req: RequestWithStaff,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.password) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Password is required');
    }
    const { newSessionToken, newCsrfToken } = await this.auth.reauthenticate({
      userId: req.staff!.userId,
      sessionId: req.staff!.sessionId,
      password: body.password,
      totpCode: body.totpCode,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
      correlationId: req.correlationId,
    });
    this.setSessionCookie(res, newSessionToken, req);
    return { ok: true, csrfToken: newCsrfToken };
  }

  @Post('password-reset/request')
  async requestReset(@Body() body: { email?: string }, @Req() req: RequestWithStaff) {
    if (!body?.email || typeof body.email !== 'string') {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Email is required');
    }
    return this.auth.requestPasswordReset(body.email, req.ip);
  }

  @Post('password-reset/confirm')
  async confirmReset(@Body() body: { token?: string; newPassword?: string }, @Req() req: RequestWithStaff) {
    if (!body?.token || !body?.newPassword) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Token and newPassword are required');
    }
    return this.auth.confirmPasswordReset(body.token, body.newPassword, req.ip);
  }

  @UseGuards(StaffAuthGuard)
  @Post('2fa/setup')
  async setup2fa(@Req() req: RequestWithStaff) {
    return this.auth.setupTwoFactor(req.staff!.userId);
  }

  @UseGuards(StaffAuthGuard)
  @Post('2fa/enable')
  async enable2fa(@Body() body: { totpCode?: string }, @Req() req: RequestWithStaff) {
    if (!body?.totpCode) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Authenticator code is required');
    }
    return this.auth.enableTwoFactor(req.staff!.userId, req.staff!.role, body.totpCode, req.correlationId);
  }

  @UseGuards(StaffAuthGuard)
  @RequireRecentReauth(15)
  @Post('2fa/disable')
  async disable2fa(@Req() req: RequestWithStaff) {
    return this.auth.disableTwoFactor(req.staff!.userId, req.staff!.role, req.correlationId);
  }
}
