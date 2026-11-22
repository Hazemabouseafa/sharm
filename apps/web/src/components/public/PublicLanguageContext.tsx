'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  PUBLIC_LANGUAGES,
  PublicLanguageMeta,
  PublicLocale,
  lookupStaticPublicTranslation,
} from '@/lib/i18n/public-translations';

interface PublicLanguageContextValue {
  locale: PublicLocale;
  setLocale: (next: PublicLocale) => void;
  translating: boolean;
  languages: PublicLanguageMeta[];
}

const PublicLanguageContext = createContext<PublicLanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  translating: false,
  languages: PUBLIC_LANGUAGES,
});

const STORAGE_KEY = 'spt_public_lang';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CODE', 'PRE', 'TEXTAREA']);
const ATTR_NAMES = ['placeholder', 'aria-label', 'title'] as const;

function isSkippedElement(el: Element | null): boolean {
  let curr: Element | null = el;
  while (curr) {
    if (SKIP_TAGS.has(curr.tagName)) return true;
    if (curr.getAttribute('data-no-translate') === 'true') return true;
    if (curr.getAttribute('data-testid') === 'booking-reference') return true;
    if (curr.getAttribute('translate') === 'no') return true;
    curr = curr.parentElement;
  }
  return false;
}

function isTranslatableText(str: string): boolean {
  const t = str.trim();
  if (t.length < 2) return false;
  if (/^[\d\s$€£.,:+/\-–—·•()@#%*!?&]+$/.test(t)) return false;
  if (/^SPT-\d{4}-[A-Z0-9]+$/i.test(t)) return false;
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  return true;
}

function containsArabic(str: string): boolean {
  return /[\u0600-\u06FF]/.test(str);
}

export function PublicLanguageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<PublicLocale>('en');
  const [translating, setTranslating] = useState(false);

  const originalTextMap = useRef<WeakMap<Text, string>>(new WeakMap());
  const originalAttrMap = useRef<WeakMap<Element, Partial<Record<string, string>>>>(new WeakMap());
  const appliedTextMap = useRef<WeakMap<Text, string>>(new WeakMap());
  const originalDocTitleRef = useRef<string>('');
  const lastAppliedDocTitleRef = useRef<string>('');
  const dynamicCacheRef = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const applyingRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as PublicLocale | null;
      if (saved && PUBLIC_LANGUAGES.some((l) => l.code === saved)) {
        setLocaleState(saved);
      }
      const rawCache = window.sessionStorage.getItem('spt_public_tx_cache_v2');
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          dynamicCacheRef.current.set(k, v);
        }
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const setLocale = useCallback((next: PublicLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const runDomTranslation = useCallback(async (targetLocale: PublicLocale) => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('spt-public-root');
    if (!root) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    document.documentElement.lang = targetLocale;
    document.documentElement.dir = 'ltr';

    // Capture fresh document.title when route changes
    if (!originalDocTitleRef.current || (lastAppliedDocTitleRef.current && document.title !== lastAppliedDocTitleRef.current)) {
      originalDocTitleRef.current = document.title;
    }

    const roots: Element[] = [root];
    document.querySelectorAll('dialog[open]').forEach((dlg) => {
      if (!root.contains(dlg)) roots.push(dlg);
    });

    const pendingTextNodes: Array<{ node: Text; orig: string; trimmed: string }> = [];
    const pendingAttrs: Array<{ el: Element; attr: string; orig: string; trimmed: string }> = [];
    let needsDocTitleTranslation = false;
    const origTitleTrimmed = originalDocTitleRef.current.trim();

    applyingRef.current = true;
    try {
      if (targetLocale === 'en') {
        if (originalDocTitleRef.current && document.title !== originalDocTitleRef.current) {
          document.title = originalDocTitleRef.current;
          lastAppliedDocTitleRef.current = originalDocTitleRef.current;
        }
      } else if (isTranslatableText(origTitleTrimmed)) {
        const titleCacheKey = `${targetLocale}::${origTitleTrimmed}`;
        const cachedTitle = dynamicCacheRef.current.get(titleCacheKey);
        if (cachedTitle) {
          document.title = cachedTitle;
          lastAppliedDocTitleRef.current = cachedTitle;
        } else {
          needsDocTitleTranslation = true;
        }
      }

      for (const container of roots) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode() as Text | null;
        while (current) {
          const parent = current.parentElement;
          if (!isSkippedElement(parent)) {
            const currentVal = current.nodeValue ?? '';
            const lastApplied = appliedTextMap.current.get(current);
            if (!originalTextMap.current.has(current) || (lastApplied !== undefined && currentVal !== lastApplied)) {
              originalTextMap.current.set(current, currentVal);
            }
            const orig = originalTextMap.current.get(current) ?? currentVal;
            const trimmed = orig.trim();

            if (targetLocale === 'en') {
              // If an admin wrote a new item in Arabic, translate it cleanly into English when EN is active;
              // otherwise restore original English verbatim!
              if (containsArabic(trimmed) && isTranslatableText(orig)) {
                const dynHit = dynamicCacheRef.current.get(`en::${trimmed}`);
                if (dynHit) {
                  const replaced = orig.replace(trimmed, dynHit);
                  if (current.nodeValue !== replaced) current.nodeValue = replaced;
                  appliedTextMap.current.set(current, replaced);
                } else {
                  pendingTextNodes.push({ node: current, orig, trimmed });
                }
              } else {
                if (currentVal !== orig) {
                  current.nodeValue = orig;
                }
                appliedTextMap.current.set(current, orig);
              }
            } else if (isTranslatableText(orig)) {
              const staticHit = lookupStaticPublicTranslation(orig, targetLocale);
              const cacheKey = `${targetLocale}::${trimmed}`;
              const dynHit = dynamicCacheRef.current.get(cacheKey);

              if (staticHit) {
                if (current.nodeValue !== staticHit) current.nodeValue = staticHit;
                appliedTextMap.current.set(current, staticHit);
              } else if (dynHit) {
                const replaced = orig.replace(trimmed, dynHit);
                if (current.nodeValue !== replaced) current.nodeValue = replaced;
                appliedTextMap.current.set(current, replaced);
              } else {
                pendingTextNodes.push({ node: current, orig, trimmed });
              }
            }
          }
          current = walker.nextNode() as Text | null;
        }

        const elems = container.querySelectorAll('input[placeholder], textarea[placeholder], [aria-label], [title]');
        elems.forEach((el) => {
          if (isSkippedElement(el)) return;
          let saved = originalAttrMap.current.get(el);
          if (!saved) {
            saved = {};
            originalAttrMap.current.set(el, saved);
          }
          for (const attr of ATTR_NAMES) {
            const val = el.getAttribute(attr);
            if (!val) continue;
            if (saved[attr] === undefined) {
              saved[attr] = val;
            }
            const orig = saved[attr]!;
            const trimmed = orig.trim();
            if (targetLocale === 'en') {
              if (val !== orig) el.setAttribute(attr, orig);
            } else if (isTranslatableText(orig)) {
              const staticHit = lookupStaticPublicTranslation(orig, targetLocale);
              const dynHit = dynamicCacheRef.current.get(`${targetLocale}::${trimmed}`);
              if (staticHit) {
                if (val !== staticHit) el.setAttribute(attr, staticHit);
              } else if (dynHit) {
                const replaced = orig.replace(trimmed, dynHit);
                if (val !== replaced) el.setAttribute(attr, replaced);
              } else {
                pendingAttrs.push({ el, attr, orig, trimmed });
              }
            }
          }
        });
      }
    } finally {
      applyingRef.current = false;
    }

    const uniqueMissing = Array.from(
      new Set([
        ...(needsDocTitleTranslation ? [origTitleTrimmed] : []),
        ...pendingTextNodes.map((x) => x.trimmed),
        ...pendingAttrs.map((x) => x.trimmed),
      ]),
    );

    if (uniqueMissing.length === 0) {
      setTranslating(false);
      return;
    }

    setTranslating(true);
    try {
      for (let i = 0; i < uniqueMissing.length; i += 80) {
        if (controller.signal.aborted) return;
        const batch = uniqueMissing.slice(i, i + 80);
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: targetLocale, texts: batch }),
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { translations?: string[] };
        if (!Array.isArray(data.translations)) continue;

        batch.forEach((src, idx) => {
          const tx = data.translations![idx];
          if (typeof tx === 'string' && tx.trim()) {
            dynamicCacheRef.current.set(`${targetLocale}::${src}`, tx.trim());
          }
        });
      }

      if (controller.signal.aborted) return;

      applyingRef.current = true;
      try {
        if (needsDocTitleTranslation) {
          const hit = dynamicCacheRef.current.get(`${targetLocale}::${origTitleTrimmed}`);
          if (hit) {
            document.title = hit;
            lastAppliedDocTitleRef.current = hit;
          }
        }
        for (const item of pendingTextNodes) {
          const hit = dynamicCacheRef.current.get(`${targetLocale}::${item.trimmed}`);
          if (hit && item.node.isConnected) {
            const replaced = item.orig.replace(item.trimmed, hit);
            item.node.nodeValue = replaced;
            appliedTextMap.current.set(item.node, replaced);
          }
        }
        for (const item of pendingAttrs) {
          const hit = dynamicCacheRef.current.get(`${targetLocale}::${item.trimmed}`);
          if (hit && item.el.isConnected) {
            item.el.setAttribute(item.attr, item.orig.replace(item.trimmed, hit));
          }
        }
      } finally {
        applyingRef.current = false;
      }

      try {
        const snapshot: Record<string, string> = {};
        let count = 0;
        for (const [k, v] of dynamicCacheRef.current.entries()) {
          if (count++ >= 800) break;
          snapshot[k] = v;
        }
        window.sessionStorage.setItem('spt_public_tx_cache_v2', JSON.stringify(snapshot));
      } catch {
        // Ignore quota errors
      }
    } catch {
      // Ignore abort errors on rapid switching
    } finally {
      if (!controller.signal.aborted) {
        setTranslating(false);
      }
    }
  }, []);

  useEffect(() => {
    void runDomTranslation(locale);
    const timer = setTimeout(() => void runDomTranslation(locale), 250);
    return () => clearTimeout(timer);
  }, [locale, pathname, runDomTranslation]);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const targetNode = document.getElementById('spt-public-root');
    if (!targetNode) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (applyingRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void runDomTranslation(locale);
      }, 180);
    });

    observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [locale, runDomTranslation]);

  return (
    <PublicLanguageContext.Provider
      value={{
        locale,
        setLocale,
        translating,
        languages: PUBLIC_LANGUAGES,
      }}
    >
      <div id="spt-public-root" className="contents">
        {children}
      </div>
    </PublicLanguageContext.Provider>
  );
}

export function usePublicLanguage() {
  return useContext(PublicLanguageContext);
}
