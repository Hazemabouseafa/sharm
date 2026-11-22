import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { Prisma } from '@sharm/database';
import { ERROR_CODES } from '@sharm/contracts';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';

type DetectedKind = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; ext: string; isImage: boolean };

/**
 * Magic-byte file signature inspection. Never trusts Content-Type or filename extension alone.
 * Disallows untrusted SVG, HTML, executables, and polyglots.
 */
export function detectMagicBytes(buf: Buffer): DetectedKind | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg', isImage: true };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png', isImage: true };
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp', isImage: true };
  }
  // PDF: %PDF-
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf', isImage: false };
  }
  return null;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolvePublicDir(): string {
    const dir = path.resolve(process.cwd(), getAppEnv().STORAGE_PUBLIC_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private resolvePrivateDir(): string {
    const dir = path.resolve(process.cwd(), getAppEnv().STORAGE_PRIVATE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private safeJoin(baseDir: string, storageKey: string): string {
    const cleanKey = path.basename(storageKey);
    if (cleanKey !== storageKey || storageKey.includes('..') || storageKey.includes('/') || storageKey.includes('\\')) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid storage key');
    }
    const target = path.resolve(baseDir, cleanKey);
    if (!target.startsWith(baseDir)) {
      throw new DomainError(ERROR_CODES.FORBIDDEN, 'Path traversal blocked', HttpStatus.FORBIDDEN);
    }
    return target;
  }

  async uploadAsset(params: {
    buffer: Buffer;
    originalFilename: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    allowPdf?: boolean;
    altText?: string;
    folder?: string;
    tags?: string[];
    uploadedById?: string | null;
    actorRole?: string | null;
    requestId?: string;
  }) {
    const maxBytes = getAppEnv().MAX_UPLOAD_MB * 1024 * 1024;
    if (!params.buffer || params.buffer.length === 0) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Uploaded file is empty');
    }
    if (params.buffer.length > maxBytes) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_ERROR,
        `File exceeds maximum allowed size of ${getAppEnv().MAX_UPLOAD_MB} MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const detected = detectMagicBytes(params.buffer);
    if (!detected) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_ERROR,
        'Unsupported or unsafe file type. Allowed formats: JPEG, PNG, WebP' + (params.allowPdf ? ', PDF' : '') + '. Untrusted SVGs and scripts are blocked.',
      );
    }
    if (!detected.isImage && !params.allowPdf) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Only raster images (JPEG, PNG, WebP) are allowed in the public media library');
    }

    const baseId = crypto.randomBytes(16).toString('hex');
    const dir = params.visibility === 'PUBLIC' ? this.resolvePublicDir() : this.resolvePrivateDir();

    let finalBuffer = params.buffer;
    let width: number | null = null;
    let height: number | null = null;
    let storageKey = `${baseId}.${detected.ext}`;
    const variants: Record<string, string> = {};

    if (detected.isImage) {
      let meta;
      try {
        meta = await sharp(params.buffer, { limitInputPixels: 40_000_000 }).metadata();
      } catch {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Image decoding failed or image exceeds pixel limits');
      }
      if (!meta.width || !meta.height) {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid image dimensions');
      }

      // Re-encode through sharp to strip EXIF metadata & neutralize embedded payloads
      const reencoded = sharp(params.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });

      if (params.visibility === 'PUBLIC') {
        const webpKey = `${baseId}.webp`;
        const thumbKey = `${baseId}-thumb.webp`;
        const jpgKey = `${baseId}.jpg`;

        const webpBuf = await reencoded.clone().webp({ quality: 82 }).toBuffer();
        const thumbBuf = await reencoded.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        const jpgBuf = await reencoded.clone().jpeg({ quality: 84 }).toBuffer();

        fs.writeFileSync(this.safeJoin(dir, webpKey), webpBuf);
        fs.writeFileSync(this.safeJoin(dir, thumbKey), thumbBuf);
        fs.writeFileSync(this.safeJoin(dir, jpgKey), jpgBuf);

        const outMeta = await sharp(webpBuf).metadata();
        width = outMeta.width ?? meta.width;
        height = outMeta.height ?? meta.height;
        finalBuffer = webpBuf;
        storageKey = webpKey;
        variants.webp = `/api/v1/public/media/${webpKey}`;
        variants.thumb = `/api/v1/public/media/${thumbKey}`;
        variants.jpeg = `/api/v1/public/media/${jpgKey}`;
      } else {
        const pngOrJpg = await reencoded.jpeg({ quality: 86 }).toBuffer();
        const outMeta = await sharp(pngOrJpg).metadata();
        width = outMeta.width ?? meta.width;
        height = outMeta.height ?? meta.height;
        storageKey = `${baseId}.jpg`;
        finalBuffer = pngOrJpg;
        fs.writeFileSync(this.safeJoin(dir, storageKey), finalBuffer);
      }
    } else {
      // Private PDF proof
      fs.writeFileSync(this.safeJoin(dir, storageKey), finalBuffer);
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey,
        visibility: params.visibility,
        originalFilename: path.basename(params.originalFilename).slice(0, 180),
        mimeType: params.visibility === 'PUBLIC' && detected.isImage ? 'image/webp' : detected.mime,
        sizeBytes: finalBuffer.length,
        width,
        height,
        altText: (params.altText || '').trim().slice(0, 220),
        folder: (params.folder || 'general').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'general',
        tagsJson: (params.tags ?? []).slice(0, 15),
        variantsJson: variants as Prisma.InputJsonValue,
        uploadedById: params.uploadedById ?? null,
      },
    });

    if (params.uploadedById) {
      await this.audit.log({
        actorId: params.uploadedById,
        actorRole: params.actorRole,
        action: 'media.upload',
        targetType: 'MediaAsset',
        targetId: asset.id,
        requestId: params.requestId,
        after: { visibility: asset.visibility, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
      });
    }

    return {
      ...asset,
      publicUrl: asset.visibility === 'PUBLIC' ? `/api/v1/public/media/${asset.storageKey}` : null,
    };
  }

  async listPublicLibrary(params: { q?: string; folder?: string }) {
    const where: Prisma.MediaAssetWhereInput = { visibility: 'PUBLIC' };
    if (params.folder) where.folder = params.folder;
    if (params.q) {
      where.OR = [
        { originalFilename: { contains: params.q, mode: 'insensitive' } },
        { altText: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const items = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { destinations: true, toursPrimary: true } },
      },
      take: 200,
    });
    return items.map((a) => ({
      ...a,
      publicUrl: `/api/v1/public/media/${a.storageKey}`,
      usageCount: a._count.destinations + a._count.toursPrimary,
    }));
  }

  async updateMetadata(
    id: string,
    data: { altText?: string; folder?: string; tags?: string[]; focalX?: number; focalY?: number; crop?: Record<string, number> },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Media asset not found', HttpStatus.NOT_FOUND);

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(data.altText !== undefined ? { altText: data.altText.trim().slice(0, 220) } : {}),
        ...(data.folder !== undefined ? { folder: data.folder.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'general' } : {}),
        ...(data.tags !== undefined ? { tagsJson: data.tags.slice(0, 15) } : {}),
        ...(data.focalX !== undefined ? { focalX: Math.min(100, Math.max(0, Math.round(data.focalX))) } : {}),
        ...(data.focalY !== undefined ? { focalY: Math.min(100, Math.max(0, Math.round(data.focalY))) } : {}),
        ...(data.crop !== undefined ? { cropJson: data.crop as Prisma.InputJsonValue } : {}),
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'media.update',
      targetType: 'MediaAsset',
      targetId: id,
      requestId: actor.requestId,
    });
    return {
      ...updated,
      publicUrl: updated.visibility === 'PUBLIC' ? `/api/v1/public/media/${updated.storageKey}` : null,
    };
  }

  async findAssetReferences(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        destinations: { select: { id: true, name: true } },
        toursPrimary: { select: { id: true, title: true } },
        paymentProofs: { select: { id: true, bookingId: true } },
      },
    });
    if (!asset) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Media asset not found', HttpStatus.NOT_FOUND);

    const publicUrl = `/api/v1/public/media/${asset.storageKey}`;
    // Also check URL references inside tours/destinations/CMS revisions
    const [toursByUrl, destsByUrl, cmsRevs] = await Promise.all([
      this.prisma.tour.findMany({
        where: { primaryImageUrl: publicUrl },
        select: { id: true, title: true },
      }),
      this.prisma.destination.findMany({
        where: { heroImageUrl: publicUrl },
        select: { id: true, name: true },
      }),
      this.prisma.cmsRevision.findMany({
        where: { status: { in: ['DRAFT', 'PUBLISHED'] } },
        select: { id: true, pageId: true, contentJson: true },
        take: 100,
      }),
    ]);

    const cmsRefs = cmsRevs.filter((r) => JSON.stringify(r.contentJson).includes(publicUrl));
    const total =
      asset.destinations.length +
      asset.toursPrimary.length +
      asset.paymentProofs.length +
      toursByUrl.length +
      destsByUrl.length +
      cmsRefs.length;

    return {
      asset,
      totalReferences: total,
      references: {
        destinations: [...asset.destinations, ...destsByUrl],
        tours: [...asset.toursPrimary, ...toursByUrl],
        paymentProofs: asset.paymentProofs,
        cmsRevisions: cmsRefs.map((r) => ({ id: r.id, pageId: r.pageId })),
      },
    };
  }

  async deleteAsset(
    id: string,
    actor: { userId: string; role: string; requestId?: string },
    replacementMediaId?: string,
  ) {
    const usage = await this.findAssetReferences(id);
    if (usage.asset.visibility === 'PRIVATE' || usage.references.paymentProofs.length > 0) {
      throw new DomainError(ERROR_CODES.RESOURCE_IN_USE, 'Private financial/payment proof documents cannot be deleted from media library', HttpStatus.CONFLICT);
    }

    if (usage.totalReferences > 0 && !replacementMediaId) {
      throw new DomainError(
        ERROR_CODES.RESOURCE_IN_USE,
        `Cannot delete media asset while referenced in ${usage.totalReferences} place(s). Provide a replacementMediaId to swap safely.`,
        HttpStatus.CONFLICT,
        usage.references,
      );
    }

    if (usage.totalReferences > 0 && replacementMediaId) {
      const replacement = await this.prisma.mediaAsset.findUnique({ where: { id: replacementMediaId } });
      if (!replacement || replacement.visibility !== 'PUBLIC') {
        throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Valid public replacement media asset is required');
      }
      const oldUrl = `/api/v1/public/media/${usage.asset.storageKey}`;
      const newUrl = `/api/v1/public/media/${replacement.storageKey}`;
      await this.prisma.$transaction([
        this.prisma.tour.updateMany({ where: { primaryMediaId: id }, data: { primaryMediaId: replacement.id, primaryImageUrl: newUrl } }),
        this.prisma.tour.updateMany({ where: { primaryImageUrl: oldUrl }, data: { primaryImageUrl: newUrl } }),
        this.prisma.destination.updateMany({ where: { heroMediaId: id }, data: { heroMediaId: replacement.id, heroImageUrl: newUrl } }),
        this.prisma.destination.updateMany({ where: { heroImageUrl: oldUrl }, data: { heroImageUrl: newUrl } }),
      ]);
    }

    await this.prisma.mediaAsset.delete({ where: { id } });

    const dir = this.resolvePublicDir();
    const candidates = [usage.asset.storageKey];
    const vars = usage.asset.variantsJson as Record<string, string>;
    for (const v of Object.values(vars || {})) {
      candidates.push(path.basename(v));
    }
    for (const key of new Set(candidates)) {
      try {
        const p = this.safeJoin(dir, key);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // ignore missing derivative
      }
    }

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'media.delete',
      targetType: 'MediaAsset',
      targetId: id,
      requestId: actor.requestId,
      after: { replacedWith: replacementMediaId ?? null },
    });
    return { ok: true };
  }

  readPublicFile(storageKey: string): { filePath: string; contentType: string } {
    const dir = this.resolvePublicDir();
    const filePath = this.safeJoin(dir, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Media file not found', HttpStatus.NOT_FOUND);
    }
    const ext = path.extname(storageKey).toLowerCase();
    const contentType =
      ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
    return { filePath, contentType };
  }

  async readPrivateAssetFile(assetId: string): Promise<{ filePath: string; contentType: string; filename: string }> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.visibility !== 'PRIVATE') {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Private document not found', HttpStatus.NOT_FOUND);
    }
    const dir = this.resolvePrivateDir();
    const filePath = this.safeJoin(dir, asset.storageKey);
    if (!fs.existsSync(filePath)) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Stored private file missing on disk', HttpStatus.NOT_FOUND);
    }
    return { filePath, contentType: asset.mimeType, filename: asset.originalFilename };
  }
}
