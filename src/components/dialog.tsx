"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onClose, titleId, label, className = "", children }: {
  open: boolean; onClose: () => void; titleId: string; label: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`lab-dialog ${className}`} aria-labelledby={titleId} onCancel={onClose} onClose={onClose}>
      <button className="icon-button dialog-close" onClick={onClose} aria-label={`${label}を閉じる`} autoFocus><X size={20} /></button>
      {children}
    </dialog>
  );
}
