import { useEffect, useState, useRef, type ReactNode } from "react";
import { handleFocusTrap, FOCUSABLE_SELECTOR } from "../lib/focus";

export function Icon({ name, className = "", fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined ${className}`}
      style={fill ? { fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 20' } : undefined}
    >
      {name}
    </span>
  );
}

export function Pip({ tone = "ok", pulse = false }: { tone?: "ok" | "cobalt" | "err" | "lead" | "warn"; pulse?: boolean }) {
  const c = { ok: "bg-ok", cobalt: "bg-cobalt", err: "bg-err", lead: "bg-lead", warn: "bg-warn" }[tone];
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={`absolute inset-0 animate-ping rounded-full ${c} opacity-50`} />}
      <span className={`relative inline-flex size-2 rounded-full ${c}`} />
    </span>
  );
}

export function CopyButton({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn-secondary px-2 py-1 text-xs ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      <Icon name={done ? "check" : "content_copy"} className="!text-[16px]" />
      {done ? "Copied" : label}
    </button>
  );
}

/** Bottom sheet on mobile, centered dialog on ≥md. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Capture the trigger element before opening
    triggerRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (dialogRef.current) {
        handleFocusTrap({
          container: dialogRef.current,
          event: e,
          activeElement: document.activeElement,
        });
      }
    };

    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus into dialog on open
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Restore focus to trigger element on close
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        className={`floating relative max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-paper md:rounded-lg ${
          wide ? "md:max-w-3xl" : "md:max-w-lg"
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" />
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line-faint bg-paper px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="mb-1 flex flex-wrap gap-1.5">{eyebrow}</div>}
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
          </div>
          <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-lead">{hint}</span>}
    </label>
  );
}

export function KV({ k, v, mono = true }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="label shrink-0">{k}</span>
      <span className={`min-w-0 truncate text-right text-sm text-ink-2 ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

/** Architectural drafting blueprint illustration for continuous token streams */
function StreamsDraftingIllustration() {
  return (
    <svg width="128" height="76" viewBox="0 0 128 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-lead" aria-hidden="true">
      {/* Corner Crosshairs */}
      <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 8V16M112 12H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 60V68M8 64H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 60V68M112 64H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

      {/* Blueprint Outer Frame with Hairline Grid */}
      <rect x="16" y="12" width="96" height="52" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />

      {/* Axis Guide Lines */}
      <line x1="22" y1="38" x2="106" y2="38" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.25" />
      <line x1="64" y1="16" x2="64" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.2" />

      {/* Linear Accrual Stream Pipeline Waveform */}
      <path
        d="M22 38H40L48 24L56 50L64 32L72 42L80 38H106"
        stroke="#0969DA"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Terminal Metering Nodes */}
      <circle cx="22" cy="38" r="3" fill="var(--color-paper, #ffffff)" stroke="#0969DA" strokeWidth="1.5" />
      <circle cx="106" cy="38" r="3" fill="#0969DA" />

      {/* Dimensional Metric Tick Marks */}
      <path d="M40 16V20M64 15V21M88 16V20" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <path d="M28 58H100" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <path d="M28 56V60M100 56V60" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

/** Architectural drafting blueprint illustration for recursive dependency split cascades */
function CascadesDraftingIllustration() {
  return (
    <svg width="128" height="76" viewBox="0 0 128 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-lead" aria-hidden="true">
      {/* Corner Crosshairs */}
      <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 8V16M112 12H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 60V68M8 64H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 60V68M112 64H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

      {/* Blueprint Outer Frame */}
      <rect x="16" y="12" width="96" height="52" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />

      {/* Root Node Box */}
      <rect x="22" y="28" width="22" height="20" rx="2" stroke="#0969DA" strokeWidth="1.5" fill="var(--color-paper, #ffffff)" />
      <path d="M33 34V42M29 38H37" stroke="#0969DA" strokeWidth="1" strokeLinecap="round" />

      {/* Orthogonal Split Branching Vectors */}
      <path d="M44 38H62" stroke="#0969DA" strokeWidth="1.2" />
      <path d="M62 22V54" stroke="#0969DA" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M62 22H78" stroke="#0969DA" strokeWidth="1.2" />
      <path d="M62 54H78" stroke="#0969DA" strokeWidth="1.2" />

      {/* Junction Dots */}
      <circle cx="62" cy="38" r="2.5" fill="#0969DA" />

      {/* Tier 1 Dependency Blocks */}
      <rect x="78" y="14" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1" fill="var(--color-paper, #ffffff)" />
      <rect x="78" y="46" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1" fill="var(--color-paper, #ffffff)" />

      {/* Tier 2 Cascade Hop */}
      <path d="M98 22H108" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      <circle cx="108" cy="22" r="2" fill="currentColor" opacity="0.6" />

      {/* Dimension & Weight Ratio Ticks */}
      <path d="M70 19L74 22L70 25" stroke="#0969DA" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 51L74 54L70 57" stroke="#0969DA" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Architectural drafting blueprint illustration for RFC-8785 cryptographic audit receipts */
function ReceiptsDraftingIllustration() {
  return (
    <svg width="128" height="76" viewBox="0 0 128 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-lead" aria-hidden="true">
      {/* Corner Crosshairs */}
      <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 8V16M112 12H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 60V68M8 64H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 60V68M112 64H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

      {/* Blueprint Outer Frame */}
      <rect x="16" y="12" width="96" height="52" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />

      {/* Cryptographic Ledger Ticket Outline */}
      <rect x="28" y="18" width="72" height="40" rx="3" stroke="currentColor" strokeWidth="1.2" fill="var(--color-paper, #ffffff)" />

      {/* Hairline Digest Barcode Vector */}
      <path d="M36 26V34M40 26V34M42 26V34M46 26V34M50 26V34M52 26V34M56 26V34" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />

      {/* Ledger Canonical Hash Rows */}
      <line x1="36" y1="42" x2="64" y2="42" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
      <line x1="36" y1="48" x2="58" y2="48" stroke="currentColor" strokeWidth="1" opacity="0.3" />

      {/* Verification Seal Target (Concentric Hairline Rings with Crosshair Axis) */}
      <circle cx="82" cy="38" r="10" stroke="#0969DA" strokeWidth="1.2" strokeDasharray="3 1.5" />
      <circle cx="82" cy="38" r="5" stroke="#0969DA" strokeWidth="1" />
      <circle cx="82" cy="38" r="1.5" fill="#0969DA" />
      <path d="M82 25V29M82 47V51M69 38H73M91 38H95" stroke="#0969DA" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** General blueprint drafting drawing for other states */
function DefaultDraftingIllustration() {
  return (
    <svg width="128" height="76" viewBox="0 0 128 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-lead" aria-hidden="true">
      {/* Corner Crosshairs */}
      <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 8V16M112 12H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 60V68M8 64H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M116 60V68M112 64H120" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />

      {/* Blueprint Schematic Grid */}
      <rect x="20" y="16" width="88" height="44" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
      <line x1="20" y1="38" x2="108" y2="38" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.25" />
      <line x1="64" y1="16" x2="64" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.25" />
      <circle cx="64" cy="38" r="6" stroke="#0969DA" strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M64 34V42M60 38H68" stroke="#0969DA" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export type EmptyIllustrationVariant = "streams" | "cascades" | "receipts" | "default";

export function Empty({
  icon,
  title,
  variant,
  children,
}: {
  icon?: string;
  title: string;
  variant?: EmptyIllustrationVariant;
  children?: ReactNode;
}) {
  const resolvedVariant: EmptyIllustrationVariant =
    variant ??
    (icon === "water_drop"
      ? "streams"
      : icon === "account_tree"
      ? "cascades"
      : icon === "receipt_long" || icon === "receipt" || icon === "account_balance_wallet"
      ? "receipts"
      : "default");

  return (
    <div className="panel flex flex-col items-center gap-3 border-dashed px-6 py-10 text-center">
      <div className="flex items-center justify-center">
        {resolvedVariant === "streams" && <StreamsDraftingIllustration />}
        {resolvedVariant === "cascades" && <CascadesDraftingIllustration />}
        {resolvedVariant === "receipts" && <ReceiptsDraftingIllustration />}
        {resolvedVariant === "default" && <DefaultDraftingIllustration />}
      </div>
      <div className="font-display text-base font-semibold text-ink">{title}</div>
      {children && <div className="max-w-sm text-sm text-lead">{children}</div>}
    </div>
  );
}

export function SectionTitle({ icon, children, aside }: { icon: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-ink">
        <Icon name={icon} className="text-cobalt" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
