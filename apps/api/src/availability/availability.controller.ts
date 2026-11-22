import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { RequirePermissions, RequestWithStaff, StaffAuthGuard } from '../common/auth.guard';

@ApiTags('Admin Availability')
@UseGuards(StaffAuthGuard)
@Controller('admin/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @RequirePermissions('availability:read')
  @Get('departures')
  listDepartures(
    @Query('tourId') tourId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: string,
  ) {
    return this.availability.listDepartures({ tourId, fromDate, toDate, status });
  }

  @RequirePermissions('availability:read')
  @Get('schedules')
  listSchedules(@Query('tourId') tourId?: string) {
    return this.availability.listSchedulesAndBlackouts(tourId);
  }

  @RequirePermissions('availability:write')
  @Post('schedules')
  createSchedule(
    @Body()
    body: {
      tourId: string;
      weekdays: number[];
      startTime: string;
      capacity: number;
      cutoffHours?: number;
      adultPriceOverrideMinor?: number | null;
      childPriceOverrideMinor?: number | null;
      privateGroupPriceOverrideMinor?: number | null;
      activeFromDate: string;
      activeToDate?: string | null;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.availability.createRecurringSchedule(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('availability:write')
  @Post('generate')
  generate(
    @Body()
    body: {
      tourId: string;
      fromDate: string;
      toDate: string;
      weekdays?: number[];
      startTime?: string;
      capacity?: number;
      cutoffHours?: number;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.availability.generateDepartures(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('availability:write')
  @Post('blackouts')
  addBlackout(
    @Body() body: { tourId?: string | null; date: string; reason?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.availability.addBlackoutDate(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('availability:write')
  @Delete('blackouts/:id')
  deleteBlackout(@Param('id') id: string) {
    return this.availability.deleteBlackoutDate(id);
  }

  @RequirePermissions('availability:write')
  @Patch('departures/:id')
  updateDeparture(
    @Param('id') id: string,
    @Body()
    body: {
      capacity?: number;
      status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
      cutoffHours?: number;
      adultPriceOverrideMinor?: number | null;
      childPriceOverrideMinor?: number | null;
      infantPriceOverrideMinor?: number | null;
      privateGroupPriceOverrideMinor?: number | null;
      pickupTimeNote?: string | null;
      cancellationReason?: string;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.availability.updateDeparture(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('availability:write')
  @Post('bulk')
  bulkUpdate(
    @Body()
    body: {
      departureIds: string[];
      status?: 'OPEN' | 'CLOSED';
      capacity?: number;
      adultPriceOverrideMinor?: number | null;
    },
    @Req() req: RequestWithStaff,
  ) {
    return this.availability.bulkUpdateDepartures(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }
}
