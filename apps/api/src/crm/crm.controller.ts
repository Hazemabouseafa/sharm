import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateInquirySchema, ERROR_CODES } from '@sharm/contracts';
import { CrmService } from './crm.service';
import { RequirePermissions, RequestWithStaff, StaffAuthGuard } from '../common/auth.guard';
import { DomainError } from '../common/http-exception.filter';

@ApiTags('Public Inquiries')
@Controller('public/inquiries')
export class PublicInquiriesController {
  constructor(private readonly crm: CrmService) {}

  @Post()
  submit(@Body() body: unknown, @Req() req: Request) {
    const parsed = CreateInquirySchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Please check all required inquiry fields', 400, parsed.error.flatten());
    }
    return this.crm.submitPublicInquiry(parsed.data, req.ip);
  }
}

@ApiTags('Admin CRM & Promotions')
@UseGuards(StaffAuthGuard)
@Controller('admin')
export class AdminCrmController {
  constructor(private readonly crm: CrmService) {}

  @RequirePermissions('inquiries:read')
  @Get('inquiries')
  listInquiries(@Query('status') status?: string) {
    return this.crm.listInquiries(status);
  }

  @RequirePermissions('inquiries:write')
  @Patch('inquiries/:id')
  updateInquiry(
    @Param('id') id: string,
    @Body() body: { status?: 'NEW' | 'IN_PROGRESS' | 'REPLIED' | 'ARCHIVED'; assignedStaffId?: string | null; internalNotes?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.crm.updateInquiry(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('customers:read')
  @Get('customers')
  listCustomers(@Query('q') q?: string) {
    return this.crm.listCustomers(q);
  }

  @RequirePermissions('customers:read')
  @Get('customers/:id')
  customerDetail(@Param('id') id: string) {
    return this.crm.getCustomerDetail(id);
  }

  @RequirePermissions('customers:notes')
  @Post('customers/:id/notes')
  addNote(@Param('id') id: string, @Body() body: { body: string }, @Req() req: RequestWithStaff) {
    return this.crm.addCustomerNote(id, body.body, { userId: req.staff!.userId, role: req.staff!.role });
  }

  @RequirePermissions('customers:export')
  @Get('customers/:id/export')
  exportCustomer(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.crm.exportCustomerData(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('customers:anonymize')
  @Post('customers/:id/anonymize')
  anonymizeCustomer(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: RequestWithStaff) {
    return this.crm.anonymizeCustomer(id, body.reason, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('promotions:read')
  @Get('promotions')
  listPromotions() {
    return this.crm.listPromotions();
  }

  @RequirePermissions('promotions:write')
  @Post('promotions')
  createPromotion(
    @Body()
    body: {
      code: string;
      title: string;
      discountType: 'FIXED' | 'PERCENT';
      value: number;
      currency?: string;
      minOrderMinor?: number;
      validFrom: string;
      validUntil: string;
      maxTotalUses?: number | null;
      maxUsesPerEmail?: number | null;
      eligibleTourIds?: string[];
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.crm.createPromotion(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('promotions:write')
  @Patch('promotions/:id')
  updatePromotion(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      isActive: boolean;
      validUntil: string;
      maxTotalUses: number | null;
      maxUsesPerEmail: number | null;
      minOrderMinor: number;
    }>,
    @Req() req: RequestWithStaff,
  ) {
    return this.crm.updatePromotion(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }
}
