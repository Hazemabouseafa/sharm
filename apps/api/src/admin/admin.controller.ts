import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { StaffRole } from '@sharm/contracts';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import {
  RequirePermissions,
  RequireRecentReauth,
  RequestWithStaff,
  StaffAuthGuard,
} from '../common/auth.guard';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'unreachable' });
    }
  }
}

@ApiTags('Admin Operations')
@UseGuards(StaffAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @RequirePermissions('overview:read')
  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.admin.getOverview(days ? Number(days) : 30);
  }

  @RequirePermissions('reports:read')
  @Get('reports')
  reports(@Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.admin.getReports({ fromDate, toDate });
  }

  @RequirePermissions('reports:export')
  @Get('reports/export.csv')
  async exportReport(
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.admin.exportReportCsv({ fromDate, toDate });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sharm-pharaoh-report.csv"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  }

  @RequirePermissions('team:read')
  @Get('team')
  listTeam() {
    return this.admin.listTeam();
  }

  @RequirePermissions('team:manage')
  @Post('team')
  createStaff(
    @Body() body: { email: string; username?: string; fullName: string; role: StaffRole; password: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.admin.createStaffMember(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('team:manage')
  @Patch('team/:id')
  updateStaff(
    @Param('id') id: string,
    @Body() body: { role?: StaffRole; suspend?: boolean; fullName?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.admin.updateStaffMember(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('team:manage')
  @Post('team/:id/revoke-sessions')
  revokeSessions(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.admin.revokeUserSessions(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('settings:read')
  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @RequirePermissions('settings:write')
  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.admin.updateSettings(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('settings:security')
  @RequireRecentReauth(15)
  @Patch('settings/security')
  updateSecuritySettings(@Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.admin.updateSettings(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('audit:read')
  @Get('audit-logs')
  auditLogs(@Query('action') action?: string, @Query('targetType') targetType?: string, @Query('limit') limit?: string) {
    return this.admin.listAuditLogs({ action, targetType, limit: limit ? Number(limit) : 100 });
  }

  @RequirePermissions('health:read')
  @Get('health')
  health() {
    return this.admin.getSystemHealth();
  }

  @RequirePermissions('health:retry')
  @Post('health/jobs/:id/retry')
  retryJob(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.admin.retryOutboxJob(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('health:retry')
  @Post('health/expire-now')
  expireNow() {
    return this.admin.runExpirySweepNow();
  }
}
