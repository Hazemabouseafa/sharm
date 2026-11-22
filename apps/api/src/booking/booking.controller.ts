import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CreateBookingSchema, ERROR_CODES, QuoteRequestSchema } from '@sharm/contracts';
import { BookingService } from './booking.service';
import {
  GUEST_COOKIE_NAME,
  RequirePermissions,
  RequestWithStaff,
  StaffAuthGuard,
} from '../common/auth.guard';
import { DomainError } from '../common/http-exception.filter';
import { resolveCookieSecure } from '../common/env';

@ApiTags('Public Booking Engine')
@Controller('public')
export class PublicBookingController {
  constructor(private readonly booking: BookingService) {}

  @Post('quotes')
  createQuote(@Body() body: unknown) {
    const parsed = QuoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid quote request', 400, parsed.error.flatten());
    }
    return this.booking.createQuote(parsed.data);
  }

  @Post('bookings')
  createBooking(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: RequestWithStaff,
  ) {
    const parsed = CreateBookingSchema.safeParse(body);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid booking submission', 400, parsed.error.flatten());
    }
    return this.booking.createBooking(parsed.data, idempotencyKey, req.correlationId);
  }

  @Post('booking-access/exchange')
  async exchangeToken(
    @Body() body: { token?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { sessionCookie, reference } = await this.booking.exchangeManageToken(body?.token ?? '');
    const secure = resolveCookieSecure(req);
    res.cookie(GUEST_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 3600_000,
    });
    return { ok: true, reference };
  }

  @Post('booking-access/recover')
  recoverAccess(@Body() body: { reference?: string; email?: string }, @Req() req: Request) {
    if (!body?.reference || !body?.email) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Booking reference and email are required');
    }
    return this.booking.recoverManageAccess(body.reference, body.email, req.ip);
  }

  @Get('booking-access/current')
  getCurrentGuestBooking(@Req() req: Request) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    return this.booking.getGuestBookingView(claims.bookingId);
  }

  @Post('booking-access/cancel')
  cancelGuestBooking(@Body() body: { reason?: string }, @Req() req: Request) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    return this.booking.guestCancelBooking(claims.bookingId, body?.reason);
  }

  @Post('booking-access/reschedule')
  rescheduleGuestBooking(
    @Body() body: { newDepartureId?: string; acceptPriceDifference?: boolean },
    @Req() req: Request,
  ) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    if (!body?.newDepartureId) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'newDepartureId is required');
    }
    return this.booking.rescheduleBooking({
      bookingId: claims.bookingId,
      newDepartureId: body.newDepartureId,
      acceptPriceDifference: body.acceptPriceDifference,
      actorType: 'GUEST',
    });
  }

  @Get('booking-access/voucher.pdf')
  async downloadGuestVoucher(@Req() req: Request, @Res() res: Response) {
    const claims = this.booking.verifyGuestSession(req.cookies?.[GUEST_COOKIE_NAME]);
    const { filename, buffer } = await this.booking.generateVoucherPdfBuffer(claims.bookingId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}

@ApiTags('Admin Bookings')
@UseGuards(StaffAuthGuard)
@Controller('admin/bookings')
export class AdminBookingController {
  constructor(private readonly booking: BookingService) {}

  @RequirePermissions('bookings:read')
  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('tourId') tourId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.booking.listAdminBookings({
      q,
      status,
      paymentStatus,
      tourId,
      fromDate,
      toDate,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @RequirePermissions('bookings:export')
  @Get('export.csv')
  async exportCsv(
    @Query('status') status: string | undefined,
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.booking.exportBookingsCsv({ status, fromDate, toDate });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sharm-pharaoh-bookings.csv"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  }

  @RequirePermissions('bookings:read')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.booking.getAdminBookingDetail(id);
  }

  @RequirePermissions('bookings:read')
  @Get(':id/voucher.pdf')
  async staffVoucher(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.booking.generateVoucherPdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  @RequirePermissions('bookings:approve')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.booking.approveBooking(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('bookings:approve')
  @Post(':id/decline')
  decline(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: RequestWithStaff) {
    return this.booking.declineOrCancelBookingByStaff(id, body?.reason ?? '', {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('bookings:write')
  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @Body() body: { newDepartureId: string; acceptPriceDifference?: boolean; reason?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.booking.rescheduleBooking({
      bookingId: id,
      newDepartureId: body.newDepartureId,
      acceptPriceDifference: body.acceptPriceDifference ?? true,
      actorType: 'STAFF',
      actorId: req.staff!.userId,
      actorRole: req.staff!.role,
      reason: body.reason,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('bookings:write')
  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() body: { body: string }, @Req() req: RequestWithStaff) {
    return this.booking.addPrivateNote(id, body.body, { userId: req.staff!.userId, role: req.staff!.role });
  }

  @RequirePermissions('bookings:write')
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { staffId: string | null }, @Req() req: RequestWithStaff) {
    return this.booking.assignStaff(id, body.staffId, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('bookings:write')
  @Post(':id/resend')
  resend(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.booking.resendNotification(id, { userId: req.staff!.userId, role: req.staff!.role });
  }

  @RequirePermissions('bookings:write')
  @Post('checkin-qr')
  checkinQr(@Body() body: { token?: string }, @Req() req: RequestWithStaff) {
    if (!body?.token) throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'QR check-in token is required');
    return this.booking.checkInByQrToken(body.token, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('bookings:approve')
  @Post('bulk')
  bulk(
    @Body() body: { bookingIds: string[]; action: 'APPROVE' | 'DECLINE'; reason?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.booking.bulkAction(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }
}
