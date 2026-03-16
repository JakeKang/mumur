import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type LabelProps = HTMLAttributes<HTMLSpanElement>;

export function Label({ className, ...props }: LabelProps) {
  return <span className={cn("text-sm font-medium text-slate-900", className)} {...props} />;
}
