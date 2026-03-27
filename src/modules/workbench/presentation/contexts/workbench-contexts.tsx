import { createContext, useContext } from "react";
import type { Session, UserWorkspace, WorkspaceMe } from "@/shared/types";

type SelectIdeaOptions = {
  syncUrl?: boolean;
  openPage?: boolean;
  workspaceId?: number | null;
};

export type WorkbenchSessionContextValue = {
  session: Session;
  teamMe: WorkspaceMe;
  canEditIdea: boolean;
  canCreateIdea: boolean;
  activeWorkspaceId: number | null;
  userTeams: UserWorkspace[];
  formatTime: (timestamp: number) => string;
};

export type WorkbenchActionsContextValue = {
  openCreateIdea: () => void;
  selectIdea: (ideaId: number | string, options?: SelectIdeaOptions) => Promise<void>;
  handleEnterWorkspace: (workspaceId: number) => Promise<void>;
  handleSwitchTeam: (teamId: number) => Promise<void>;
};

export const WorkbenchSessionContext = createContext<WorkbenchSessionContextValue | null>(null);
export const WorkbenchActionsContext = createContext<WorkbenchActionsContextValue | null>(null);

export function useWorkbenchSessionContext(): WorkbenchSessionContextValue {
  const context = useContext(WorkbenchSessionContext);
  if (!context) {
    throw new Error("useWorkbenchSessionContext must be used within WorkbenchSessionContext.Provider");
  }
  return context;
}

export function useWorkbenchActionsContext(): WorkbenchActionsContextValue {
  const context = useContext(WorkbenchActionsContext);
  if (!context) {
    throw new Error("useWorkbenchActionsContext must be used within WorkbenchActionsContext.Provider");
  }
  return context;
}
