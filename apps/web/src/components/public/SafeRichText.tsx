'use client';

import React, { useEffect, useRef } from 'react';
import { safeSetEditorialHtml } from '@/lib/sanitize-client';

export function SafeRichText({ html, className = '' }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    void safeSetEditorialHtml(el, html);
  }, [html]);

  return (
    <div
      ref={ref}
      className={`spt-prose ${className}`}
      // Server-rendered sanitized HTML is also safe for SEO/initial paint, then reinforced via native setHTML/DOMPurify on hydration
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
