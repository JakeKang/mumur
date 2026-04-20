export function reportClientIssue(scope: string, message: string, meta: Record<string, unknown> = {}) {
  console.warn(`[client:${scope}] ${message}`, meta);
}

export function reportServerIssue(scope: string, message: string, meta: Record<string, unknown> = {}) {
  console.error(`[server:${scope}] ${message}`, meta);
}
