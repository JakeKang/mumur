import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  onConfirm,
  onCancel,
  danger = false
}) {
  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      maxWidthClass="max-w-md"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            className={danger ? "bg-rose-700 hover:bg-rose-800" : undefined}
          >
            {confirmText}
          </Button>
        </div>
      )}
    >
      <p className="text-sm text-[var(--muted)]">{description}</p>
    </DialogShell>
  );
}
