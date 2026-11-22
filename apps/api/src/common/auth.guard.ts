import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ERROR_CODES, Permission, StaffRole, roleHasPermission } from '@sharm/contracts';
import { PrismaService } from './prisma.service';
import { sha256Hex, timingSafeEqualStr } from './crypto';
import { DomainError } from './http-exception.filter';

export const STAFF_COOKIE_NAME = 'spt_staff_session';
export const GUEST_COOKIE_NAME = 'spt_guest_session';

export const PERMISSIONS_KEY = 'required_permissions';
export const REAUTH_MAX_AGE_MINUTES_KEY = 'reauth_max_age_minutes';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireRecentReauth = (maxAgeMinutes = 15) =>
  SetMetadata(REAUTH_MAX_AGE_MINUTES_KEY, maxAgeMinutes);

export interface AuthenticatedStaff {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  role: StaffRole;
  csrfTokenHash: string;
  lastReauthAt: Date;
}

export interface RequestWithStaff extends Request {
  staff?: AuthenticatedStaff;
  correlationId?: string;
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithStaff>();
    const rawCookie = req.cookies?.[STAFF_COOKIE_NAME];
    if (!rawCookie || typeof rawCookie !== 'string') {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Staff authentication required', HttpStatus.UNAUTHORIZED);
    }

    const tokenHash = sha256Hex(rawCookie);
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt !== null ||
      session.idleExpiresAt.getTime() <= now.getTime() ||
      session.absoluteExpiresAt.getTime() <= now.getTime() ||
      !session.user.isActive ||
      session.user.suspendedAt !== null
    ) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Session is invalid, expired, or revoked', HttpStatus.UNAUTHORIZED);
    }

    // CSRF protection for cookie-authenticated state-changing requests
    const method = req.method.toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfHeader = req.header('x-csrf-token') ?? '';
      if (!csrfHeader || !timingSafeEqualStr(sha256Hex(csrfHeader), session.csrfTokenHash)) {
        throw new DomainError(ERROR_CODES.FORBIDDEN, 'Missing or invalid CSRF token', HttpStatus.FORBIDDEN);
      }
    }

    // Extend sliding idle expiry (2 hours)
    const nextIdle = new Date(Math.min(session.absoluteExpiresAt.getTime(), now.getTime() + 2 * 3600_000));
    await this.prisma.staffSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now, idleExpiresAt: nextIdle },
    });

    const staff: AuthenticatedStaff = {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role as StaffRole,
      csrfTokenHash: session.csrfTokenHash,
      lastReauthAt: session.lastReauthAt,
    };
    req.staff = staff;

    // Role permission enforcement
    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const perm of requiredPermissions) {
      if (!roleHasPermission(staff.role, perm)) {
        throw new DomainError(
          ERROR_CODES.FORBIDDEN,
          `Insufficient permissions (${perm})`,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Recent re-authentication check for sensitive security/provider settings
    const reauthMinutes = this.reflector.getAllAndOverride<number | undefined>(
      REAUTH_MAX_AGE_MINUTES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (reauthMinutes !== undefined) {
      const ageMs = now.getTime() - session.lastReauthAt.getTime();
      if (ageMs > reauthMinutes * 60_000) {
        throw new DomainError(
          ERROR_CODES.REAUTH_REQUIRED,
          'Recent password/2FA confirmation is required for this sensitive action',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return true;
  }
}
