'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Globe, Loader2 } from 'lucide-react';
import { AdminLocale, translateAdminToArabic } from '@/lib/i18n/admin-translations';

interface AdminLocaleContextValue {
  locale: AdminLocale;
  isRtl: boolean;
  translating: boolean;
  setLocale: (next: AdminLocale) => void;
  toggleLocale: () => void;
  t: (en: string, ar?: string) => string;
}

const AdminLocaleContext = createContext<AdminLocaleContextValue>({
  locale: 'en',
  isRtl: false,
  translating: false,
  setLocale: () => {},
  toggleLocale: () => {},
  t: (en) => en,
});

const ADMIN_LANG_KEY = 'spt_admin_lang';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CODE', 'PRE', 'TEXTAREA']);
const ATTR_NAMES = ['placeholder', 'aria-label', 'title'] as const;

function shouldSkipAdminNode(el: Element | null): boolean {
  let curr: Element | null = el;
  while (curr) {
    if (SKIP_TAGS.has(curr.tagName)) return true;
    if (curr.getAttribute('data-no-admin-translate') === 'true') return true;
    if (curr.getAttribute('data-no-translate') === 'true') return true;
    curr = curr.parentElement;
  }
  return false;
}

function isDynamicAdminTranslatable(str: string): boolean {
  const t = str.trim();
  if (t.length < 2) return false;
  if (/[\u0600-\u06FF]/.test(t)) return false; // already Arabic
  if (/^[\d\s$€£.,:+/\-–—·•()@#%*!?&_=|[\]{}]+$/.test(t)) return false;
  if (/^SPT-\d{4}-[A-Z0-9]+$/i.test(t)) return false;
  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return false;
  if (/^(https?:\/\/|\/[a-z0-9/_-]+$)/i.test(t)) return false;
  return true;
}

export function AdminLocaleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<AdminLocale>('en');
  const [translating, setTranslating] = useState(false);

  const originalTextMap = useRef<WeakMap<Text, string>>(new WeakMap());
  const appliedTextMap = useRef<WeakMap<Text, string>>(new WeakMap());
  const originalAttrMap = useRef<WeakMap<Element, Partial<Record<string, string>>>>(new WeakMap());
  const dynCacheRef = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const applyingRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_LANG_KEY);
      if (saved === 'ar' || saved === 'en') {
        setLocaleState(saved);
      }
      const rawCache = window.sessionStorage.getItem('spt_admin_ar_cache');
      if (rawCache) {
        const parsed = JSON.parse(rawCache) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          dynCacheRef.current.set(k, v);
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const setLocale = useCallback((next: AdminLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(ADMIN_LANG_KEY, next);
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }, [locale, setLocale]);

  const t = useCallback(
    (en: string, ar?: string) => {
      if (locale === 'en') return en;
      return ar ?? translateAdminToArabic(en) ?? dynCacheRef.current.get(en.trim()) ?? en;
    },
    [locale],
  );

  const applyAdminDomLocale = useCallback(async (target: AdminLocale) => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = target;
    document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr';

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const root = document.getElementById('spt-admin-root');
    if (!root) return;

    const containers: Element[] = [root];
    document.querySelectorAll('dialog[open]').forEach((dlg) => {
      if (!root.contains(dlg)) containers.push(dlg);
    });

    const pendingNodes: Array<{ node: Text; orig: string; trimmed: string }> = [];
    const pendingAttrs: Array<{ el: Element; attr: string; orig: string; trimmed: string }> = [];

    applyingRef.current = true;
    try {
      for (const container of containers) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode() as Text | null;
        while (node) {
          if (!shouldSkipAdminNode(node.parentElement)) {
            const curVal = node.nodeValue ?? '';
            const lastApplied = appliedTextMap.current.get(node);
            if (!originalTextMap.current.has(node) || (lastApplied !== undefined && curVal !== lastApplied)) {
              originalTextMap.current.set(node, curVal);
            }
            const orig = originalTextMap.current.get(node) ?? curVal;

            if (target === 'en') {
              if (curVal !== orig) node.nodeValue = orig;
              appliedTextMap.current.set(node, orig);
            } else {
              const trimmed = orig.trim();
              const staticHit = translateAdminToArabic(orig);
              const dynHit = dynCacheRef.current.get(trimmed);
              if (staticHit) {
                if (curVal !== staticHit) node.nodeValue = staticHit;
                appliedTextMap.current.set(node, staticHit);
              } else if (dynHit) {
                const replaced = orig.replace(trimmed, dynHit);
                if (curVal !== replaced) node.nodeValue = replaced;
                appliedTextMap.current.set(node, replaced);
              } else if (isDynamicAdminTranslatable(orig)) {
                pendingNodes.push({ node, orig, trimmed });
              }
            }
          }
          node = walker.nextNode() as Text | null;
        }

        const elems = container.querySelectorAll('input[placeholder], textarea[placeholder], [aria-label], [title]');
        elems.forEach((el) => {
          if (shouldSkipAdminNode(el)) return;
          let saved = originalAttrMap.current.get(el);
          if (!saved) {
            saved = {};
            originalAttrMap.current.set(el, saved);
          }
          for (const attr of ATTR_NAMES) {
            const val = el.getAttribute(attr);
            if (!val) continue;
            if (saved[attr] === undefined) saved[attr] = val;
            const orig = saved[attr]!;
            if (target === 'en') {
              if (val !== orig) el.setAttribute(attr, orig);
            } else {
              const trimmed = orig.trim();
              const staticHit = translateAdminToArabic(orig);
              const dynHit = dynCacheRef.current.get(trimmed);
              if (staticHit) {
                if (val !== staticHit) el.setAttribute(attr, staticHit);
              } else if (dynHit) {
                const replaced = orig.replace(trimmed, dynHit);
                if (val !== replaced) el.setAttribute(attr, replaced);
              } else if (isDynamicAdminTranslatable(orig)) {
                pendingAttrs.push({ el, attr, orig, trimmed });
              }
            }
          }
        });
      }
    } finally {
      applyingRef.current = false;
    }

    if (target === 'en') {
      setTranslating(false);
      return;
    }

    const uniqueMissing = Array.from(
      new Set([...pendingNodes.map((n) => n.trimmed), ...pendingAttrs.map((a) => a.trimmed)]),
    );

    if (uniqueMissing.length === 0) {
      setTranslating(false);
      return;
    }

    setTranslating(true);
    try {
      for (let i = 0; i < uniqueMissing.length; i += 60) {
        if (controller.signal.aborted) return;
        const batch = uniqueMissing.slice(i, i + 60);
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLang: 'ar', texts: batch }),
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { translations?: string[] };
        if (!Array.isArray(data.translations)) continue;
        batch.forEach((src, idx) => {
          const tx = data.translations![idx];
          if (typeof tx === 'string' && tx.trim()) {
            dynCacheRef.current.set(src, tx.trim());
          }
        });
      }

      if (controller.signal.aborted) return;

      applyingRef.current = true;
      try {
        for (const item of pendingNodes) {
          const hit = dynCacheRef.current.get(item.trimmed);
          if (hit && item.node.isConnected) {
            const replaced = item.orig.replace(item.trimmed, hit);
            item.node.nodeValue = replaced;
            appliedTextMap.current.set(item.node, replaced);
          }
        }
        for (const item of pendingAttrs) {
          const hit = dynCacheRef.current.get(item.trimmed);
          if (hit && item.el.isConnected) {
            item.el.setAttribute(item.attr, item.orig.replace(item.trimmed, hit));
          }
        }
      } finally {
        applyingRef.current = false;
      }

      try {
        const snap: Record<string, string> = {};
        let c = 0;
        for (const [k, v] of dynCacheRef.current.entries()) {
          if (c++ >= 600) break;
          snap[k] = v;
        }
        window.sessionStorage.setItem('spt_admin_ar_cache', JSON.stringify(snap));
      } catch {
        // Ignore quota errors
      }
    } catch {
      // Ignore abort errors
    } finally {
      if (!controller.signal.aborted) setTranslating(false);
    }
  }, []);

  useEffect(() => {
    void applyAdminDomLocale(locale);
    const timer = setTimeout(() => void applyAdminDomLocale(locale), 250);
    return () => clearTimeout(timer);
  }, [locale, pathname, applyAdminDomLocale]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = 'en';
        document.documentElement.dir = 'ltr';
      }
    };
  }, []);

  useEffect(() => {
    if (locale === 'en' || typeof MutationObserver === 'undefined') return;
    const root = document.getElementById('spt-admin-root');
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (applyingRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void applyAdminDomLocale(locale), 180);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [locale, applyAdminDomLocale]);

  return (
    <AdminLocaleContext.Provider
      value={{
        locale,
        isRtl: locale === 'ar',
        translating,
        setLocale,
        toggleLocale,
        t,
      }}
    >
      <div id="spt-admin-root" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} className="min-h-screen">
        {children}
      </div>
    </AdminLocaleContext.Provider>
  );
}

export function useAdminLocale() {
  return useContext(AdminLocaleContext);
}

export function AdminLanguageToggle({ className = '' }: { className?: string }) {
  const { locale, translating, toggleLocale } = useAdminLocale();

  return (
    <button
      type="button"
      data-testid="admin-language-toggle"
      data-no-admin-translate="true"
      onClick={toggleLocale}
      aria-label={locale === 'ar' ? 'Switch admin dashboard to English' : 'التبديل إلى اللغة العربية'}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#CBD5E1] bg-white px-3.5 text-xs font-extrabold text-[#103D45] shadow-2xs transition hover:border-[#0E7C78] hover:bg-[#EFFAF9] ${className}`}
    >
      {translating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0E7C78]" aria-hidden="true" />
      ) : (
        <Globe className="h-3.5 w-3.5 text-[#0E7C78]" aria-hidden="true" />
      )}
      <span>{locale === 'ar' ? 'English' : 'العربية'}</span>
    </button>
  );
}
