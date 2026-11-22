'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export interface NativeDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closedBy?: 'any' | 'closerequest' | 'none';
  children: React.ReactNode;
  maxWidthClass?: string;
}

/**
 * Accessible modal dialog built on the native HTML <dialog> element (showModal()).
 * Follows modern-web-guidance: no redundant role="dialog"/aria-modal/manual focus trap,
 * resets dialog.returnValue on close, and includes pointer-bounds fallback when closedby is unsupported.
 */
export function NativeDialog({
  open,
  onClose,
  title,
  description,
  closedBy = 'any',
  children,
  maxWidthClass = 'max-w-lg',
}: NativeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    const handleCancel = (e: Event) => {
      if (closedBy === 'none' && e.cancelable) {
        e.preventDefault();
      }
    };

    // Fallback light-dismiss when native closedby attribute is unsupported (e.g. Safari)
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (closedBy !== 'any' || 'closedBy' in HTMLDialogElement.prototype) return;
      pressedOutside = isOutside(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (closedBy !== 'any' || 'closedBy' in HTMLDialogElement.prototype) return;
      if (pressedOutside && isOutside(e)) dialog.close();
    };

    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [closedBy, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      {...({ closedby: closedBy } as Record<string, string>)}
      className={`spt-native-dialog w-[calc(100%-2rem)] ${maxWidthClass} m-auto rounded-2xl border border-[#E5DFD2] bg-white p-0 text-[#103D45] shadow-2xl`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#EFEAE0] px-6 py-4">
        <div>
          <h2 id={titleId} className="text-lg font-bold text-[#103D45]">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-[#52606D]">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#52606D] hover:bg-[#F7F5EF] hover:text-[#103D45]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
    </dialog>
  );
}
