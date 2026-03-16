import { cn } from "@/lib/utils";
import { priorityLabel } from "@/lib/ui-labels";

const toneMap = {
  high: "border-rose-200 bg-rose-50 text-rose-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-700",
  neutral: "border-[#e8e6e3] bg-white text-[#787774]"
};

type PriorityBadgeProps = {
  level?: string;
  label?: string;
  className?: string;
};

export function PriorityBadge({ level = "neutral", label, className }: PriorityBadgeProps) {
  const tone = toneMap[level] || toneMap.neutral;
  const text = label || priorityLabel(level);
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", tone, className)}>
      {text}
    </span>
  );
}
