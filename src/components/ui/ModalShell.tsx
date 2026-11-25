import React, { useEffect, useRef } from 'react';
import { ReceiptText, X } from 'lucide-react';

let activeModalLockCount = 0;
let savedBodyScrollY = 0;
let prevBodyStyles: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  paddingRight: string;
} | null = null;

/**
 * Locks background viewport scroll while a modal is open, and restores the exact
 * scroll offset when the last modal closes so closing a modal returns the user
 * to the exact position before they clicked to open it.
 */
export function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') return;

    if (activeModalLockCount === 0) {
      savedBodyScrollY = window.scrollY || window.pageYOffset || 0;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      prevBodyStyles = {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
      };
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedBodyScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.documentElement.dataset.modalScrollLocked = 'true';
    }
    activeModalLockCount += 1;

    return () => {
      activeModalLockCount = Math.max(0, activeModalLockCount - 1);
      if (activeModalLockCount === 0 && prevBodyStyles) {
        const restoreY = savedBodyScrollY;
        document.body.style.position = prevBodyStyles.position;
        document.body.style.top = prevBodyStyles.top;
        document.body.style.left = prevBodyStyles.left;
        document.body.style.right = prevBodyStyles.right;
        document.body.style.width = prevBodyStyles.width;
        document.body.style.overflow = prevBodyStyles.overflow;
        document.body.style.paddingRight = prevBodyStyles.paddingRight;
        delete document.documentElement.dataset.modalScrollLocked;
        prevBodyStyles = null;
        window.scrollTo({ top: restoreY, left: 0, behavior: 'instant' as ScrollBehavior });
      }
    };
  }, [open]);
}

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerId: string;
  testId?: string;
  maxWidthClass?: string;
  headerBgClass?: string;
  closeOnEscape?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Unified accessible modal wrapper:
 * - NEVER closes when clicking outside on the backdrop (closes ONLY via explicit Close / Batal buttons).
 * - Supports opt-in Escape key dismissal (`closeOnEscape={true}`) for non-transactional info/preview modals.
 * - Locks background page scroll completely; only the modal's inner body scrolls.
 * - Restores exact window.scrollY on close so the user returns to their pre-click position.
 * - Auto-focuses the modal header without causing scroll jumps.
 */
export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  headerId,
  testId,
  maxWidthClass = 'max-w-2xl',
  headerBgClass = 'bg-white',
  closeOnEscape = false,
  children,
  footer,
}: ModalShellProps) {
  const headerRef = useRef<HTMLDivElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      headerRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headerId}
      className="fixed inset-0 z-50 bg-stone-900/55 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5 overscroll-contain"
    >
      <div
        className={`bg-white border border-stone-200 rounded-xl w-full ${maxWidthClass} max-h-[90vh] flex flex-col shadow-2xl overflow-hidden`}
      >
        {/* Sticky Auto-Focused Header */}
        <div
          id={headerId}
          ref={headerRef}
          tabIndex={-1}
          className={`px-6 py-4 border-b border-stone-200 flex items-start justify-between gap-4 shrink-0 focus:outline-none ${headerBgClass}`}
        >
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900 leading-snug">{title}</h2>
            {subtitle && <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            data-testid={testId ? `${testId}-close-btn` : 'modal-close-btn'}
            className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Independently Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

export interface ReceiptPreviewData {
  imageUrl: string;
  title: string;
  receiptNumber?: string;
  supplierName?: string;
  dateLabel?: string;
  amountLabel?: string;
}

export function ReceiptPreviewModal({
  receipt,
  onClose,
}: {
  receipt: ReceiptPreviewData | null;
  onClose: () => void;
}) {
  return (
    <ModalShell
      open={Boolean(receipt)}
      onClose={onClose}
      closeOnEscape={true}
      headerId="receipt-preview-modal-header"
      testId="receipt-preview-modal"
      maxWidthClass="max-w-2xl"
      title={
        <span className="inline-flex items-center gap-2">
          <ReceiptText className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          <span>Bukti Nota Pembelian: {receipt?.title}</span>
        </span>
      }
      subtitle={
        receipt ? (
          <span>
            {receipt.receiptNumber ? `No. Nota: ${receipt.receiptNumber}` : 'Tanpa nomor nota'}
            {receipt.supplierName ? ` · Supplier: ${receipt.supplierName}` : ''}
            {receipt.dateLabel ? ` · ${receipt.dateLabel}` : ''}
            {receipt.amountLabel ? ` · ${receipt.amountLabel}` : ''}
          </span>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-stone-500">
            Arsip bukti pembelian untuk pengecekan stok &amp; lampiran pelaporan pajak DJP.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg"
          >
            Tutup Pratinjau
          </button>
        </div>
      }
    >
      {receipt && (
        <div className="p-5 bg-stone-100/70 flex items-center justify-center min-h-[260px]">
          <img
            src={receipt.imageUrl}
            alt={`Bukti pembelian ${receipt.title}`}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[60vh] object-contain rounded-xl border border-stone-200 bg-white shadow-xs"
          />
        </div>
      )}
    </ModalShell>
  );
}
