'use client';
import { useEffect, useRef } from 'react';

/** A native modal `<dialog>` driven by `open`. Children mount only while it's open, so each opening starts fresh. */
export function Modal({ open, onClose, label, className, children }: { open: boolean; onClose: () => void; label: string; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      // React's autoFocus fires while the dialog is still closed, so it can't take; showModal() would pick the first focusable instead.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onClose={onClose}
      // The dialog has no padding, so a click landing on the element itself is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      {open && children}
    </dialog>
  );
}
