import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@sharm/database';
import {
  CMS_SCHEMA_VERSION,
  CmsBlock,
  ERROR_CODES,
  GlobalContentDocument,
  GlobalContentSchema,
  PageContentDocument,
  PageContentSchema,
  RESERVED_SLUGS,
} from '@sharm/contracts';
import { enqueueOutboxJob, extractTranslatableStrings } from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/http-exception.filter';
import { getAppEnv } from '../common/env';
import { hmacSha256Hex, timingSafeEqualStr } from '../common/crypto';
import { sanitizeEditorialHtml } from '../common/sanitize';

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private sanitizePageDocument(doc: PageContentDocument): PageContentDocument {
    return {
      ...doc,
      blocks: doc.blocks.map((block) => {
        if (block.type === 'RichText') {
          return {
            ...block,
            props: {
              ...block.props,
              bodyHtml: sanitizeEditorialHtml(block.props.bodyHtml),
            },
          };
        }
        return block;
      }),
    };
  }

  private async triggerImmediateRevalidation(tags: string[], paths: string[]): Promise<void> {
    const env = getAppEnv();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      await fetch(`${env.WEB_INTERNAL_URL}/api/internal/revalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidation-secret': env.REVALIDATION_SECRET,
        },
        body: JSON.stringify({ tags, paths }),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      // Non-fatal: outbox job also retries revalidation durably
    }
  }

  // ==================== PUBLIC READS (PUBLISHED POINTER ONLY!) ====================

  async getPublicGlobal() {
    const [globalRow, settings] = await Promise.all([
      this.prisma.cmsGlobalContent.findUnique({ where: { key: 'site_global' } }),
      this.prisma.siteSetting.findUnique({ where: { key: 'singleton' } }),
    ]);

    const whatsappClean = (settings?.whatsappNumber || '').replace(/[^\d+]/g, '');
    const hasValidWhatsapp = whatsappClean.replace(/\D/g, '').length >= 8;

    return {
      global: (globalRow?.publishedJson ?? null) as GlobalContentDocument | null,
      publishedRevisionNumber: globalRow?.publishedRevisionNumber ?? 1,
      site: {
        companyName: settings?.companyName || 'Sharm Pharaoh Travel',
        legalName: settings?.legalName || '',
        baseCurrency: settings?.baseCurrency || 'USD',
        timezone: settings?.timezone || 'Africa/Cairo',
        contactEmail: settings?.contactEmail || '',
        contactPhone: settings?.contactPhone || '',
        whatsappNumber: hasValidWhatsapp ? whatsappClean : '',
        addressText: settings?.addressText || '',
        mapEmbedUrl: settings?.mapEmbedUrl || '',
        socials: settings?.socialsJson ?? {},
        maintenanceBannerEnabled: settings?.maintenanceBannerEnabled ?? false,
        maintenanceBannerText: settings?.maintenanceBannerText || '',
        seoDefaults: settings?.seoDefaultsJson ?? {},
        demoMode: getAppEnv().DEMO_MODE === 'true',
      },
    };
  }

  async getPublicPublishedPage(slugRaw: string) {
    const slug = slugRaw.replace(/^\/+|\/+$/g, '') || 'home';

    const redirect = await this.prisma.slugRedirect.findUnique({
      where: { fromPath: slug === 'home' ? '/' : `/${slug}` },
    });
    if (redirect) {
      return { redirect: { toPath: redirect.toPath, statusCode: redirect.statusCode } };
    }

    const page = await this.prisma.cmsPage.findUnique({
      where: { slug },
      include: { publishedRevision: true },
    });

    if (!page || !page.publishedRevision) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Published page not found', HttpStatus.NOT_FOUND);
    }

    return {
      page: {
        id: page.id,
        slug: page.slug,
        kind: page.kind,
        title: page.title,
        publishedRevisionId: page.publishedRevisionId,
        revisionNumber: page.publishedRevision.revisionNumber,
        publishedAt: page.publishedRevision.publishedAt,
        content: page.publishedRevision.contentJson as PageContentDocument,
      },
    };
  }

  async getPublicSitemapEntries() {
    const [pages, destinations, tours] = await Promise.all([
      this.prisma.cmsPage.findMany({
        where: { publishedRevisionId: { not: null } },
        include: { publishedRevision: { select: { contentJson: true, publishedAt: true } } },
      }),
      this.prisma.destination.findMany({
        where: { isVisible: true },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.tour.findMany({
        where: { status: 'PUBLISHED' },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const entries: Array<{ path: string; lastModified: string }> = [
      { path: '/', lastModified: new Date().toISOString() },
      { path: '/tours', lastModified: new Date().toISOString() },
      { path: '/contact', lastModified: new Date().toISOString() },
    ];

    for (const d of destinations) {
      entries.push({ path: `/destinations/${d.slug}`, lastModified: d.updatedAt.toISOString() });
    }
    for (const t of tours) {
      entries.push({ path: `/tours/${t.slug}`, lastModified: t.updatedAt.toISOString() });
    }
    for (const p of pages) {
      if (p.kind === 'LEGAL' || p.kind === 'CUSTOM') {
        const content = p.publishedRevision?.contentJson as PageContentDocument | undefined;
        if (content?.seo?.noIndex) continue;
        entries.push({
          path: `/p/${p.slug}`,
          lastModified: (p.publishedRevision?.publishedAt ?? p.updatedAt).toISOString(),
        });
      }
    }
    return entries;
  }

  // ==================== SIGNED PREVIEW (DRAFT ISOLATION) ====================

  async createPreviewLink(pageId: string, revisionId?: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { id: pageId } });
    if (!page) throw new DomainError(ERROR_CODES.NOT_FOUND, 'CMS page not found', HttpStatus.NOT_FOUND);

    const targetRevisionId = revisionId || page.currentDraftId || page.publishedRevisionId;
    if (!targetRevisionId) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Page has no revision available to preview');
    }

    const rev = await this.prisma.cmsRevision.findUnique({ where: { id: targetRevisionId } });
    if (!rev || rev.pageId !== page.id) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Revision does not belong to this page', HttpStatus.NOT_FOUND);
    }

    const exp = Date.now() + 30 * 60_000; // 30 minutes
    const payload = Buffer.from(JSON.stringify({ pageId: page.id, revisionId: rev.id, slug: page.slug, exp }), 'utf8').toString('base64url');
    const sig = hmacSha256Hex(getAppEnv().PREVIEW_SIGNING_SECRET, `preview:${payload}`);
    const token = `${payload}.${sig}`;

    return {
      token,
      expiresAt: new Date(exp).toISOString(),
      previewPath: `/preview?token=${encodeURIComponent(token)}`,
    };
  }

  async resolvePreviewToken(token: string) {
    if (!token || !token.includes('.')) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Invalid preview token', HttpStatus.UNAUTHORIZED);
    }
    const [payload, sig] = token.split('.');
    const expected = hmacSha256Hex(getAppEnv().PREVIEW_SIGNING_SECRET, `preview:${payload}`);
    if (!timingSafeEqualStr(sig, expected)) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Forged or tampered preview link rejected', HttpStatus.UNAUTHORIZED);
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      pageId: string;
      revisionId: string;
      slug: string;
      exp: number;
    };
    if (!decoded.exp || decoded.exp < Date.now()) {
      throw new DomainError(ERROR_CODES.UNAUTHORIZED, 'Preview link has expired', HttpStatus.UNAUTHORIZED);
    }

    const rev = await this.prisma.cmsRevision.findUnique({
      where: { id: decoded.revisionId },
      include: { page: true },
    });
    if (!rev || rev.pageId !== decoded.pageId) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Preview revision no longer exists', HttpStatus.NOT_FOUND);
    }

    const globalRow = await this.prisma.cmsGlobalContent.findUnique({ where: { key: 'site_global' } });

    return {
      isPreview: true,
      page: {
        id: rev.page.id,
        slug: rev.page.slug,
        kind: rev.page.kind,
        title: rev.page.title,
        revisionId: rev.id,
        revisionNumber: rev.revisionNumber,
        status: rev.status,
        content: rev.contentJson as PageContentDocument,
      },
      global: (globalRow?.draftJson ?? globalRow?.publishedJson) as GlobalContentDocument | null,
    };
  }

  // ==================== ADMIN LIVE EDITOR & REVISIONS ====================

  async listAdminPages() {
    return this.prisma.cmsPage.findMany({
      include: {
        publishedRevision: { select: { id: true, revisionNumber: true, publishedAt: true } },
        currentDraft: { select: { id: true, revisionNumber: true, version: true, updatedAt: true } },
        _count: { select: { revisions: true, publishSchedules: true } },
      },
      orderBy: [{ isSystemProtected: 'desc' }, { slug: 'asc' }],
    });
  }

  async createCustomPage(
    body: { slug: string; title: string; kind?: 'LEGAL' | 'CUSTOM' },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const slug = body.slug.trim().toLowerCase().replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-]+/g, '-');
    if (!slug || RESERVED_SLUGS.has(slug)) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Slug "${slug}" is reserved and cannot be claimed by CMS pages`);
    }
    const existing = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (existing) throw new DomainError(ERROR_CODES.CONFLICT, `Page slug "${slug}" already exists`, HttpStatus.CONFLICT);

    const initialContent: PageContentDocument = {
      schemaVersion: CMS_SCHEMA_VERSION,
      seo: { title: `${body.title.trim()} | Sharm Pharaoh Travel`, description: '', noIndex: false },
      blocks: [
        {
          id: `richtext-${Date.now().toString(36)}`,
          type: 'RichText',
          label: 'Page Content',
          hidden: false,
          locked: false,
          style: { backgroundToken: 'white', textAlign: 'left', containerWidth: 'narrow', paddingTopPx: 56, paddingBottomPx: 56, overlayOpacity: 0, hideOnMobile: false, hideOnTablet: false, hideOnDesktop: false, fontScale: 'default' },
          props: { heading: body.title.trim(), bodyHtml: '<p>Start crafting your page content in the Live Editor.</p>' },
        },
      ],
    };

    const page = await this.prisma.$transaction(async (tx) => {
      const p = await tx.cmsPage.create({
        data: { slug, title: body.title.trim(), kind: body.kind ?? 'CUSTOM', isSystemProtected: false },
      });
      const draft = await tx.cmsRevision.create({
        data: {
          pageId: p.id,
          revisionNumber: 1,
          status: 'DRAFT',
          contentJson: initialContent as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          createdById: actor.userId,
          notes: 'Initial draft',
        },
      });
      return tx.cmsPage.update({ where: { id: p.id }, data: { currentDraftId: draft.id } });
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.page.create',
      targetType: 'CmsPage',
      targetId: page.id,
      requestId: actor.requestId,
      after: { slug: page.slug, title: page.title },
    });
    return page;
  }

  async getAdminPageDetail(pageId: string): Promise<Prisma.CmsPageGetPayload<{
    include: {
      publishedRevision: true;
      currentDraft: true;
      revisions: {
        include: {
          createdBy: { select: { id: true; fullName: true } };
          publishedBy: { select: { id: true; fullName: true } };
        };
      };
      publishSchedules: true;
    };
  }>> {
    const page = await this.prisma.cmsPage.findUnique({
      where: { id: pageId },
      include: {
        publishedRevision: true,
        currentDraft: true,
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 250,
          include: {
            createdBy: { select: { id: true, fullName: true } },
            publishedBy: { select: { id: true, fullName: true } },
          },
        },
        publishSchedules: { orderBy: { scheduledForUtc: 'asc' } },
      },
    });
    if (!page) throw new DomainError(ERROR_CODES.NOT_FOUND, 'CMS page not found', HttpStatus.NOT_FOUND);

    // Ensure there is always an editable DRAFT revision separate from PUBLISHED
    if (!page.currentDraft || page.currentDraft.status !== 'DRAFT') {
      const baseContent = (page.currentDraft?.contentJson ?? page.publishedRevision?.contentJson) as PageContentDocument;
      const latestRevNum = page.revisions[0]?.revisionNumber ?? 0;
      const freshDraft = await this.prisma.cmsRevision.create({
        data: {
          pageId: page.id,
          revisionNumber: latestRevNum + 1,
          status: 'DRAFT',
          contentJson: baseContent as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          notes: 'Working draft',
        },
      });
      await this.prisma.cmsPage.update({
        where: { id: page.id },
        data: { currentDraftId: freshDraft.id },
      });
      return this.getAdminPageDetail(pageId);
    }

    return page;
  }

  /**
   * Saves draft changes with strict Zod schema validation, XSS sanitization, locked-block protection,
   * and optimistic version conflict detection (returns 409 VERSION_CONFLICT with server draft on race!).
   */
  async saveDraft(
    pageId: string,
    body: {
      content: unknown;
      expectedDraftVersion: number;
      notes?: string;
      duplicateOnConflict?: boolean;
    },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const parsed = PageContentSchema.safeParse(body.content);
    if (!parsed.success) {
      throw new DomainError(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid block schema or disallowed markup/XSS detected',
        HttpStatus.BAD_REQUEST,
        parsed.error.flatten(),
      );
    }

    const sanitized = this.sanitizePageDocument(parsed.data);
    const page = await this.getAdminPageDetail(pageId);
    const currentDraft = page.currentDraft!;

    // Guard against removing locked transactional elements (SearchBar on home, ContactForm on contact)
    const publishedBlocks = ((page.publishedRevision?.contentJson as PageContentDocument | undefined)?.blocks ?? []) as CmsBlock[];
    const lockedTypes = publishedBlocks.filter((b) => b.locked).map((b) => b.type);
    for (const reqType of lockedTypes) {
      if (!sanitized.blocks.some((b) => b.type === reqType)) {
        throw new DomainError(
          ERROR_CODES.VALIDATION_ERROR,
          `Required transactional section "${reqType}" cannot be deleted from this page`,
        );
      }
    }

    // Optimistic version conflict detection between concurrent editors
    if (body.expectedDraftVersion !== currentDraft.version) {
      if (!body.duplicateOnConflict) {
        throw new DomainError(
          ERROR_CODES.VERSION_CONFLICT,
          'Another editor modified this draft since you loaded it. Compare changes, reload, or save as a duplicate draft.',
          HttpStatus.CONFLICT,
          {
            serverDraftVersion: currentDraft.version,
            serverRevisionNumber: currentDraft.revisionNumber,
            serverUpdatedAt: currentDraft.updatedAt,
            serverContent: currentDraft.contentJson,
          },
        );
      }

      // Safe recovery: create a separate preserved duplicate draft revision without overwriting the other editor!
      const latest = await this.prisma.cmsRevision.findFirst({
        where: { pageId },
        orderBy: { revisionNumber: 'desc' },
      });
      const dup = await this.prisma.cmsRevision.create({
        data: {
          pageId,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          status: 'DRAFT',
          contentJson: sanitized as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          createdById: actor.userId,
          notes: body.notes || `Recovered conflict copy from v${body.expectedDraftVersion}`,
        },
      });
      await this.prisma.cmsPage.update({
        where: { id: pageId },
        data: { currentDraftId: dup.id },
      });
      return { draft: dup, duplicatedFromConflict: true };
    }

    // Atomic conditional update using version in WHERE clause so simultaneous requests never silently overwrite!
    const updateRes = await this.prisma.cmsRevision.updateMany({
      where: { id: currentDraft.id, version: body.expectedDraftVersion },
      data: {
        contentJson: sanitized as unknown as Prisma.InputJsonValue,
        notes: body.notes ?? currentDraft.notes,
        version: { increment: 1 },
      },
    });

    if (updateRes.count === 0) {
      const latestDraft = await this.prisma.cmsRevision.findUniqueOrThrow({ where: { id: currentDraft.id } });
      throw new DomainError(
        ERROR_CODES.VERSION_CONFLICT,
        'Concurrent edit conflict detected during autosave.',
        HttpStatus.CONFLICT,
        {
          serverDraftVersion: latestDraft.version,
          serverContent: latestDraft.contentJson,
        },
      );
    }

    const fresh = await this.prisma.cmsRevision.findUniqueOrThrow({ where: { id: currentDraft.id } });
    return { draft: fresh, duplicatedFromConflict: false };
  }

  /**
   * Validates the full draft, atomically advances publishedRevisionId, spawns a fresh working draft,
   * audits, and immediately invalidates public Next.js caches (zero rebuild/restart needed!).
   */
  async publishPage(pageId: string, notes: string | undefined, actor: { userId: string; role: string; requestId?: string }) {
    const page = await this.getAdminPageDetail(pageId);
    const draft = page.currentDraft!;
    const parsed = PageContentSchema.safeParse(draft.contentJson);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Draft failed validation and cannot be published', 400, parsed.error.flatten());
    }

    const sanitized = this.sanitizePageDocument(parsed.data);
    const now = new Date();
    const publicPath = page.slug === 'home' ? '/' : page.kind === 'LEGAL' || page.kind === 'CUSTOM' ? `/p/${page.slug}` : `/${page.slug}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const publishedRev = await tx.cmsRevision.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          contentJson: sanitized as unknown as Prisma.InputJsonValue,
          publishedById: actor.userId,
          publishedAt: now,
          notes: notes || draft.notes || 'Published via Live Editor',
        },
      });

      const latest = await tx.cmsRevision.findFirst({
        where: { pageId },
        orderBy: { revisionNumber: 'desc' },
      });

      const nextDraft = await tx.cmsRevision.create({
        data: {
          pageId,
          revisionNumber: (latest?.revisionNumber ?? publishedRev.revisionNumber) + 1,
          status: 'DRAFT',
          contentJson: sanitized as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          createdById: actor.userId,
          notes: `Draft based on published rev #${publishedRev.revisionNumber}`,
        },
      });

      const updatedPage = await tx.cmsPage.update({
        where: { id: pageId },
        data: {
          publishedRevisionId: publishedRev.id,
          currentDraftId: nextDraft.id,
          version: { increment: 1 },
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'TRIGGER_REVALIDATION',
        dedupeKey: `revalidate:${page.slug}:${publishedRev.id}:${Date.now()}`,
        payload: {
          tags: ['cms:global', `cms:page:${page.slug}`],
          paths: [publicPath],
        },
      });

      const textsToTranslate = extractTranslatableStrings(sanitized);
      if (textsToTranslate.length > 0) {
        await enqueueOutboxJob(tx, {
          jobType: 'PRETRANSLATE_CONTENT',
          dedupeKey: `pretranslate:cms:${page.slug}:${publishedRev.id}`,
          payload: {
            source: `cms:${page.slug}`,
            texts: textsToTranslate,
          },
        });
      }

      return { page: updatedPage, publishedRevision: publishedRev, nextDraft };
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.page.publish',
      targetType: 'CmsPage',
      targetId: pageId,
      requestId: actor.requestId,
      before: { publishedRevisionId: page.publishedRevisionId },
      after: { publishedRevisionId: result.publishedRevision.id, revisionNumber: result.publishedRevision.revisionNumber },
    });

    await this.triggerImmediateRevalidation(['cms:global', `cms:page:${page.slug}`], [publicPath]);
    return result;
  }

  /**
   * Rollback publishes a chosen prior revision cleanly through the same validation and cache invalidation path.
   */
  async rollbackPage(pageId: string, targetRevisionId: string, actor: { userId: string; role: string; requestId?: string }) {
    const page = await this.prisma.cmsPage.findUnique({ where: { id: pageId } });
    if (!page) throw new DomainError(ERROR_CODES.NOT_FOUND, 'Page not found', HttpStatus.NOT_FOUND);

    const targetRev = await this.prisma.cmsRevision.findUnique({ where: { id: targetRevisionId } });
    if (!targetRev || targetRev.pageId !== pageId) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Target revision not found for this page', HttpStatus.NOT_FOUND);
    }

    const parsed = PageContentSchema.safeParse(targetRev.contentJson);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Selected historical revision failed schema validation');
    }

    const sanitized = this.sanitizePageDocument(parsed.data);
    const publicPath = page.slug === 'home' ? '/' : page.kind === 'LEGAL' || page.kind === 'CUSTOM' ? `/p/${page.slug}` : `/${page.slug}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.cmsRevision.findFirst({ where: { pageId }, orderBy: { revisionNumber: 'desc' } });
      const nextNum = (latest?.revisionNumber ?? 0) + 1;

      const publishedRev = await tx.cmsRevision.create({
        data: {
          pageId,
          revisionNumber: nextNum,
          status: 'PUBLISHED',
          contentJson: sanitized as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          createdById: actor.userId,
          publishedById: actor.userId,
          publishedAt: new Date(),
          notes: `Rollback to revision #${targetRev.revisionNumber}`,
        },
      });

      const freshDraft = await tx.cmsRevision.create({
        data: {
          pageId,
          revisionNumber: nextNum + 1,
          status: 'DRAFT',
          contentJson: sanitized as unknown as Prisma.InputJsonValue,
          schemaVersion: CMS_SCHEMA_VERSION,
          createdById: actor.userId,
          notes: `Draft after rollback to #${targetRev.revisionNumber}`,
        },
      });

      const updatedPage = await tx.cmsPage.update({
        where: { id: pageId },
        data: {
          publishedRevisionId: publishedRev.id,
          currentDraftId: freshDraft.id,
          version: { increment: 1 },
        },
      });

      await enqueueOutboxJob(tx, {
        jobType: 'TRIGGER_REVALIDATION',
        payload: { tags: ['cms:global', `cms:page:${page.slug}`], paths: [publicPath] },
      });

      return { page: updatedPage, publishedRevision: publishedRev, nextDraft: freshDraft };
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.page.rollback',
      targetType: 'CmsPage',
      targetId: pageId,
      requestId: actor.requestId,
      after: { rolledBackToRevisionId: targetRevisionId, newRevisionNumber: result.publishedRevision.revisionNumber },
    });

    await this.triggerImmediateRevalidation(['cms:global', `cms:page:${page.slug}`], [publicPath]);
    return result;
  }

  async restoreRevisionToDraft(pageId: string, revisionId: string, actor: { userId: string; role: string }) {
    const rev = await this.prisma.cmsRevision.findUnique({ where: { id: revisionId } });
    if (!rev || rev.pageId !== pageId) {
      throw new DomainError(ERROR_CODES.NOT_FOUND, 'Revision not found', HttpStatus.NOT_FOUND);
    }
    const page = await this.getAdminPageDetail(pageId);
    const updatedDraft = await this.prisma.cmsRevision.update({
      where: { id: page.currentDraftId! },
      data: {
        contentJson: rev.contentJson as Prisma.InputJsonValue,
        notes: `Restored draft from revision #${rev.revisionNumber}`,
        version: { increment: 1 },
      },
    });
    return { draft: updatedDraft };
  }

  async schedulePublish(
    pageId: string,
    body: { revisionId?: string; scheduledForUtc: string; timezone?: string },
    actor: { userId: string; role: string; requestId?: string },
  ) {
    const page = await this.getAdminPageDetail(pageId);
    const targetRevId = body.revisionId || page.currentDraftId!;
    const schedDate = new Date(body.scheduledForUtc);
    if (Number.isNaN(schedDate.getTime()) || schedDate.getTime() <= Date.now()) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Scheduled publication timestamp must be in the future');
    }

    const schedule = await this.prisma.cmsPublishSchedule.create({
      data: {
        pageId,
        revisionId: targetRevId,
        scheduledForUtc: schedDate,
        timezone: body.timezone || 'Africa/Cairo',
        createdById: actor.userId,
      },
    });

    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.page.schedule_publish',
      targetType: 'CmsPublishSchedule',
      targetId: schedule.id,
      requestId: actor.requestId,
      after: { pageId, revisionId: targetRevId, scheduledForUtc: schedDate.toISOString() },
    });

    return schedule;
  }

  async cancelSchedule(scheduleId: string, actor: { userId: string; role: string; requestId?: string }) {
    const updated = await this.prisma.cmsPublishSchedule.update({
      where: { id: scheduleId },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.page.schedule_cancel',
      targetType: 'CmsPublishSchedule',
      targetId: scheduleId,
      requestId: actor.requestId,
    });
    return updated;
  }

  // ==================== GLOBAL CONTENT (HEADER / FOOTER / MENUS / THEME) ====================

  async getAdminGlobal() {
    return this.prisma.cmsGlobalContent.findUniqueOrThrow({ where: { key: 'site_global' } });
  }

  async saveGlobalDraft(content: unknown, expectedVersion: number | undefined) {
    const parsed = GlobalContentSchema.safeParse(content);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Invalid global content schema', 400, parsed.error.flatten());
    }
    const existing = await this.prisma.cmsGlobalContent.findUniqueOrThrow({ where: { key: 'site_global' } });
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new DomainError(ERROR_CODES.VERSION_CONFLICT, 'Global theme/navigation was edited by another staff member', HttpStatus.CONFLICT);
    }
    return this.prisma.cmsGlobalContent.update({
      where: { key: 'site_global' },
      data: {
        draftJson: parsed.data as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
  }

  async publishGlobal(actor: { userId: string; role: string; requestId?: string }) {
    const existing = await this.prisma.cmsGlobalContent.findUniqueOrThrow({ where: { key: 'site_global' } });
    const parsed = GlobalContentSchema.safeParse(existing.draftJson);
    if (!parsed.success) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, 'Global draft failed schema validation');
    }
    const updated = await this.prisma.cmsGlobalContent.update({
      where: { key: 'site_global' },
      data: {
        publishedJson: parsed.data as unknown as Prisma.InputJsonValue,
        publishedRevisionNumber: { increment: 1 },
        updatedById: actor.userId,
      },
    });
    await this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'cms.global.publish',
      targetType: 'CmsGlobalContent',
      targetId: updated.id,
      requestId: actor.requestId,
    });
    const globalTexts = extractTranslatableStrings(parsed.data);
    if (globalTexts.length > 0) {
      await enqueueOutboxJob(this.prisma, {
        jobType: 'PRETRANSLATE_CONTENT',
        dedupeKey: `pretranslate:global:${updated.publishedRevisionNumber}`,
        payload: {
          source: 'cms:global',
          texts: globalTexts,
        },
      });
    }
    await this.triggerImmediateRevalidation(['cms:global'], ['/', '/tours', '/contact']);
    return updated;
  }
}
