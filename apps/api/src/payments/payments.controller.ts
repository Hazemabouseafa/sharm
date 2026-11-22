import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ERROR_CODES } from '@sharm/contracts';
import { PaymentsService } from './payments.service';
import { BookingService } from '../booking/booking.service';
import { MediaService } from '../media/media.service';
import {
  GUEST_COOKIE_NAME,
  RequirePermissions,
  RequireRecentReauth,
  RequestWithStaff,
  StaffAuthGuard,
} from '../common/auth.guard';
import { DomainError } from '../common/http-exception.filter';
import { PrismaService } from '../common/prisma.service';

@ApiTags('Public Payments & Webhooks')
@Controller()
export class PublicPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly booking: BookingService,
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('public/booking-access/payment-proofs')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  uploadGuestProof(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { submittedAmountMinor?: string; submittedCurrency?: string; transferReference?: string; note?: string },
    @Req() req: Request,
  ) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    if (!file) throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Proof image or PDF file is required');
    if (!body?.transferReference || !body?.submittedAmountMinor || !body?.submittedCurrency) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'submittedAmountMinor, submittedCurrency, and transferReference are required');
    }
    return this.payments.submitBankTransferProof({
      bookingId: claims.bookingId,
      fileBuffer: file.buffer,
      originalFilename: file.originalname,
      submittedAmountMinor: Number(body.submittedAmountMinor),
      submittedCurrency: body.submittedCurrency,
      transferReference: body.transferReference,
      note: body.note,
    });
  }

  /**
   * Booking-scoped private proof download (prevents IDOR across different bookings!)
   */
  @Get('public/booking-access/payment-proofs/:proofId/file')
  async downloadOwnProof(@Param('proofId') proofId: string, @Req() req: Request, @Res() res: Response) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    const proof = await this.prisma.paymentProof.findUnique({ where: { id: proofId } });
    if (!proof || proof.bookingId !== claims.bookingId) {
      throw new DomainError(ERROR_CODES.FORBIDDEN, 'Access denied to this payment proof', 403);
    }
    const { filePath, contentType, filename } = await this.media.readPrivateAssetFile(proof.mediaAssetId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(filePath);
  }

  @Post('public/booking-access/online-checkout')
  startOnlineCheckout(@Req() req: Request) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    return this.payments.initiateOnlineCheckout(claims.bookingId);
  }

  @Post('webhooks/paymob')
  paymobWebhook(
    @Body() payload: Record<string, unknown>,
    @Query('hmac') hmacQuery?: string,
    @Headers('x-paymob-hmac') hmacHeader?: string,
  ) {
    return this.payments.handlePaymobWebhook(payload, hmacQuery || hmacHeader || '');
  }
}

@ApiTags('Admin Payments & Refunds')
@UseGuards(StaffAuthGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions('payments:read')
  @Get()
  dashboard() {
    return this.payments.listAdminPaymentsDashboard();
  }

  @RequirePermissions('payments:read')
  @Get('provider-status')
  providerStatus() {
    return this.payments.getProviderConfigStatus();
  }

  @RequirePermissions('payments:config')
  @RequireRecentReauth(15)
  @Patch('provider-config')
  updateProviderConfig(
    @Body()
    body: {
      enabled?: boolean;
      sandboxVerified?: boolean;
      currency?: string;
      integrationId?: string;
      callbackUrl?: string;
      apiBaseUrl?: string;
      secretKey?: string;
      publicKey?: string;
      hmacSecret?: string;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.payments.updatePaymobConfig(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('payments:verify')
  @Post('proofs/:id/review')
  reviewProof(
    @Param('id') id: string,
    @Body()
    body: {
      decision: 'VERIFY' | 'REJECT';
      verifiedAmountMinor?: number;
      verifiedCurrency?: string;
      confirmBookingIfEligible?: boolean;
      reviewNote: string;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.payments.reviewPaymentProof(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('payments:verify')
  @Post('manual')
  recordManual(
    @Body()
    body: {
      bookingId: string;
      amountMinor: number;
      currency: string;
      provider: 'PAY_LATER' | 'BANK_TRANSFER';
      externalRef: string;
      reason: string;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.payments.recordManualPayment(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('payments:refund')
  @Post('refunds')
  refund(
    @Body()
    body: {
      bookingId: string;
      refundRequestId?: string;
      amountMinor: number;
      reason: string;
      externalRefundRef?: string;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.payments.processRefund(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }
}
