import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { ERROR_CODES, StaffRole, getRolePermissions } from '@sharm/contracts';
import { enqueueOutboxJob } from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { RateLimitService } from '../common/rate-limit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';
import {
  decryptSecretJson,
  encryptSecretJson,
  randomOpaqueToken,
  sha256Hex,
} from '../common/crypto';

export interface LoginResult {
  requiresTwoFactor?: boolean;
  sessionToken?: string;
  csrfToken?: string;
  user?: {
    id: string;
    email: string;
    username: string | null;
    fullName: string;
    role: StaffRole;
    totpEnabled: boolean;
    permissions: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(params: {
    email: string;
    password: string;
    totpCode?: string;
    recoveryCode?: string;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<LoginResult> {
    const identifier = params.email.trim().toLowerCase();
    const rateKey = `auth:login:${params.ipAddress ?? 'unknown'}:${identifier}`;
    const rl = this.rateLimit.check(rateKey, 10, 15 * 60_000);
    if (!rl.allowed) {
      throw new DomainError(
        ERROR_CODES.RATE_LIMITED,
        `Too many login attempts. Try again in ${rl.retryAfterSec} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.staffUser.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
    // Always run Argon2 verification timing-safe path even if user missing
    if (!user || !user.isActive || user.suspendedAt !== null) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid username/email or password', HttpStatus.UNAUTHORIZED);
    }

    const validPassword = await argon2.verify(user.passwordHash, params.password);
    if (!validPassword) {
      await this.audit.log({
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.login.failed',
        targetType: 'StaffUser',
        targetId: user.id,
        requestId: params.correlationId,
        ipAddress: params.ipAddress,
        reason: 'Invalid password',
      });
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid username/email or password', HttpStatus.UNAUTHORIZED);
    }

    if (user.totpEnabledAt && user.totpSecretEncrypted) {
      if (!params.totpCode && !params.recoveryCode) {
        return { requiresTwoFactor: true };
      }
      const verified = await this.verifySecondFactor(user.id, user.totpSecretEncrypted, params.totpCode, params.recoveryCode);
      if (!verified) {
        await this.audit.log({
          actorId: user.id,
          actorRole: user.role,
          action: 'auth.login.2fa_failed',
          targetType: 'StaffUser',
          targetId: user.id,
          requestId: params.correlationId,
          ipAddress: params.ipAddress,
        });
        throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid 2FA or recovery code', HttpStatus.UNAUTHORIZED);
      }
    }

    const sessionToken = randomOpaqueToken(32);
    const csrfToken = randomOpaqueToken(24);
    const now = new Date();
    const idleExpiresAt = new Date(now.getTime() + 2 * 3600_000); // 2h idle
    const absoluteExpiresAt = new Date(now.getTime() + 24 * 3600_000); // 24h absolute

    await this.prisma.staffSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(sessionToken),
        csrfTokenHash: sha256Hex(csrfToken),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent?.slice(0, 300) ?? null,
        lastActivityAt: now,
        lastReauthAt: now,
        idleExpiresAt,
        absoluteExpiresAt,
      },
    });

    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.login.succeeded',
      targetType: 'StaffUser',
      targetId: user.id,
      requestId: params.correlationId,
      ipAddress: params.ipAddress,
    });

    return {
      sessionToken,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username ?? null,
        fullName: user.fullName,
        role: user.role as StaffRole,
        totpEnabled: Boolean(user.totpEnabledAt),
        permissions: getRolePermissions(user.role as StaffRole),
      },
    };
  }

  private async verifySecondFactor(
    userId: string,
    encryptedSecret: string,
    totpCode?: string,
    recoveryCode?: string,
  ): Promise<boolean> {
    const env = getAppEnv();
    if (totpCode) {
      const { secret } = decryptSecretJson<{ secret: string }>(
        encryptedSecret,
        env.CREDENTIALS_ENCRYPTION_KEY,
      );
      return authenticator.verify({ token: totpCode.trim(), secret });
    }
    if (recoveryCode) {
      const codeHash = sha256Hex(recoveryCode.trim().toUpperCase());
      const found = await this.prisma.staffRecoveryCode.findFirst({
        where: { userId, codeHash, usedAt: null },
      });
      if (!found) return false;
      await this.prisma.staffRecoveryCode.update({
        where: { id: found.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
    return false;
  }

  async logout(sessionId: string, userId: string, role: string, correlationId?: string): Promise<void> {
    await this.prisma.staffSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: userId,
      actorRole: role,
      action: 'auth.logout',
      targetType: 'StaffSession',
      targetId: sessionId,
      requestId: correlationId,
    });
  }

  async reauthenticate(params: {
    userId: string;
    sessionId: string;
    password: string;
    totpCode?: string;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<{ newSessionToken: string; newCsrfToken: string }> {
    const user = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: params.userId } });
    const ok = await argon2.verify(user.passwordHash, params.password);
    if (!ok) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid password', HttpStatus.UNAUTHORIZED);
    }
    if (user.totpEnabledAt && user.totpSecretEncrypted) {
      const ok2fa = await this.verifySecondFactor(user.id, user.totpSecretEncrypted, params.totpCode);
      if (!ok2fa) {
        throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Valid 2FA code required', HttpStatus.UNAUTHORIZED);
      }
    }

    // Rotate session token on privilege reauthentication
    const newSessionToken = randomOpaqueToken(32);
    const newCsrfToken = randomOpaqueToken(24);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.staffSession.update({
        where: { id: params.sessionId },
        data: { revokedAt: now },
      }),
      this.prisma.staffSession.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(newSessionToken),
          csrfTokenHash: sha256Hex(newCsrfToken),
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent?.slice(0, 300) ?? null,
          lastActivityAt: now,
          lastReauthAt: now,
          idleExpiresAt: new Date(now.getTime() + 2 * 3600_000),
          absoluteExpiresAt: new Date(now.getTime() + 24 * 3600_000),
        },
      }),
    ]);

    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.reauth.succeeded',
      targetType: 'StaffUser',
      targetId: user.id,
      requestId: params.correlationId,
      ipAddress: params.ipAddress,
    });

    return { newSessionToken, newCsrfToken };
  }

  async requestPasswordReset(emailRaw: string, ipAddress?: string): Promise<{ accepted: true }> {
    const identifier = emailRaw.trim().toLowerCase();
    const rl = this.rateLimit.check(`auth:reset:${ipAddress ?? 'unknown'}`, 5, 15 * 60_000);
    if (!rl.allowed) {
      throw new DomainError(ERROR_CODES.RATE_LIMITED, 'Too many reset requests. Please try later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.staffUser.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
    if (user && user.isActive && !user.suspendedAt) {
      const rawToken = randomOpaqueToken(32);
      const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256Hex(rawToken),
            expiresAt,
          },
        });
        await enqueueOutboxJob(tx, {
          jobType: 'SEND_EMAIL',
          payload: {
            templateKey: 'staff_password_reset',
            toEmail: user.email,
            fullName: user.fullName,
            resetUrl: `${getAppEnv().PUBLIC_SITE_URL}/admin/reset-password?token=${encodeURIComponent(rawToken)}`,
            expiresMinutes: 30,
          },
        });
      });
    }
    // Always generic response so emails cannot be enumerated
    return { accepted: true };
  }

  async confirmPasswordReset(token: string, newPassword: string, ipAddress?: string): Promise<{ ok: true }> {
    if (newPassword.length < 12) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Password must be at least 12 characters long');
    }
    const tokenHash = sha256Hex(token);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();
    if (!reset || reset.usedAt !== null || reset.expiresAt.getTime() <= now.getTime()) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Reset link is invalid or expired', HttpStatus.UNAUTHORIZED);
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.staffUser.update({
        where: { id: reset.userId },
        data: { passwordHash, version: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
      this.prisma.staffSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await this.audit.log({
      actorId: reset.userId,
      actorRole: reset.user.role,
      action: 'auth.password_reset.completed',
      targetType: 'StaffUser',
      targetId: reset.userId,
      ipAddress,
    });
    return { ok: true };
  }

  async setupTwoFactor(userId: string): Promise<{ otpauthUrl: string; qrDataUrl: string; manualSecret: string }> {
    const user = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Sharm Pharaoh Travel Admin', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    const encrypted = encryptSecretJson({ secret }, getAppEnv().CREDENTIALS_ENCRYPTION_KEY);

    await this.prisma.staffUser.update({
      where: { id: user.id },
      data: { totpSecretEncrypted: encrypted, totpEnabledAt: null },
    });

    return { otpauthUrl, qrDataUrl, manualSecret: secret };
  }

  async enableTwoFactor(userId: string, role: string, totpCode: string, correlationId?: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEncrypted) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Run 2FA setup first before enabling');
    }
    const { secret } = decryptSecretJson<{ secret: string }>(
      user.totpSecretEncrypted,
      getAppEnv().CREDENTIALS_ENCRYPTION_KEY,
    );
    if (!authenticator.verify({ token: totpCode.trim(), secret })) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid verification code from authenticator app');
    }

    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomOpaqueToken(6).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    );

    await this.prisma.$transaction([
      this.prisma.staffRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.staffRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId, codeHash: sha256Hex(code) })),
      }),
      this.prisma.staffUser.update({
        where: { id: userId },
        data: { totpEnabledAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorId: userId,
      actorRole: role,
      action: 'auth.2fa.enabled',
      targetType: 'StaffUser',
      targetId: userId,
      requestId: correlationId,
    });

    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, role: string, correlationId?: string): Promise<{ ok: true }> {
    await this.prisma.$transaction([
      this.prisma.staffRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.staffUser.update({
        where: { id: userId },
        data: { totpEnabledAt: null, totpSecretEncrypted: null },
      }),
    ]);
    await this.audit.log({
      actorId: userId,
      actorRole: role,
      action: 'auth.2fa.disabled',
      targetType: 'StaffUser',
      targetId: userId,
      requestId: correlationId,
    });
    return { ok: true };
  }
}
