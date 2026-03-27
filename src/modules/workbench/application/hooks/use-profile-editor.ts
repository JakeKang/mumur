import { useCallback, useState } from "react";
import * as workbenchApi from "@/modules/workbench/infrastructure/workbench-api";
import type { Session } from "@/shared/types";

type UseProfileEditorParams = {
  api: workbenchApi.WorkbenchApiClient;
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session>>;
};

export function useProfileEditor({ api, session, setSession }: UseProfileEditorParams) {
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditName, setProfileEditName] = useState("");
  const [profileEditEmail, setProfileEditEmail] = useState("");
  const [profileEditCurrentPwd, setProfileEditCurrentPwd] = useState("");
  const [profileEditNewPwd, setProfileEditNewPwd] = useState("");
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState("");

  const closeProfileEdit = useCallback(() => {
    setProfileEditOpen(false);
  }, []);

  const openProfileEdit = useCallback(() => {
    setProfileEditName(session?.user?.name || "");
    setProfileEditEmail((session?.user as { email?: string } | null)?.email || "");
    setProfileEditCurrentPwd("");
    setProfileEditNewPwd("");
    setProfileEditError("");
    setProfileEditOpen(true);
  }, [session]);

  const saveProfile = useCallback(async () => {
    setProfileEditBusy(true);
    setProfileEditError("");
    try {
      const result = await workbenchApi.patchProfile(api, {
        name: profileEditName.trim() || undefined,
        email: profileEditEmail.trim() || undefined,
        currentPassword: profileEditCurrentPwd || undefined,
        newPassword: profileEditNewPwd || undefined,
      });
      setSession((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          user: {
            ...prev.user,
            name: result.user.name,
            email: result.user.email,
          },
        };
      });
      setProfileEditOpen(false);
    } catch (err) {
      setProfileEditError(err instanceof Error ? err.message : "프로필 업데이트에 실패했습니다");
    } finally {
      setProfileEditBusy(false);
    }
  }, [api, profileEditCurrentPwd, profileEditEmail, profileEditName, profileEditNewPwd, setSession]);

  return {
    profileEditOpen,
    profileEditName,
    setProfileEditName,
    profileEditEmail,
    setProfileEditEmail,
    profileEditCurrentPwd,
    setProfileEditCurrentPwd,
    profileEditNewPwd,
    setProfileEditNewPwd,
    profileEditBusy,
    profileEditError,
    openProfileEdit,
    closeProfileEdit,
    saveProfile,
  };
}
