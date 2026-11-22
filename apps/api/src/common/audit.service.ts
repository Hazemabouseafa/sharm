import { Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import { PrismaService } from './prisma.service';

const SENSITIVE_KEY_PATTERN = /(password|secret|token|cookie|authorization|totp|hmac|apiKey|privateKey|iban|card)/i;

export function redactSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitive(v);
      }
    }
    return out;
  }
  return value;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorId?: string | null;
    actorRole?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    requestId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        requestId: params.requestId ?? null,
        reason: params.reason ?? null,
        beforeRedactedJson:
          params.before !== undefined
            ? (redactSensitive(params.before) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        afterRedactedJson:
          params.after !== undefined
            ? (redactSensitive(params.after) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }
}
