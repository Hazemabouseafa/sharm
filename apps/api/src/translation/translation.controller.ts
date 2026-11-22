import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ERROR_CODES,
} from '@sharm/contracts';
import {
  SUPPORTED_TRANSLATION_LANGS,
  SupportedTranslationLang,
  translateTextsWithCache,
} from '@sharm/database';
import { PrismaService } from '../common/prisma.service';
import { DomainError } from '../common/http-exception.filter';
import { RequirePermissions, StaffAuthGuard } from '../common/auth.guard';

@ApiTags('Public Translation')
@Controller()
export class TranslationController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('public/translate')
  async translateBatch(@Body() body: { targetLang?: string; texts?: unknown }) {
    const targetLang = (body?.targetLang || '').trim().toLowerCase() as SupportedTranslationLang;
    if (!SUPPORTED_TRANSLATION_LANGS.includes(targetLang)) {
      throw new DomainError(ERROR_CODES.VALIDATION_ERROR, `Unsupported target language: ${body?.targetLang ?? ''}`);
    }
    const rawTexts = Array.isArray(body?.texts) ? body.texts : [];
    const texts = rawTexts
      .filter((t): t is string => typeof t === 'string')
      .slice(0, 150)
      .map((t) => t.slice(0, 2000));

    const translations = await translateTextsWithCache(this.prisma, texts, targetLang);
    return { targetLang, translations };
  }

  @UseGuards(StaffAuthGuard)
  @RequirePermissions('overview:read')
  @Get('admin/translations/stats')
  async getStats() {
    const grouped = await this.prisma.translationCache.groupBy({
      by: ['targetLang'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = { ru: 0, it: 0, tr: 0, pl: 0, ar: 0, en: 0 };
    for (const row of grouped) {
      counts[row.targetLang] = row._count._all;
    }
    return { counts };
  }
}
