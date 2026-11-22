import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const SUPPORTED_TRANSLATION_LANGS = ['en', 'ru', 'it', 'tr', 'pl', 'ar'] as const;
export type SupportedTranslationLang = (typeof SUPPORTED_TRANSLATION_LANGS)[number];

export const PUBLIC_AUTO_TRANSLATE_TARGETS: SupportedTranslationLang[] = ['ru', 'it', 'tr', 'pl'];

const BATCH_SEPARATOR = ' ||| ';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function detectSourceLang(text: string): 'ar' | 'en' {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

export function isHumanTranslatableString(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2) return false;
  if (/^[\d\s$€£.,:+/\-–—·•()@#%*!?&_=|[\]{}]+$/.test(t)) return false;
  if (/^SPT-\d{4}-[A-Z0-9]+$/i.test(t)) return false;
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return false;
  if (/^(https?:\/\/|\/media\/|\/brand\/|\/tours|\/destinations|\/p\/|\/admin|#[a-z0-9_-]+$)/i.test(t)) return false;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(t) && !/\s/.test(t)) return false; // slugs like sharm-el-sheikh
  if (/^[A-Z0-9_]{2,}$/.test(t)) return false; // internal enum constants
  return true;
}

/**
 * Splits a long paragraph (>440 chars) along sentence boundaries so external APIs
 * with 500-char query limits never truncate text.
 */
function splitLongParagraph(text: string, maxLen = 430): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?؟\n])\s+/);
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (!s) continue;
    if (buf && buf.length + 1 + s.length > maxLen) {
      chunks.push(buf);
      buf = s;
    } else if (!buf && s.length > maxLen) {
      // Hard split very long unbroken sentence on spaces
      let rem = s;
      while (rem.length > maxLen) {
        const cut = rem.lastIndexOf(' ', maxLen);
        const idx = cut > 80 ? cut : maxLen;
        chunks.push(rem.slice(0, idx).trim());
        rem = rem.slice(idx).trim();
      }
      buf = rem;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function callDeepL(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): Promise<string[] | null> {
  try {
    const isFree = apiKey.endsWith(':fx');
    const url = isFree
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: texts,
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translations?: Array<{ text?: string }> };
    if (!Array.isArray(data.translations) || data.translations.length !== texts.length) return null;
    return data.translations.map((t, i) => (t?.text ? t.text.trim() : texts[i]));
  } catch {
    return null;
  }
}

async function callGoogleCloudTranslate(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): Promise<string[] | null> {
  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { translations?: Array<{ translatedText?: string }> } };
    const list = data?.data?.translations;
    if (!Array.isArray(list) || list.length !== texts.length) return null;
    return list.map((t, i) => (t?.translatedText ? t.translatedText.trim() : texts[i]));
  } catch {
    return null;
  }
}

async function callLibreTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
  baseUrl: string,
  apiKey?: string,
): Promise<string | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/translate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
        ...(apiKey ? { api_key: apiKey } : {}),
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translatedText?: string };
    return data?.translatedText?.trim() || null;
  } catch {
    return null;
  }
}

async function callGoogleBatchClient(
  items: string[],
  sourceLang: string,
  targetLang: string,
): Promise<Array<string | null> | null> {
  const results: Array<string | null> = new Array(items.length).fill(null);
  const chunkSize = 25;
  let anySuccess = false;

  for (let start = 0; start < items.length; start += chunkSize) {
    const slice = items.slice(start, start + chunkSize);
    try {
      const form = new URLSearchParams();
      for (const q of slice) {
        form.append('q', q);
      }
      const res = await fetch(
        `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      if (Array.isArray(data) && data.length === slice.length) {
        for (let k = 0; k < slice.length; k += 1) {
          const item = data[k];
          const text = typeof item === 'string' ? item : Array.isArray(item) && typeof item[0] === 'string' ? item[0] : null;
          if (text && text.trim()) {
            results[start + k] = text.trim();
            anySuccess = true;
          }
        }
      }
    } catch {
      // Continue to next chunk or fallback provider
    }
  }

  return anySuccess ? results : null;
}

async function callMyMemorySingle(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string | null> {
  const chunks = splitLongParagraph(text, 430);
  const translatedChunks: string[] = [];
  const contactEmail = process.env.TRANSLATE_CONTACT_EMAIL || '';

  for (const chunk of chunks) {
    try {
      const params = new URLSearchParams({
        q: chunk,
        langpair: `${sourceLang}|${targetLang}`,
      });
      if (contactEmail) params.set('de', contactEmail);
      const res = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        responseStatus?: number;
        responseData?: { translatedText?: string };
      };
      const out = data?.responseData?.translatedText?.trim() || '';
      if (
        !out ||
        data.responseStatus !== 200 ||
        out.includes('MYMEMORY WARNING') ||
        out.includes('QUERY LENGTH LIMIT') ||
        out.includes('INVALID LANGUAGE PAIR')
      ) {
        return null;
      }
      translatedChunks.push(out);
    } catch {
      return null;
    }
  }
  return translatedChunks.join(' ');
}

async function callMyMemoryBatched(
  items: string[],
  sourceLang: string,
  targetLang: string,
): Promise<Array<string | null>> {
  const results: Array<string | null> = new Array(items.length).fill(null);

  // Pack short strings together using BATCH_SEPARATOR up to 420 chars per HTTP call
  const groups: Array<{ indices: number[]; texts: string[] }> = [];
  let currIndices: number[] = [];
  let currTexts: string[] = [];
  let currLen = 0;

  for (let i = 0; i < items.length; i += 1) {
    const t = items[i];
    if (t.length > 260 || t.includes('|||')) {
      groups.push({ indices: [i], texts: [t] });
      continue;
    }
    const addedLen = currTexts.length === 0 ? t.length : BATCH_SEPARATOR.length + t.length;
    if (currTexts.length >= 6 || (currTexts.length > 0 && currLen + addedLen > 420)) {
      groups.push({ indices: currIndices, texts: currTexts });
      currIndices = [i];
      currTexts = [t];
      currLen = t.length;
    } else {
      currIndices.push(i);
      currTexts.push(t);
      currLen += addedLen;
    }
  }
  if (currTexts.length > 0) {
    groups.push({ indices: currIndices, texts: currTexts });
  }

  // Run groups with concurrency = 3 to keep latency fast without triggering rate limits
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < groups.length) {
      const idx = cursor++;
      const group = groups[idx];
      if (group.texts.length === 1) {
        results[group.indices[0]] = await callMyMemorySingle(group.texts[0], sourceLang, targetLang);
      } else {
        const joined = group.texts.join(BATCH_SEPARATOR);
        const batchOut = await callMyMemorySingle(joined, sourceLang, targetLang);
        if (batchOut) {
          const parts = batchOut.split(/\s*\|\|\|\s*/);
          if (parts.length === group.texts.length && parts.every((p) => p.trim().length > 0)) {
            for (let k = 0; k < group.indices.length; k += 1) {
              results[group.indices[k]] = parts[k].trim();
            }
            continue;
          }
        }
        // Fallback: translate each item in the group individually if separator count didn't match
        for (let k = 0; k < group.indices.length; k += 1) {
          results[group.indices[k]] = await callMyMemorySingle(group.texts[k], sourceLang, targetLang);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, () => worker()));
  return results;
}

/**
 * Translates an array of texts into targetLang using PostgreSQL TranslationCache first,
 * then configured production providers (DeepL -> Google Cloud -> LibreTranslate -> MyMemory),
 * and permanently caches all new translations in PostgreSQL.
 */
export async function translateTextsWithCache(
  prisma: PrismaClient,
  texts: string[],
  targetLang: SupportedTranslationLang,
): Promise<string[]> {
  if (!SUPPORTED_TRANSLATION_LANGS.includes(targetLang) || texts.length === 0) {
    return texts;
  }

  // 1. Deduplicate trimmed inputs while preserving leading/trailing whitespace on output
  const uniqueTrimmed: string[] = [];
  const uniqueSet = new Set<string>();
  const metaPerInput = texts.map((raw) => {
    const trimmed = raw.trim();
    const sourceLang = detectSourceLang(trimmed);
    const shouldTranslate =
      trimmed.length > 0 &&
      sourceLang !== targetLang &&
      isHumanTranslatableString(trimmed);
    const hash = shouldTranslate ? sha256(trimmed) : '';
    if (shouldTranslate && !uniqueSet.has(trimmed)) {
      uniqueSet.add(trimmed);
      uniqueTrimmed.push(trimmed);
    }
    return { raw, trimmed, sourceLang, shouldTranslate, hash };
  });

  if (uniqueTrimmed.length === 0) {
    return texts;
  }

  // 2. Single PostgreSQL batch lookup
  const hashes = uniqueTrimmed.map((t) => sha256(t));
  const cachedRows = await prisma.translationCache.findMany({
    where: {
      targetLang,
      sourceHash: { in: hashes },
    },
    select: { sourceHash: true, translatedText: true },
  });

  const resolvedByHash = new Map<string, string>();
  for (const row of cachedRows) {
    resolvedByHash.set(row.sourceHash, row.translatedText);
  }

  // 3. Group cache misses by detected sourceLang ('en' vs 'ar')
  const missesBySource = new Map<'en' | 'ar', string[]>();
  for (const text of uniqueTrimmed) {
    const h = sha256(text);
    if (resolvedByHash.has(h)) continue;
    const sl = detectSourceLang(text);
    const bucket = missesBySource.get(sl) ?? [];
    bucket.push(text);
    missesBySource.set(sl, bucket);
  }

  const toPersist: Array<{
    sourceHash: string;
    sourceLang: string;
    targetLang: string;
    sourceText: string;
    translatedText: string;
    provider: string;
  }> = [];

  const deeplKey = process.env.DEEPL_API_KEY || '';
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY || '';
  const libreUrl = process.env.LIBRETRANSLATE_URL || '';
  const libreKey = process.env.LIBRETRANSLATE_API_KEY || '';

  for (const [sourceLang, missingList] of missesBySource.entries()) {
    let providerUsed = 'mymemory';
    let translatedList: Array<string | null> | null = null;

    if (deeplKey) {
      translatedList = await callDeepL(missingList, sourceLang, targetLang, deeplKey);
      if (translatedList) providerUsed = 'deepl';
    }
    if (!translatedList && googleKey) {
      translatedList = await callGoogleCloudTranslate(missingList, sourceLang, targetLang, googleKey);
      if (translatedList) providerUsed = 'google_cloud';
    }
    if (!translatedList && libreUrl) {
      const libreOut = await Promise.all(
        missingList.map((t) => callLibreTranslate(t, sourceLang, targetLang, libreUrl, libreKey)),
      );
      if (libreOut.some((v) => v !== null)) {
        translatedList = libreOut;
        providerUsed = 'libretranslate';
      }
    }
    if (!translatedList) {
      translatedList = await callGoogleBatchClient(missingList, sourceLang, targetLang);
      if (translatedList) providerUsed = 'google_batch';
    }
    if (!translatedList) {
      translatedList = await callMyMemoryBatched(missingList, sourceLang, targetLang);
      providerUsed = 'mymemory';
    }

    for (let i = 0; i < missingList.length; i += 1) {
      const src = missingList[i];
      const out = translatedList[i];
      if (out && out.trim()) {
        const h = sha256(src);
        resolvedByHash.set(h, out.trim());
        toPersist.push({
          sourceHash: h,
          sourceLang,
          targetLang,
          sourceText: src,
          translatedText: out.trim(),
          provider: providerUsed,
        });
      }
    }
  }

  // 4. Persist all new translations into PostgreSQL permanently
  if (toPersist.length > 0) {
    try {
      await prisma.translationCache.createMany({
        data: toPersist,
        skipDuplicates: true,
      });
    } catch {
      // Ignore concurrent unique-constraint races safely
    }
  }

  return metaPerInput.map((m) => {
    if (!m.shouldTranslate) return m.raw;
    const hit = resolvedByHash.get(m.hash);
    if (!hit) return m.raw;
    return m.raw.replace(m.trimmed, hit);
  });
}

/**
 * Recursively extracts all human-readable text strings from any Tour, Destination,
 * Policy, Category, or CMS Page JSON document for automatic background pre-translation.
 */
export function extractTranslatableStrings(input: unknown): string[] {
  const out = new Set<string>();
  const skipKeys = new Set([
    'id',
    'slug',
    'currency',
    'timezone',
    'imageUrl',
    'primaryImageUrl',
    'heroImageUrl',
    'href',
    'ctaHref',
    'primaryCtaHref',
    'secondaryCtaHref',
    'videoUrl',
    'mapEmbedUrl',
    'destinationSlug',
    'categorySlug',
    'status',
    'pricingMode',
    'backgroundToken',
    'textAlign',
    'containerWidth',
    'fontScale',
    'type',
    'code',
    'icon',
    'email',
    'contactEmail',
    'phone',
    'contactPhone',
    'whatsappNumber',
  ]);

  function addString(str: string) {
    // Strip HTML tags into readable text segments (matching DOM Text nodes inside SafeRichText)
    if (/<[a-z][\s\S]*>/i.test(str)) {
      const stripped = str
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
      for (const seg of stripped.split(/\r?\n/)) {
        const clean = seg.trim();
        if (isHumanTranslatableString(clean)) out.add(clean);
      }
      return;
    }
    const clean = str.trim();
    if (isHumanTranslatableString(clean)) out.add(clean);
  }

  function walk(val: unknown) {
    if (!val) return;
    if (typeof val === 'string') {
      addString(val);
      return;
    }
    if (Array.isArray(val)) {
      for (const item of val) walk(item);
      return;
    }
    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (skipKeys.has(k) || k.endsWith('Id') || k.endsWith('Url') || k.endsWith('Href') || k.endsWith('At')) {
          continue;
        }
        walk(v);
      }
    }
  }

  walk(input);
  return Array.from(out);
}
