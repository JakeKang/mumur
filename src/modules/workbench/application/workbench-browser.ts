export function clearIdeaQueryParam() {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.delete("idea");
  const query = params.toString();
  window.history.pushState(null, "", query ? `?${query}` : "/");
}

export function replaceIdeaQueryParam(ideaId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.set("idea", ideaId);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

export function resetWorkbenchUrl() {
  if (typeof window === "undefined") {
    return;
  }
  window.history.replaceState(null, "", "/");
}

export function focusWorkbenchTitleInput() {
  if (typeof window === "undefined") {
    return () => {};
  }
  const raf = window.requestAnimationFrame(() => {
    const titleInput = document.querySelector("main textarea") as HTMLTextAreaElement | null;
    titleInput?.focus();
  });
  return () => window.cancelAnimationFrame(raf);
}
