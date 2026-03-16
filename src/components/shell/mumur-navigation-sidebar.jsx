function profileInitial(name) {
  const value = String(name || "M").trim();
  if (!value) {
    return "M";
  }
  return value[0].toUpperCase();
}

export function MumurNavigationSidebar({
  activePage,
  onNavigate,
  collapsed,
  categories,
  userName,
  teamName
}) {
  const navItems = [
    { id: "dashboard", icon: "🏠", label: "대시보드" },
    { id: "ideas", icon: "💡", label: "아이디어 목록" },
    { id: "detail", icon: "📝", label: "아이디어 상세" },
    { id: "team", icon: "👥", label: "팀 관리" }
  ];

  const sidebarWidth = collapsed ? "w-14" : "w-60";

  return (
    <aside className={`${sidebarWidth} flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-strong)] transition-all duration-200`}>
      <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? "justify-center px-0" : ""}`}>
        <span className="text-xl">🤫</span>
        {!collapsed ? <span className="font-serif text-lg font-bold tracking-tight text-[var(--foreground)]">Mumur</span> : null}
      </div>

      <div className="flex-1 overflow-auto px-2 pb-4">
        <p className={`px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] ${collapsed ? "text-center" : ""}`}>
          {collapsed ? "..." : "워크스페이스"}
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                activePage === item.id ? "bg-[var(--surface)] font-semibold text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--surface)]"
              } ${collapsed ? "justify-center" : "justify-start"}`}
              title={item.label}
              aria-label={item.label}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {!collapsed ? <span>{item.label}</span> : null}
            </button>
          ))}
        </nav>

        {!collapsed ? (
          <>
            <p className="px-2 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">카테고리</p>
            <div className="space-y-1">
              {categories.slice(0, 6).map((category) => (
                <div key={`nav-cat-${category}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-[var(--muted)]">
                  <span className="h-2 w-2 rounded-[3px] bg-[var(--muted)]" />
                  <span className="truncate">{category}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-semibold text-[var(--surface)]">
            {profileInitial(userName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--foreground)]">{userName || "Mumur 사용자"}</p>
            <p className="truncate text-[11px] text-[var(--muted)]">{teamName || "팀"}</p>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
