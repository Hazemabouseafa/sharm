'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Swipe-dismissible top-layer mobile navigation drawer built on native <dialog> + CSS scroll-snap
 * + IntersectionObserver + scroll-driven backdrop fade with progressive fallbacks (per modern-web-guidance).
 */
export function MobileNavDrawer({ open, onClose, title = 'Site navigation', children }: MobileNavDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const slideClose = () => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'auto' });
    } else {
      dialogRef.current?.close();
      onClose();
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    if (!dialog || !scroller) return;

    let cancelled = false;
    async function openSheet() {
      if (!dialog || !scroller) return;
      if (!dialog.open) dialog.showModal();
      if (typeof CSS !== 'undefined' && !CSS.supports('scroll-initial-target', 'nearest')) {
        scroller.scrollTo({ left: scroller.offsetWidth, behavior: 'instant' as ScrollBehavior });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      if (!cancelled) {
        scroller.scrollTo({ left: 0, behavior: 'auto' });
      }
    }

    if (open) {
      openSheet();
    } else if (dialog.open) {
      dialog.close();
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!dialog || !scroller || !sheet) return;

    const visibleThreshold = 1 / Math.max(320, window.innerWidth);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.intersectionRatio < visibleThreshold && dialog.open) {
          dialog.close();
          onClose();
        }
      },
      { root: dialog, threshold: [visibleThreshold, 1] },
    );
    observer.observe(sheet);

    const onBackdropClick = (event: MouseEvent) => {
      if (!sheet.contains(event.target as Node)) slideClose();
    };
    const onCancel = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
        slideClose();
      }
    };

    let removeScrollFallback: (() => void) | undefined;
    if (typeof CSS !== 'undefined' && !CSS.supports('animation-timeline: scroll()')) {
      const onScroll = () => {
        const ratio = Math.max(0, Math.min(1, 1 - scroller.scrollLeft / Math.max(1, sheet.offsetWidth)));
        dialog.style.setProperty('--drawer-backdrop', String(ratio));
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      removeScrollFallback = () => scroller.removeEventListener('scroll', onScroll);
    }

    dialog.addEventListener('click', onBackdropClick);
    dialog.addEventListener('cancel', onCancel);

    return () => {
      observer.disconnect();
      dialog.removeEventListener('click', onBackdropClick);
      dialog.removeEventListener('cancel', onCancel);
      removeScrollFallback?.();
    };
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="spt-drawer" aria-label={title}>
      <div ref={scrollerRef} className="spt-drawer-scroller">
        <nav ref={sheetRef} aria-label="Mobile" className="spt-drawer-sheet">
          <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
            <span className="text-sm font-bold tracking-wider uppercase text-[#E3C68E]">{title}</span>
            <button
              type="button"
              onClick={slideClose}
              aria-label="Close menu"
              autoFocus
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </nav>
      </div>
    </dialog>
  );
}
