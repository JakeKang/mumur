import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";

export function IdeaCreateDialog({ open, onClose, busy, IDEA_STATUS, STATUS_META, newIdeaForm, setNewIdeaForm, handleCreateIdea }) {
  if (!open) {
    return null;
  }

  return (
    <DialogShell open={open} onClose={onClose} title="새 아이디어 생성" maxWidthClass="max-w-lg">
        <form
          className="grid gap-2"
          onSubmit={async (event) => {
            await handleCreateIdea(event);
            onClose();
          }}
        >
          <Input
            placeholder="제목"
            value={newIdeaForm.title}
            onChange={(event) => setNewIdeaForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
          <Input
            placeholder="카테고리"
            value={newIdeaForm.category}
            onChange={(event) => setNewIdeaForm((prev) => ({ ...prev, category: event.target.value }))}
          />
          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={newIdeaForm.status}
            onChange={(event) => setNewIdeaForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            {IDEA_STATUS.map((status) => (
              <option key={status} value={status}>
                {`${STATUS_META[status].icon} ${STATUS_META[status].label}`}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy}>
            아이디어 만들기
          </Button>
        </form>
    </DialogShell>
  );
}
