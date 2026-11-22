import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CmsService } from './cms.service';
import { RequirePermissions, RequestWithStaff, StaffAuthGuard } from '../common/auth.guard';

@ApiTags('Public CMS')
@Controller('public/cms')
export class PublicCmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('global')
  getGlobal() {
    return this.cms.getPublicGlobal();
  }

  @Get('page')
  getPage(@Query('slug') slug = 'home') {
    return this.cms.getPublicPublishedPage(slug);
  }

  @Get('sitemap')
  getSitemap() {
    return this.cms.getPublicSitemapEntries();
  }

  @Get('preview')
  async getPreview(@Query('token') token: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return this.cms.resolvePreviewToken(token);
  }
}

@ApiTags('Admin CMS & Live Editor')
@UseGuards(StaffAuthGuard)
@Controller('admin/cms')
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}

  @RequirePermissions('cms:read')
  @Get('pages')
  listPages() {
    return this.cms.listAdminPages();
  }

  @RequirePermissions('cms:write')
  @Post('pages')
  createPage(@Body() body: { slug: string; title: string; kind?: 'LEGAL' | 'CUSTOM' }, @Req() req: RequestWithStaff) {
    return this.cms.createCustomPage(body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:read')
  @Get('pages/:id')
  getPage(@Param('id') id: string) {
    return this.cms.getAdminPageDetail(id);
  }

  @RequirePermissions('cms:write')
  @Put('pages/:id/draft')
  saveDraft(
    @Param('id') id: string,
    @Body() body: { content: unknown; expectedDraftVersion: number; notes?: string; duplicateOnConflict?: boolean },
    @Req() req: RequestWithStaff,
  ) {
    return this.cms.saveDraft(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:read')
  @Post('pages/:id/preview-link')
  createPreviewLink(@Param('id') id: string, @Body() body: { revisionId?: string }) {
    return this.cms.createPreviewLink(id, body?.revisionId);
  }

  @RequirePermissions('cms:publish')
  @Post('pages/:id/publish')
  publishPage(@Param('id') id: string, @Body() body: { notes?: string }, @Req() req: RequestWithStaff) {
    return this.cms.publishPage(id, body?.notes, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:publish')
  @Post('pages/:id/rollback')
  rollbackPage(@Param('id') id: string, @Body() body: { revisionId: string }, @Req() req: RequestWithStaff) {
    return this.cms.rollbackPage(id, body.revisionId, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:write')
  @Post('pages/:id/restore-to-draft')
  restoreToDraft(@Param('id') id: string, @Body() body: { revisionId: string }, @Req() req: RequestWithStaff) {
    return this.cms.restoreRevisionToDraft(id, body.revisionId, {
      userId: req.staff!.userId,
      role: req.staff!.role,
    });
  }

  @RequirePermissions('cms:schedule')
  @Post('pages/:id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() body: { revisionId?: string; scheduledForUtc: string; timezone?: string },
    @Req() req: RequestWithStaff,
  ) {
    return this.cms.schedulePublish(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:schedule')
  @Delete('schedules/:id')
  cancelSchedule(@Param('id') id: string, @Req() req: RequestWithStaff) {
    return this.cms.cancelSchedule(id, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('cms:read')
  @Get('global')
  getGlobal() {
    return this.cms.getAdminGlobal();
  }

  @RequirePermissions('cms:write')
  @Put('global/draft')
  saveGlobalDraft(@Body() body: { content: unknown; expectedVersion?: number }) {
    return this.cms.saveGlobalDraft(body.content, body.expectedVersion);
  }

  @RequirePermissions('cms:publish')
  @Post('global/publish')
  publishGlobal(@Req() req: RequestWithStaff) {
    return this.cms.publishGlobal({
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }
}
