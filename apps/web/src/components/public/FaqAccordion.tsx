'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Accessible FAQ Accordion using <h3> wrapping <button aria-expanded aria-controls>
 * (avoids placing headings inside <summary> per modern-web-guidance accessibility).
 */
export function FaqAccordion({
  items,
}: {
  items: Array<{ question: string; answer: string }>;
}) {
  const baseId = useId();
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const isOpen = openIdx === idx;
        const panelId = `${baseId}-panel-${idx}`;
        const btnId = `${baseId}-btn-${idx}`;
        return (
          <div
            key={`${item.question}-${idx}`}
            className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white shadow-xs"
          >
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 px-6 py-4 text-left text-base font-bold text-[#103D45] transition hover:bg-[#FAF8F4]"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-[#0E7C78] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className="border-t border-[#F1EDE4] px-6 py-4 text-sm leading-relaxed text-[#334155]"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
