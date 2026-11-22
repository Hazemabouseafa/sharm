import {
  Body,
  Controller,
  Delete,
  Get,
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
import { Response } from 'express';
import { ERROR_CODES } from '@sharm/contracts';
import { MediaService } from './media.service';
import { RequirePermissions, RequestWithStaff, StaffAuthGuard } from '../common/auth.guard';
import { DomainError } from '../common/http-exception.filter';

@ApiTags('Public Media')
@Controller('public/media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':storageKey')
  servePublic(@Param('storageKey') storageKey: string, @Res() res: Response) {
    const { filePath, contentType } = this.media.readPublicFile(storageKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  }
}

@ApiTags('Admin Media')
@UseGuards(StaffAuthGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('media:read')
  @Get()
  list(@Query('q') q?: string, @Query('folder') folder?: string) {
    return this.media.listPublicLibrary({ q, folder });
  }

  @RequirePermissions('media:read')
  @Get(':id/references')
  references(@Param('id') id: string) {
    return this.media.findAssetReferences(id);
  }

  @RequirePermissions('media:write')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { altText?: string; folder?: string; tags?: string },
    @Req() req: RequestWithStaff,
  ) {
    if (!file) throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'File field is required');
    const tags = body?.tags ? body.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    return this.media.uploadAsset({
      buffer: file.buffer,
      originalFilename: file.originalname,
      visibility: 'PUBLIC',
      allowPdf: false,
      altText: body?.altText,
      folder: body?.folder,
      tags,
      uploadedById: req.staff!.userId,
      actorRole: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('media:write')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { altText?: string; folder?: string; tags?: string[]; focalX?: number; focalY?: number; crop?: Record<string, number> },
    @Req() req: RequestWithStaff,
  ) {
    return this.media.updateMetadata(id, body, {
      userId: req.staff!.userId,
      role: req.staff!.role,
      requestId: req.correlationId,
    });
  }

  @RequirePermissions('media:delete')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('replacementMediaId') replacementMediaId: string | undefined,
    @Req() req: RequestWithStaff,
  ) {
    return this.media.deleteAsset(
      id,
      { userId: req.staff!.userId, role: req.staff!.role, requestId: req.correlationId },
      replacementMediaId,
    );
  }

  /**
   * Private payment proofs & sensitive documents strictly require payments:proofs:read permission!
   * Content Editors do NOT hold this permission and receive 403 Forbidden.
   */
  @RequirePermissions('payments:proofs:read')
  @Get(':id/private')
  async servePrivate(@Param('id') id: string, @Res() res: Response) {
    const { filePath, contentType, filename } = await this.media.readPrivateAssetFile(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  }
}
