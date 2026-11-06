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

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-2 border-dashed px-6 py-10 text-center">
      <Icon name={icon} className="!text-[28px] text-lead" />
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
