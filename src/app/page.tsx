"use client";

import { WorkbenchRoot } from "@/modules/workbench/presentation/workbench-root";
import { ReactQueryProvider } from "@/shared/components/providers/react-query-provider";

export default function HomePage() {
  return (
    <ReactQueryProvider>
      <WorkbenchRoot />
    </ReactQueryProvider>
  );
}
