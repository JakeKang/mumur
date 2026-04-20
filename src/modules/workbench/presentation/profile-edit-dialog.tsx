import { Button } from "@/shared/components/ui/button";
import { DialogShell } from "@/shared/components/ui/dialog-shell";
import { Input } from "@/shared/components/ui/input";

type ProfileEditDialogProps = {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string;
  name: string;
  onChangeName: (value: string) => void;
  email: string;
  onChangeEmail: (value: string) => void;
  currentPassword: string;
  onChangeCurrentPassword: (value: string) => void;
  newPassword: string;
  onChangeNewPassword: (value: string) => void;
  onSave: () => void;
};

export function ProfileEditDialog({
  open,
  onClose,
  busy,
  error,
  name,
  onChangeName,
  email,
  onChangeEmail,
  currentPassword,
  onChangeCurrentPassword,
  newPassword,
  onChangeNewPassword,
  onSave,
}: ProfileEditDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <DialogShell
      open
      title="회원정보 수정"
      onClose={onClose}
      maxWidthClass="max-w-sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={onSave}>
              {busy ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">이름</p>
          <Input value={name} onChange={(e) => onChangeName(e.target.value)} placeholder="이름" autoFocus />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">이메일</p>
          <Input type="email" value={email} onChange={(e) => onChangeEmail(e.target.value)} placeholder="이메일 주소" />
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs text-[var(--muted)]">이메일 또는 비밀번호를 변경하려면 현재 비밀번호를 입력하세요.</p>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">현재 비밀번호</p>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => onChangeCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호"
                autoComplete="current-password"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--foreground)]">새 비밀번호 (선택)</p>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => onChangeNewPassword(e.target.value)}
                placeholder="10자 이상, 영문자와 숫자 포함"
                minLength={10}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}
