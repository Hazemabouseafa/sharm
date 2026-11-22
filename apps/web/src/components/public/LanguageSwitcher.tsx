'use client';

import React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { usePublicLanguage } from './PublicLanguageContext';
import type { PublicLocale } from '@/lib/i18n/public-translations';

export function LanguageSwitcher({ variant = 'header' }: { variant?: 'header' | 'drawer' }) {
  const { locale, setLocale, translating, languages } = usePublicLanguage();

  if (variant === 'drawer') {
    return (
      <div className="mb-5 rounded-xl border border-white/15 bg-white/10 p-3" data-no-translate="true">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E3C68E]">
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Language / Translation</span>
          {translating && <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden="true" />}
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Select website language">
          {languages.map((lang) => {
            const active = locale === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                aria-pressed={active}
                onClick={() => setLocale(lang.code)}
                className={`min-h-[38px] rounded-lg px-2.5 text-xs font-bold transition ${
                  active
                    ? 'bg-[#C9A66B] text-[#103D45]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {lang.short} · {lang.nativeLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      data-no-translate="true"
      className="relative inline-flex items-center rounded-full border border-[#D8D1C2] bg-white px-2.5 py-1 text-[#103D45] shadow-2xs transition hover:border-[#0E7C78]"
    >
      {translating ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#0E7C78]" aria-hidden="true" />
      ) : (
        <Globe className="h-3.5 w-3.5 shrink-0 text-[#0E7C78]" aria-hidden="true" />
      )}
      <label htmlFor="public-lang-select" className="visually-hidden">
        Website language
      </label>
      <select
        id="public-lang-select"
        data-testid="public-language-select"
        aria-label="Website language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as PublicLocale)}
        className="min-h-[32px] cursor-pointer bg-transparent ps-1.5 pe-1 text-xs font-extrabold text-[#103D45] focus:outline-none"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.short} — {lang.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
