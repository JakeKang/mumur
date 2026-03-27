import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";

type DrawerShellProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
};

export function DrawerShell({
  open,
  title,
  description,
  onClose,
  children,
  widthClass = "max-w-2xl"
}: DrawerShellProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
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
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-slate-950/40"
        onClick={onClose}
        aria-label="서랍 닫기"
      />
      <aside className={`absolute right-0 top-0 h-full w-full ${widthClass} overflow-auto border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl transition-transform duration-200`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <div>
            <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
            {description ? <p className="mt-1 text-xs text-[var(--muted)]">{description}</p> : null}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </aside>
    </div>
  );
}
