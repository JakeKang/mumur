import type { ComponentProps } from "react";
import { IdeaStudioPanel } from "@/features/ideas/components/idea-studio-panel";
import { WorkspaceSurface } from "@/features/workspace/components/workspace-surface";
import { DashboardSurface, IdeasSurface, TeamSurface } from "@/features/workspace/components/workspace-pages";

type DashboardSurfaceProps = ComponentProps<typeof DashboardSurface>;
type IdeasSurfaceProps = ComponentProps<typeof IdeasSurface>;
type IdeaStudioPanelProps = ComponentProps<typeof IdeaStudioPanel>;
type TeamSurfaceProps = ComponentProps<typeof TeamSurface>;
type WorkspaceSurfaceProps = ComponentProps<typeof WorkspaceSurface>;

type DetailNotFoundState = {
  ideaId: number | string;
  message: string;
} | null;

type WorkbenchContentProps = {
  activePage: string;
  dashboardProps: DashboardSurfaceProps;
  ideasProps: IdeasSurfaceProps;
  detailProps: {
    detailNotFound: DetailNotFoundState;
    backToIdeas: () => void;
    studioPanelProps: IdeaStudioPanelProps;
  };
  teamProps: TeamSurfaceProps;
  workspaceProps: WorkspaceSurfaceProps;
};

export function WorkbenchContent({
  activePage,
  dashboardProps,
  ideasProps,
  detailProps,
  teamProps,
  workspaceProps,
}: WorkbenchContentProps) {
  return (
    <>
      {activePage === "dashboard" ? <DashboardSurface {...dashboardProps} /> : null}

      {activePage === "ideas" ? <IdeasSurface {...ideasProps} /> : null}

      {activePage === "detail" ? (
        detailProps.detailNotFound ? (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">404</p>
            <h2 className="mt-1 text-xl font-semibold">아이디어를 찾을 수 없습니다</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">요청한 아이디어 ID: {detailProps.detailNotFound.ideaId}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{detailProps.detailNotFound.message}</p>
            <button
              type="button"
              className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1.5 text-sm"
              onClick={detailProps.backToIdeas}
            >
              목록으로 이동
            </button>
          </section>
        ) : (
          <IdeaStudioPanel {...detailProps.studioPanelProps} />
        )
      ) : null}

      {activePage === "team" ? <TeamSurface {...teamProps} /> : null}

      {activePage === "workspace" ? <WorkspaceSurface {...workspaceProps} /> : null}
    </>
  );
}
