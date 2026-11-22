'use client';

let domPurifyPromise: Promise<{ sanitize: (dirty: string, cfg?: Record<string, unknown>) => string }> | null = null;

function loadDOMPurify() {
  domPurifyPromise ??= import('dompurify').then((m) => (m.default ?? m) as unknown as { sanitize: (dirty: string, cfg?: Record<string, unknown>) => string });
  return domPurifyPromise;
}

const ALLOWED_ELEMENTS = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'a'];
const ALLOWED_ATTRS = ['href', 'rel', 'target'];

/**
 * Safely inserts editorial HTML using the native Sanitizer API (Element.prototype.setHTML)
 * when available, falling back to lazy-loaded DOMPurify aligned with native Sanitizer behavior
 * (strips aria and data attributes and disallowed element content per modern-web-guidance sanitize-untrusted-html).
 */
export async function safeSetEditorialHtml(el: HTMLElement, html: string): Promise<void> {
  if ('setHTML' in Element.prototype) {
    (el as HTMLElement & { setHTML: (h: string, o?: unknown) => void }).setHTML(html, {
      sanitizer: { elements: ALLOWED_ELEMENTS, attributes: ALLOWED_ATTRS },
    });
    return;
  }
  const DOMPurify = await loadDOMPurify();
  el.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_ELEMENTS, '#text'],
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
  });
}
