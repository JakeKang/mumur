import { cn } from "@/shared/utils/utils";
import type { HTMLAttributes } from "react";

type DivProps = HTMLAttributes<HTMLDivElement>;
type HeadingProps = HTMLAttributes<HTMLHeadingElement>;

export function Card({ className, ...props }: DivProps) {
  return <div className={cn("rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HeadingProps) {
  return <h3 className={cn("text-lg font-semibold text-[var(--foreground)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
