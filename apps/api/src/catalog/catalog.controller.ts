import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ERROR_CODES, TourFilterQuerySchema } from '@sharm/contracts';
import { CatalogService } from './catalog.service';
import { RequirePermissions, RequestWithStaff, StaffAuthGuard } from '../common/auth.guard';
import { DomainError } from '../common/http-exception.filter';

@ApiTags('Public Catalog')
@Controller('public')
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('destinations')
  listDestinations() {
    return this.catalog.listPublicDestinations();
  }

  @Get('destinations/:slug')
  getDestination(@Param('slug') slug: string) {
    return this.catalog.getPublicDestinationBySlug(slug);
  }

  @Get('categories')
  listCategories() {
    return this.catalog.listPublicCategories();
  }

  @Get('tours')
  listTours(@Query() raw: Record<string, unknown>) {
    const parsed = TourFilterQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid tour filter query parameters', 400, parsed.error.flatten());
    }
    return this.catalog.listPublicTours(parsed.data);
  }

  @Get('tours/:slug')
  getTour(@Param('slug') slug: string) {
    return this.catalog.getPublicTourBySlug(slug, false);
  }
}

@ApiTags('Admin Catalog')
@UseGuards(StaffAuthGuard)
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions('tours:read')
  @Get('tours')
  listTours(@Query('q') q?: string, @Query('status') status?: string, @Query('destinationId') destinationId?: string) {
    return this.catalog.listAdminTours({ q, status, destinationId });
  }

  @RequirePermissions('tours:read')
  @Get('tours/:id')
  getTour(@Param('id') id: string) {
    return this.catalog.getAdminTour(id);
  }

  @RequirePermissions('tours:read')
  @Get('tours/slug/:slug/preview')
  previewTour(@Param('slug') slug: string) {
    return this.catalog.getPublicTourBySlug(slug, true);
  }

  @RequirePermissions('tours:write')
  @Post('tours')
  createTour(@Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.catalog.createTour(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('tours:write')
  @Patch('tours/:id')
  updateTour(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.catalog.updateTour(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('tours:publish')
  @Post('tours/:id/publish')
  publishTour(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.catalog.publishTour(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('tours:archive')
  @Post('tours/:id/archive')
  archiveTour(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.catalog.archiveTour(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('tours:write')
  @Post('tours/:id/clone')
  cloneTour(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.catalog.cloneTourAsDraft(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('destinations:read')
  @Get('destinations')
  listDestinations() {
    return this.catalog.listAdminDestinations();
  }

  @RequirePermissions('destinations:write')
  @Post('destinations')
  createDestination(@Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.catalog.createDestination(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('destinations:write')
  @Patch('destinations/:id')
  updateDestination(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: RequestWithStaff) {
    return this.catalog.updateDestination(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('destinations:write')
  @Delete('destinations/:id')
  deleteDestination(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.catalog.deleteDestination(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('taxonomy:read')
  @Get('taxonomy')
  listTaxonomy() {
    return this.catalog.listTaxonomy();
  }

  @RequirePermissions('taxonomy:write')
  @Post('taxonomy/categories')
  createCategory(@Body() body: { slug: string; name: string; icon?: string; description?: string; displayOrder?: number }) {
    return this.catalog.createCategory(body);
  }

  @RequirePermissions('taxonomy:write')
  @Delete('taxonomy/categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.catalog.deleteCategory(id);
  }

  @RequirePermissions('taxonomy:write')
  @Post('taxonomy/addons')
  createAddon(@Body() body: { code: string; title: string; description?: string; pricingBasis: 'PER_PERSON' | 'PER_BOOKING'; priceMinor: number; currency?: string; maxQuantity?: number }) {
    return this.catalog.createAddon(body);
  }

  @RequirePermissions('taxonomy:write')
  @Patch('taxonomy/addons/:id')
  updateAddon(@Param('id') id: string, @Body() body: Partial<{ title: string; description: string; priceMinor: number; maxQuantity: number; isActive: boolean }>) {
    return this.catalog.updateAddon(id, body);
  }

  @RequirePermissions('taxonomy:write')
  @Delete('taxonomy/addons/:id')
  deleteAddon(@Param('id') id: string) {
    return this.catalog.deleteAddon(id);
  }

  @RequirePermissions('taxonomy:write')
  @Post('taxonomy/pickup-zones')
  createPickupZone(@Body() body: { destinationId: string; name: string; surchargeMinor?: number; pricingBasis?: 'PER_PERSON' | 'PER_BOOKING'; requiresHotelDetails?: boolean }) {
    return this.catalog.createPickupZone(body);
  }

  @RequirePermissions('taxonomy:write')
  @Delete('taxonomy/pickup-zones/:id')
  deletePickupZone(@Param('id') id: string) {
    return this.catalog.deletePickupZone(id);
  }

  @RequirePermissions('taxonomy:write')
  @Post('taxonomy/policies')
  createPolicy(@Body() body: { code: string; name: string; summary: string; bodyMarkdown: string; freeCancellationHours: number; partialRefundHours: number; partialRefundPercentBps: number }) {
    return this.catalog.createPolicy(body);
  }

  @RequirePermissions('taxonomy:write')
  @Post('taxonomy/policies/:id/versions')
  publishPolicyVersion(@Param('id') id: string, @Body() body: { summary?: string; bodyMarkdown: string; freeCancellationHours: number; partialRefundHours: number; partialRefundPercentBps: number }) {
    return this.catalog.publishNewPolicyVersion(id, body);
  }
}
