import { Button } from "@/components/ui/button";

type BlockActionsMenuProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetCommentTarget: () => void;
};

export function BlockActionsMenu({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onSetCommentTarget
}: BlockActionsMenuProps) {
  return (
    <details className="relative ml-auto">
      <summary className="cursor-pointer list-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)]">
        블록 작업
      </summary>
      <div className="absolute right-0 z-10 mt-1 grid min-w-[140px] gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
        <Button type="button" size="sm" variant="outline" disabled={!canMoveUp} onClick={onMoveUp}>
          위로 이동
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canMoveDown} onClick={onMoveDown}>
          아래로 이동
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDuplicate}>
          복제
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSetCommentTarget}>
          코멘트 대상
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-rose-700" onClick={onDelete}>
          삭제
        </Button>
      </div>
    </details>
  );
}
