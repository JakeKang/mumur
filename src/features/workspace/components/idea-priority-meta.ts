import type { Idea } from "@/shared/types";

type IdeaPriorityInput = Pick<Idea, "commentCount" | "reactionCount" | "versionCount" | "status">;

export function ideaPriorityMeta(idea: IdeaPriorityInput) {
  const engagement = Number(idea.commentCount || 0) + Number(idea.reactionCount || 0) + Number(idea.versionCount || 0);
  if (idea.status === "harvest" || engagement >= 24) {
    return { level: "high" };
  }
  if (idea.status === "grow" || engagement >= 10) {
    return { level: "medium" };
  }
  return { level: "low" };
}
