import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function DialogShell({
  open,
  title,
  description,
  onClose,
  children,
  maxWidthClass = "max-w-xl",
  footer
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-slate-950/40"
        onClick={onClose}
        aria-label="닫기"
      />
      <div className={`relative w-full ${maxWidthClass} rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
            {description ? <p className="mt-1 text-xs text-[var(--muted)]">{description}</p> : null}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-4 py-4">{children}</div>
        {footer ? <div className="border-t border-[var(--border)] px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
