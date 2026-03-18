"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGateway } from "@/components/shell/auth-gateway";
import { ContextPanel } from "@/components/shell/context-panel";
import { IdeaCreateDialog } from "@/components/shell/idea-create-dialog";
import { IdeaStudioPanel } from "@/components/shell/idea-studio-panel";
import { MumurNavigationSidebar } from "@/components/shell/mumur-navigation-sidebar";
import { DashboardSurface, IdeasSurface, TeamSurface } from "@/components/shell/workspace-pages";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GROWTH_PRESET_STATUSES, IDEA_STATUS, STATUS_META } from "@/lib/idea-status";
import { streamStatusLabel } from "@/lib/ui-labels";

const THREAD_STATUS = ["active", "resolved", "on_hold"];
const BLOCK_TYPES = ["heading", "text", "quote", "checklist", "table", "image", "embed", "code", "divider"];
const DEFAULT_VOTES = {
  binary: { approve: 0, reject: 0, total: 0 },
  score: { average: 0, total: 0, distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: 0 })) },
  mine: { binary: null, score: null }
};
const NOTIFICATION_TYPES = [
  "mention.created",
  "comment.created",
  "thread.created",
  "thread.comment.created",
  "vote.created",
  "version.created",
  "integration.webhook.updated"
];

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    ...options
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || "요청 처리에 실패했습니다");
  }
  return json;
}

function blockSeed(type = "text") {
  return {
    id: `block-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    type,
    content: "",
    checked: false
  };
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export default function HomePage() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [createIdeaDialogOpen, setCreateIdeaDialogOpen] = useState(false);

  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [loginForm, setLoginForm] = useState({ email: "localtester@mumur.local", password: "mumur1234!" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", teamName: "" });

  const [filters, setFilters] = useState({ status: "", query: "", category: "" });
  const [ideaView, setIdeaView] = useState("card");
  const [navigatorSort, setNavigatorSort] = useState("recent");
  const [navigatorPreset, setNavigatorPreset] = useState("all");
  const [studioTab, setStudioTab] = useState("editor");
  const [newIdeaForm, setNewIdeaForm] = useState<{ title: string; category: string; status: import("@/types").IdeaStatus }>({ title: "", category: "", status: "seed" });
  const [ideas, setIdeas] = useState([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBlockId, setCommentBlockId] = useState("");
  const [commentFilterBlockId, setCommentFilterBlockId] = useState("");

  const [reactions, setReactions] = useState({ reactions: [], mine: [] });
  const [votes, setVotes] = useState(DEFAULT_VOTES);

  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadForm, setThreadForm] = useState({ title: "", description: "", status: "active" });
  const [threadEdit, setThreadEdit] = useState({ title: "", description: "", status: "active", conclusion: "" });
  const [threadComments, setThreadComments] = useState([]);
  const [threadCommentDraft, setThreadCommentDraft] = useState("");

  const [versions, setVersions] = useState([]);
  const [versionForm, setVersionForm] = useState({ versionLabel: "", notes: "" });
  const [versionFile, setVersionFile] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [streamStatus, setStreamStatus] = useState("offline");
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [utilitySection, setUtilitySection] = useState("notifications");
  const [notificationFilters, setNotificationFilters] = useState({
    eventType: "",
    unreadOnly: false,
    excludeMuted: true,
    mentionsOnly: false
  });
  const [mutedTypes, setMutedTypes] = useState([]);

  const [webhooks, setWebhooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [teamMemberForm, setTeamMemberForm] = useState({ email: "", role: "member" });
  const [teamMe, setTeamMe] = useState({ userId: null, isOwner: false });
  const [teamInvitations, setTeamInvitations] = useState([]);
  const [teamInvitationMessage, setTeamInvitationMessage] = useState("");
  const [webhookForm, setWebhookForm] = useState({ platform: "slack", webhookUrl: "", enabled: false });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    confirmText: "확인",
    danger: false,
    action: null
  });

  const streamRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectTryRef = useRef(0);
  const bootstrapRef = useRef(null);
  const utilityTriggerRef = useRef(null);

  const authed = useMemo(() => Boolean(session?.user), [session]);
  const selectedThread = useMemo(() => threads.find((item) => item.id === selectedThreadId) || null, [threads, selectedThreadId]);

  const sortedIdeas = useMemo(() => {
    const next = [...ideas];
    if (navigatorSort === "comments") {
      next.sort((a, b) => Number(b.commentCount || 0) - Number(a.commentCount || 0));
    } else if (navigatorSort === "reactions") {
      next.sort((a, b) => Number(b.reactionCount || 0) - Number(a.reactionCount || 0));
    } else if (navigatorSort === "versions") {
      next.sort((a, b) => Number(b.versionCount || 0) - Number(a.versionCount || 0));
    } else if (navigatorSort === "title") {
      next.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    } else {
      next.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    }
    return next;
  }, [ideas, navigatorSort]);

  const presetIdeas = useMemo(() => {
    if (navigatorPreset === "updatedToday") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return sortedIdeas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime());
    }
    if (navigatorPreset === "discussion") {
      return sortedIdeas.filter((idea) => Number(idea.commentCount || 0) > 0 || Number(idea.threadCount || 0) > 0);
    }
    if (navigatorPreset === "growth") {
      return sortedIdeas.filter((idea) => GROWTH_PRESET_STATUSES.includes(idea.status));
    }
    return sortedIdeas;
  }, [navigatorPreset, sortedIdeas]);

  const presetCounts = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return {
      all: sortedIdeas.length,
      updatedToday: sortedIdeas.filter((idea) => Number(idea.updatedAt || 0) >= start.getTime()).length,
      discussion: sortedIdeas.filter((idea) => Number(idea.commentCount || 0) > 0 || Number(idea.threadCount || 0) > 0).length,
      growth: sortedIdeas.filter((idea) => GROWTH_PRESET_STATUSES.includes(idea.status)).length
    };
  }, [sortedIdeas]);

  const categoryOptions = useMemo(() => {
    const ranked = ["product", "tech", "growth", "ops", "qa"];
    const dynamic = [...new Set(ideas.map((idea) => String(idea.category || "").trim()).filter(Boolean))];
    return [...new Set([...ranked, ...dynamic])];
  }, [ideas]);

  const sideIdeas = useMemo(() => {
    return presetIdeas.filter((idea) => {
      if (filters.status && idea.status !== filters.status) {
        return false;
      }
      if (filters.category && idea.category !== filters.category) {
        return false;
      }
      if (filters.query) {
        const query = String(filters.query).toLowerCase();
        return String(idea.title || "").toLowerCase().includes(query) || String(idea.category || "").toLowerCase().includes(query);
      }
      return true;
    });
  }, [presetIdeas, filters]);

  const syncThreadEditor = useCallback(
    (thread) => {
      if (!thread) {
        setThreadEdit({ title: "", description: "", status: "active", conclusion: "" });
        return;
      }
      setThreadEdit({
        title: thread.title || "",
        description: thread.description || "",
        status: thread.status || "active",
        conclusion: thread.conclusion || ""
      });
    },
    []
  );

  const disconnectStream = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    reconnectTryRef.current = 0;
    setStreamStatus("offline");
  }, []);

  const pushNotification = useCallback((notification) => {
    setNotifications((prev) => {
      if (prev.some((item) => item.id === notification.id)) {
        return prev;
      }
      return [notification, ...prev].slice(0, 50);
    });
    if (!notification.read) {
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const connectStream = useCallback(() => {
    disconnectStream();
    if (!authed) {
      return;
    }

    const open = () => {
      if (!authed) {
        return;
      }

      const source = new EventSource("/api/notifications/stream");
      streamRef.current = source;

      source.addEventListener("connected", () => {
        reconnectTryRef.current = 0;
        setStreamStatus("online");
      });

      source.addEventListener("notification", (event) => {
        const payload = JSON.parse(event.data);
        pushNotification(payload);
      });

      source.onerror = () => {
        setStreamStatus("offline");
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
        if (!authed) {
          return;
        }
        const delay = Math.min(30000, 1000 * 2 ** reconnectTryRef.current);
        reconnectTryRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          open();
        }, delay);
      };
    };

    open();
  }, [authed, disconnectStream, pushNotification]);

  const loadDashboard = useCallback(async () => {
    const data = await api("/api/dashboard/summary");
    setDashboard(data);
  }, []);

  const loadNotifications = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (notificationFilters.eventType) {
      params.set("eventType", notificationFilters.eventType);
    }
    if (notificationFilters.unreadOnly) {
      params.set("unreadOnly", "true");
    }
    if (notificationFilters.excludeMuted) {
      params.set("excludeMuted", "true");
    }
    if (notificationFilters.mentionsOnly) {
      params.set("mentionsOnly", "true");
    }
    const data = await api(`/api/notifications?${params.toString()}`);
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  }, [notificationFilters]);

  const loadNotificationPreferences = useCallback(async () => {
    const data = await api("/api/notifications/preferences");
    setMutedTypes(data.mutedTypes || []);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const [webhookRes, deliveryRes] = await Promise.all([
      api("/api/integrations/webhooks"),
      api("/api/integrations/webhooks/deliveries")
    ]);
    setWebhooks(webhookRes.webhooks || []);
    setDeliveries(deliveryRes.deliveries || []);
  }, []);

  const loadTeamMembers = useCallback(async () => {
    const data = await api("/api/workspace/members");
    setTeamMembers(data.members || []);
    setTeamMe(data.me || { userId: null, isOwner: false });
  }, []);

  const loadUserTeams = useCallback(async () => {
    const data = await api("/api/workspaces");
    setUserTeams(data.workspaces || []);
  }, []);

  const loadTeamInvitations = useCallback(async () => {
    const data = await api("/api/workspace/invitations");
    setTeamInvitations(data.invitations || []);
  }, []);

  const addTeamMember = useCallback(async (event) => {
    event.preventDefault();
    const payload = {
      email: teamMemberForm.email,
      role: teamMemberForm.role
    };
    const data = await api("/api/workspace/invitations", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setTeamInvitationMessage(data.invitation?.message || "초대 처리 완료");
    setTeamMemberForm({ email: "", role: "member" });
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [loadTeamInvitations, loadTeamMembers, teamMemberForm]);

  const updateTeamMemberRole = useCallback(async (userId, role) => {
    await api(`/api/workspace/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role })
    });
    await loadTeamMembers();
  }, [loadTeamMembers]);

  const removeTeamMember = useCallback(async (userId) => {
    await api(`/api/workspace/members/${userId}`, { method: "DELETE" });
    await loadTeamMembers();
  }, [loadTeamMembers]);

  const retryTeamInvitation = useCallback(async (invitationId) => {
    const data = await api(`/api/workspace/invitations/${invitationId}/retry`, { method: "POST" });
    setTeamInvitationMessage(data.invitation?.message || "재시도 완료");
    await Promise.all([loadTeamMembers(), loadTeamInvitations()]);
  }, [loadTeamInvitations, loadTeamMembers]);

  const cancelTeamInvitation = useCallback(async (invitationId) => {
    await api(`/api/workspace/invitations/${invitationId}`, { method: "DELETE" });
    await loadTeamInvitations();
  }, [loadTeamInvitations]);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, open: false, action: null }));
  }, []);

  const confirmDialogAction = useCallback(async () => {
    const action = confirmDialog.action;
    closeConfirmDialog();
    if (!action) {
      return;
    }
    try {
      await action();
    } catch (err) {
      setError(err.message || "요청 처리에 실패했습니다");
    }
  }, [closeConfirmDialog, confirmDialog.action]);

  const requestRemoveTeamMember = useCallback(
    (member) => {
      setConfirmDialog({
        open: true,
        title: "멤버를 제거할까요?",
        description: `${member.name || "멤버"} (${member.email || "-"})를 팀에서 제거합니다.`,
        confirmText: "제거",
        danger: true,
        action: async () => removeTeamMember(member.userId)
      });
    },
    [removeTeamMember]
  );

  const requestCancelInvitation = useCallback(
    (invite) => {
      setConfirmDialog({
        open: true,
        title: "초대를 취소할까요?",
        description: `${invite.email || "해당 사용자"}에게 보낸 초대를 취소합니다.`,
        confirmText: "취소하기",
        danger: true,
        action: async () => cancelTeamInvitation(invite.id)
      });
    },
    [cancelTeamInvitation]
  );

  const loadIdeas = useCallback(async (nextFilters = filters) => {
    const params = new URLSearchParams();
    if (nextFilters.status) {
      params.set("status", nextFilters.status);
    }
    if (nextFilters.category) {
      params.set("category", nextFilters.category);
    }
    if (nextFilters.query) {
      params.set("query", nextFilters.query);
    }

    const data = await api(`/api/ideas?${params.toString()}`);
    setIdeas(data.ideas || []);
    return data.ideas || [];
  }, [filters]);

  const applyQuickStatusFilter = useCallback(
    async (status) => {
      const nextStatus = filters.status === status ? "" : status;
      const nextFilters = { ...filters, status: nextStatus };
      setFilters(nextFilters);
      await loadIdeas(nextFilters);
    },
    [filters, loadIdeas]
  );

  const loadIdeaChildren = useCallback(
    async (ideaId) => {
      const commentsQuery = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";

      const [commentRes, reactionRes, versionRes, timelineRes, threadRes, voteRes] = await Promise.all([
        api(`/api/ideas/${ideaId}/comments${commentsQuery}`),
        api(`/api/ideas/${ideaId}/reactions`),
        api(`/api/ideas/${ideaId}/versions`),
        api(`/api/ideas/${ideaId}/timeline`),
        api(`/api/ideas/${ideaId}/threads`),
        api(`/api/ideas/${ideaId}/votes`)
      ]);

      setComments(commentRes.comments || []);
      setReactions(reactionRes || { reactions: [], mine: [] });
      setVersions(versionRes.versions || []);
      setTimeline(timelineRes.timeline || []);
      const nextThreads = threadRes.threads || [];
      setThreads(nextThreads);
      setVotes(voteRes.votes || DEFAULT_VOTES);

      if (nextThreads.length) {
        const nextId = nextThreads.some((item) => item.id === selectedThreadId) ? selectedThreadId : nextThreads[0].id;
        setSelectedThreadId(nextId);
        const detail = nextThreads.find((item) => item.id === nextId) || null;
        syncThreadEditor(detail);
        const threadCommentRes = await api(`/api/ideas/${ideaId}/threads/${nextId}/comments`);
        setThreadComments(threadCommentRes.comments || []);
      } else {
        setSelectedThreadId(null);
        setThreadComments([]);
        syncThreadEditor(null);
      }
    },
    [commentFilterBlockId, selectedThreadId, syncThreadEditor]
  );

  const selectIdea = useCallback(
    async (ideaId, options: { syncUrl?: boolean; openPage?: boolean } = { syncUrl: true, openPage: true }) => {
      const data = await api(`/api/ideas/${ideaId}`);
      setSelectedIdeaId(ideaId);
      setSelectedIdea(data.idea);
      setStudioTab("editor");
      setCreateIdeaDialogOpen(false);
      if (options.openPage !== false) {
        setActivePage("detail");
      }
      await loadIdeaChildren(ideaId);
      if (options.syncUrl !== false && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("idea", String(ideaId));
        window.history.replaceState(null, "", `?${params.toString()}`);
      }
    },
    [loadIdeaChildren]
  );

  const bootstrap = useCallback(async () => {
    try {
      const me = await api("/api/auth/me");
      setSession(me);

      await Promise.all([
        loadDashboard(),
        loadNotifications(),
        loadNotificationPreferences(),
        loadWebhooks(),
        loadUserTeams(),
        loadTeamMembers(),
        loadTeamInvitations()
      ]);
      const loadedIdeas = await loadIdeas();
      if (loadedIdeas.length) {
        const requestedIdea = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("idea") : null;
        const requestedExists = requestedIdea && loadedIdeas.some((item) => String(item.id) === String(requestedIdea));
        const nextIdeaId = requestedExists ? requestedIdea : loadedIdeas[0].id;
        await selectIdea(nextIdeaId, { syncUrl: !requestedExists, openPage: Boolean(requestedExists) });
      } else {
        setSelectedIdeaId(null);
        setSelectedIdea(null);
        setComments([]);
        setThreads([]);
        setThreadComments([]);
        setVersions([]);
        setTimeline([]);
      }
      setError("");
    } catch (err) {
      setSession(null);
      setIdeas([]);
      setSelectedIdea(null);
      setSelectedIdeaId(null);
      setError(err.message || "로그인이 필요합니다");
      disconnectStream();
    }
  }, [
    disconnectStream,
    loadDashboard,
    loadIdeas,
    loadNotificationPreferences,
    loadNotifications,
    loadUserTeams,
    loadTeamMembers,
    loadTeamInvitations,
    loadWebhooks,
    selectIdea
  ]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    if (bootstrapRef.current) {
      bootstrapRef.current();
    }
    return () => {
      disconnectStream();
    };
  }, [disconnectStream]);

  useEffect(() => {
    if (authed) {
      connectStream();
    } else {
      disconnectStream();
    }
  }, [authed, connectStream, disconnectStream]);

  useEffect(() => {
    const syncFromUrl = () => {
      if (!authed || !ideas.length || typeof window === "undefined") {
        return;
      }
      const requestedIdea = new URLSearchParams(window.location.search).get("idea");
      if (!requestedIdea) {
        if (selectedIdeaId !== null) {
          setSelectedIdeaId(null);
          setSelectedIdea(null);
        }
        return;
      }
      if (String(selectedIdeaId) === String(requestedIdea)) {
        return;
      }
      const exists = ideas.some((item) => String(item.id) === String(requestedIdea));
      if (!exists) {
        return;
      }
      selectIdea(requestedIdea, { syncUrl: false });
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [authed, ideas, selectIdea, selectedIdeaId]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(registerForm)
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "회원가입에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setSession(null);
      setIdeas([]);
      setSelectedIdea(null);
      setSelectedIdeaId(null);
      setCreateIdeaDialogOpen(false);
      setTeamMembers([]);
      setUserTeams([]);
      setTeamMe({ userId: null, isOwner: false });
      setTeamInvitations([]);
      setTeamInvitationMessage("");
      setNotifications([]);
      setUnreadCount(0);
      setActivePage("dashboard");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/");
      }
      disconnectStream();
    } catch (err) {
      setError(err.message || "로그아웃에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIdea = async (event) => {
    event.preventDefault();
    if (!newIdeaForm.title.trim()) {
      return;
    }
    setBusy(true);
    try {
      const created = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          ...newIdeaForm,
          blocks: [blockSeed()]
        })
      });
      setNewIdeaForm({ title: "", category: "", status: "seed" });
      await loadIdeas();
      await selectIdea(created.idea.id);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "아이디어 생성에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const updateSelectedIdeaField = (field, value) => {
    setSelectedIdea((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateBlock = (index, patch) => {
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      const blocks = [...(prev.blocks || [])];
      blocks[index] = { ...blocks[index], ...patch };
      return { ...prev, blocks };
    });
  };

  const addBlock = (type = "text") => {
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, blocks: [...(prev.blocks || []), blockSeed(type)] };
    });
  };

  const applySlashCommand = (index, rawContent) => {
    if (typeof rawContent !== "string") {
      return;
    }
    const normalized = rawContent.trimStart();
    if (!normalized.startsWith("/")) {
      return;
    }
    const [command, ...rest] = normalized.slice(1).trim().split(/\s+/);
    if (!command || !BLOCK_TYPES.includes(command)) {
      return;
    }
    const nextContent = rest.join(" ").trim();
    updateBlock(index, { type: command, content: nextContent });
  };

  const removeBlock = (index) => {
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      const blocks = [...(prev.blocks || [])];
      const removed = blocks.splice(index, 1)[0];
      if (removed && commentBlockId === removed.id) {
        setCommentBlockId("");
      }
      return { ...prev, blocks };
    });
  };

  const moveBlockUp = (index) => {
    if (index <= 0) {
      return;
    }
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      const blocks = [...(prev.blocks || [])];
      [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
      return { ...prev, blocks };
    });
  };

  const moveBlockDown = (index) => {
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      const blocks = [...(prev.blocks || [])];
      if (index < 0 || index >= blocks.length - 1) {
        return prev;
      }
      [blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]];
      return { ...prev, blocks };
    });
  };

  const duplicateBlock = (index) => {
    setSelectedIdea((prev) => {
      if (!prev) {
        return prev;
      }
      const blocks = [...(prev.blocks || [])];
      const target = blocks[index];
      if (!target) {
        return prev;
      }
      const duplicated = {
        ...target,
        id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      };
      blocks.splice(index + 1, 0, duplicated);
      return { ...prev, blocks };
    });
  };

  const handleSaveIdea = async (event) => {
    event.preventDefault();
    if (!selectedIdea) {
      return;
    }
    setBusy(true);
    try {
      const updated = await api(`/api/ideas/${selectedIdea.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: selectedIdea.title,
          category: selectedIdea.category,
          status: selectedIdea.status,
          blocks: selectedIdea.blocks || []
        })
      });
      setSelectedIdea(updated.idea);
      await loadIdeas();
      await loadIdeaChildren(updated.idea.id);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "아이디어 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedIdea) {
      return;
    }
    setBusy(true);
    try {
      const data = await api(`/api/ideas/${selectedIdea.id}/summary`, { method: "POST" });
      setSelectedIdea((prev) => (prev ? { ...prev, aiSummary: data.aiSummary } : prev));
      await loadTimelineAndIdeas();
      await loadDashboard();
    } catch (err) {
      setError(err.message || "요약 생성에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const loadTimelineAndIdeas = async () => {
    if (!selectedIdeaId) {
      return;
    }
    const [timelineRes] = await Promise.all([api(`/api/ideas/${selectedIdeaId}/timeline`), loadIdeas()]);
    setTimeline(timelineRes.timeline || []);
  };

  const handleCreateComment = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId || !commentDraft.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentDraft, blockId: commentBlockId || "" })
      });
      setCommentDraft("");
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "댓글 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const applyCommentFilter = async () => {
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const query = commentFilterBlockId ? `?blockId=${encodeURIComponent(commentFilterBlockId)}` : "";
      const res = await api(`/api/ideas/${selectedIdeaId}/comments${query}`);
      setComments(res.comments || []);
    } catch (err) {
      setError(err.message || "댓글 불러오기에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleReaction = async (emoji) => {
    if (!selectedIdeaId) {
      return;
    }
    try {
      await api(`/api/ideas/${selectedIdeaId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji })
      });
      const data = await api(`/api/ideas/${selectedIdeaId}/reactions`);
      setReactions(data);
      await loadIdeas();
    } catch (err) {
      setError(err.message || "리액션 처리에 실패했습니다");
    }
  };

  const handleVote = async (voteType, value) => {
    if (!selectedIdeaId) {
      return;
    }
    try {
      const data = await api(`/api/ideas/${selectedIdeaId}/votes`, {
        method: "POST",
        body: JSON.stringify({ voteType, value })
      });
      setVotes(data.votes);
      await loadIdeas();
    } catch (err) {
      setError(err.message || "투표 처리에 실패했습니다");
    }
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId || !threadForm.title.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/threads`, {
        method: "POST",
        body: JSON.stringify(threadForm)
      });
      setThreadForm({ title: "", description: "", status: "active" });
      await loadIdeaChildren(selectedIdeaId);
    } catch (err) {
      setError(err.message || "스레드 생성에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateThread = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId || !selectedThreadId) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/threads/${selectedThreadId}`, {
        method: "PUT",
        body: JSON.stringify(threadEdit)
      });
      await loadIdeaChildren(selectedIdeaId);
    } catch (err) {
      setError(err.message || "스레드 수정에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleAddThreadComment = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId || !selectedThreadId || !threadCommentDraft.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/ideas/${selectedIdeaId}/threads/${selectedThreadId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: threadCommentDraft })
      });
      setThreadCommentDraft("");
      const res = await api(`/api/ideas/${selectedIdeaId}/threads/${selectedThreadId}/comments`);
      setThreadComments(res.comments || []);
      await loadIdeaChildren(selectedIdeaId);
    } catch (err) {
      setError(err.message || "스레드 댓글 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVersion = async (event) => {
    event.preventDefault();
    if (!selectedIdeaId) {
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("versionLabel", versionForm.versionLabel);
      form.append("notes", versionForm.notes);
      if (versionFile) {
        form.append("file", versionFile);
      }
      await api(`/api/ideas/${selectedIdeaId}/versions`, { method: "POST", body: form });
      setVersionForm({ versionLabel: "", notes: "" });
      setVersionFile(null);
      await loadIdeaChildren(selectedIdeaId);
      await loadDashboard();
    } catch (err) {
      setError(err.message || "버전 등록에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const markNotificationRead = async (notificationId) => {
    await api(`/api/notifications/${notificationId}/read`, { method: "POST" });
    setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllNotificationsRead = async () => {
    await api("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
  };

  const saveMutedTypes = async () => {
    const res = await api("/api/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({ mutedTypes })
    });
    setMutedTypes(res.mutedTypes || []);
    await loadNotifications();
  };

  const toggleMutedType = (value) => {
    setMutedTypes((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const handleSaveWebhook = async (event) => {
    event.preventDefault();
    if (!webhookForm.webhookUrl.trim()) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/integrations/webhooks/${webhookForm.platform}`, {
        method: "PUT",
        body: JSON.stringify(webhookForm)
      });
      await loadWebhooks();
      await loadNotifications();
    } catch (err) {
      setError(err.message || "웹훅 저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    await bootstrap();
  };

  const handleSwitchTeam = async (teamId) => {
    if (!teamId || Number(teamId) === Number(session?.workspace?.id)) {
      return;
    }
    setBusy(true);
    try {
      await api("/api/workspaces/switch", {
        method: "POST",
        body: JSON.stringify({ teamId })
      });
      await bootstrap();
    } catch (err) {
      setError(err.message || "팀 전환에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const backToIdeas = () => {
    setSelectedIdeaId(null);
    setSelectedIdea(null);
    setStudioTab("editor");
    setActivePage("ideas");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.delete("idea");
      const query = params.toString();
      window.history.pushState(null, "", query ? `?${query}` : "/");
    }
  };

  const handleNavigatePage = useCallback(
    async (page) => {
      if (page === "detail") {
        if (selectedIdeaId) {
          setActivePage("detail");
          return;
        }
        if (sideIdeas.length) {
          await selectIdea(sideIdeas[0].id, { syncUrl: true, openPage: true });
          return;
        }
      }
      setActivePage(page);
    },
    [selectedIdeaId, selectIdea, sideIdeas]
  );

  const openUtilityPanel = useCallback((event, section = "notifications") => {
    utilityTriggerRef.current = event.currentTarget;
    setUtilitySection(section);
    setNotificationPanelOpen(true);
  }, []);

  const closeUtilityPanel = useCallback(() => {
    setNotificationPanelOpen(false);
    if (utilityTriggerRef.current && typeof utilityTriggerRef.current.focus === "function") {
      utilityTriggerRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!notificationPanelOpen) {
      return;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeUtilityPanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notificationPanelOpen, closeUtilityPanel]);

  const blocks = selectedIdea?.blocks || [];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {!authed ? (
        <div className="mx-auto max-w-5xl p-4 md:p-6">
          <AuthGateway
            authMode={authMode}
            setAuthMode={setAuthMode}
            busy={busy}
            loginForm={loginForm}
            setLoginForm={setLoginForm}
            registerForm={registerForm}
            setRegisterForm={setRegisterForm}
            handleLogin={handleLogin}
            handleRegister={handleRegister}
            error={error}
          />
        </div>
      ) : (
        <>
          <div className="relative flex h-screen overflow-hidden bg-[var(--surface)]">
            <button
              type="button"
              onClick={() => setNavCollapsed((prev) => !prev)}
              className="fixed z-40 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--muted)] shadow"
              style={{ top: 12, left: navCollapsed ? 42 : 226 }}
              aria-label={navCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              title={navCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {navCollapsed ? "→" : "←"}
            </button>

            <MumurNavigationSidebar
              activePage={activePage}
              onNavigate={handleNavigatePage}
              collapsed={navCollapsed}
              categories={categoryOptions}
              userName={session?.user?.name || "Mumur 사용자"}
              teamName={session?.workspace?.name || "팀"}
            />

            <section className="flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-6xl px-6 py-7 md:px-10">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{`연결 ${streamStatusLabel(streamStatus)}`}</span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{`안읽음 ${unreadCount}`}</span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--muted)]">{session?.workspace?.name || "팀"}</span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateIdeaDialogOpen(true)}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      + 새 아이디어
                    </button>
                    <button
                      type="button"
                      onClick={refreshAll}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      새로고침
                    </button>
                    <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-1">
                      <button
                        type="button"
                        onClick={(event) => openUtilityPanel(event, "notifications")}
                        className={`rounded px-2 py-1 text-xs ${notificationPanelOpen && utilitySection === "notifications" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                      >
                        {`알림 ${unreadCount > 0 ? unreadCount : ""}`}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openUtilityPanel(event, "team")}
                        className={`rounded px-2 py-1 text-xs ${notificationPanelOpen && utilitySection === "team" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                      >
                        팀
                      </button>
                      <button
                        type="button"
                        onClick={(event) => openUtilityPanel(event, "integrations")}
                        className={`rounded px-2 py-1 text-xs ${notificationPanelOpen && utilitySection === "integrations" ? "bg-[var(--surface)] font-semibold text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}
                      >
                        연동
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                    >
                      로그아웃
                    </button>
                  </div>
                </div>

                {activePage === "dashboard" ? (
                  <DashboardSurface
                    dashboard={dashboard}
                    ideas={sideIdeas}
                    STATUS_META={STATUS_META}
                    onSelectIdea={selectIdea}
                    formatTime={formatTime}
                  />
                ) : null}

                {activePage === "ideas" ? (
                  <IdeasSurface
                    ideas={sideIdeas}
                    filters={filters}
                    setFilters={setFilters}
                    ideaView={ideaView}
                    setIdeaView={setIdeaView}
                    navigatorSort={navigatorSort}
                    setNavigatorSort={setNavigatorSort}
                    navigatorPreset={navigatorPreset}
                    setNavigatorPreset={setNavigatorPreset}
                    presetCounts={presetCounts}
                    STATUS_META={STATUS_META}
                    onQuickStatusFilter={applyQuickStatusFilter}
                    onSelectIdea={selectIdea}
                    onOpenCreateIdea={() => setCreateIdeaDialogOpen(true)}
                    categoryOptions={categoryOptions}
                    formatTime={formatTime}
                  />
                ) : null}

                {activePage === "detail" ? (
                  <IdeaStudioPanel
                    selectedIdea={selectedIdea}
                    ideas={sideIdeas}
                    selectIdea={selectIdea}
                    onBackToList={backToIdeas}
                    studioTab={studioTab}
                    setStudioTab={setStudioTab}
                    IDEA_STATUS={IDEA_STATUS}
                    STATUS_META={STATUS_META}
                    busy={busy}
                    handleSaveIdea={handleSaveIdea}
                    updateSelectedIdeaField={updateSelectedIdeaField}
                    addBlock={addBlock}
                    applySlashCommand={applySlashCommand}
                    blocks={blocks}
                    BLOCK_TYPES={BLOCK_TYPES}
                    updateBlock={updateBlock}
                    moveBlockUp={moveBlockUp}
                    moveBlockDown={moveBlockDown}
                    duplicateBlock={duplicateBlock}
                    removeBlock={removeBlock}
                    setCommentBlockId={setCommentBlockId}
                    handleGenerateSummary={handleGenerateSummary}
                    commentDraft={commentDraft}
                    setCommentDraft={setCommentDraft}
                    handleCreateComment={handleCreateComment}
                    commentBlockId={commentBlockId}
                    comments={comments}
                    commentFilterBlockId={commentFilterBlockId}
                    setCommentFilterBlockId={setCommentFilterBlockId}
                    applyCommentFilter={applyCommentFilter}
                    reactions={reactions}
                    handleReaction={handleReaction}
                    votes={votes}
                    handleVote={handleVote}
                    handleCreateThread={handleCreateThread}
                    threadForm={threadForm}
                    setThreadForm={setThreadForm}
                    THREAD_STATUS={THREAD_STATUS}
                    threads={threads}
                    selectedThreadId={selectedThreadId}
                    setSelectedThreadId={setSelectedThreadId}
                    syncThreadEditor={syncThreadEditor}
                    selectedIdeaId={selectedIdeaId}
                    api={api}
                    setThreadComments={setThreadComments}
                    selectedThread={selectedThread}
                    handleUpdateThread={handleUpdateThread}
                    threadEdit={threadEdit}
                    setThreadEdit={setThreadEdit}
                    handleAddThreadComment={handleAddThreadComment}
                    threadCommentDraft={threadCommentDraft}
                    setThreadCommentDraft={setThreadCommentDraft}
                    threadComments={threadComments}
                    formatTime={formatTime}
                    handleCreateVersion={handleCreateVersion}
                    versionForm={versionForm}
                    setVersionForm={setVersionForm}
                    setVersionFile={setVersionFile}
                    versions={versions}
                    timeline={timeline}
                    teamMembers={teamMembers}
                  />
                ) : null}

                {activePage === "team" ? (
                  <TeamSurface
                    teamMembers={teamMembers}
                    teamMe={teamMe}
                    teamMemberForm={teamMemberForm}
                    setTeamMemberForm={setTeamMemberForm}
                    addTeamMember={addTeamMember}
                    updateTeamMemberRole={updateTeamMemberRole}
                    requestRemoveTeamMember={requestRemoveTeamMember}
                    teamInvitations={teamInvitations}
                    retryTeamInvitation={retryTeamInvitation}
                    requestCancelInvitation={requestCancelInvitation}
                    teamInvitationMessage={teamInvitationMessage}
                    formatTime={formatTime}
                  />
                ) : null}
              </div>
            </section>
          </div>

          {notificationPanelOpen ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 h-full w-full bg-slate-950/40"
                aria-label="유틸리티 패널 닫기"
                onClick={closeUtilityPanel}
              />
              <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto border-l border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl">
                <ContextPanel
                  dashboard={dashboard}
                  utilitySection={utilitySection}
                  setUtilitySection={setUtilitySection}
                  onRequestClose={closeUtilityPanel}
                  notificationFilters={notificationFilters}
                  setNotificationFilters={setNotificationFilters}
                  NOTIFICATION_TYPES={NOTIFICATION_TYPES}
                  loadNotifications={loadNotifications}
                  markAllNotificationsRead={markAllNotificationsRead}
                  mutedTypes={mutedTypes}
                  toggleMutedType={toggleMutedType}
                  saveMutedTypes={saveMutedTypes}
                  notifications={notifications}
                  markNotificationRead={markNotificationRead}
                  formatTime={formatTime}
                  handleSaveWebhook={handleSaveWebhook}
                  webhookForm={webhookForm}
                  setWebhookForm={setWebhookForm}
                  webhooks={webhooks}
                  deliveries={deliveries}
                  teamMembers={teamMembers}
                  userTeams={userTeams}
                  activeTeamId={session?.workspace?.id || null}
                  teamMe={teamMe}
                  onSwitchTeam={handleSwitchTeam}
                  teamInvitations={teamInvitations}
                  teamInvitationMessage={teamInvitationMessage}
                  onOpenTeamPage={() => {
                    closeUtilityPanel();
                    setActivePage("team");
                  }}
                />
              </div>
            </div>
          ) : null}

          <IdeaCreateDialog
            open={createIdeaDialogOpen}
            onClose={() => setCreateIdeaDialogOpen(false)}
            busy={busy}
            IDEA_STATUS={IDEA_STATUS}
            STATUS_META={STATUS_META}
            newIdeaForm={newIdeaForm}
            setNewIdeaForm={setNewIdeaForm}
            handleCreateIdea={handleCreateIdea}
          />
          <ConfirmDialog
            open={confirmDialog.open}
            title={confirmDialog.title}
            description={confirmDialog.description}
            confirmText={confirmDialog.confirmText}
            danger={confirmDialog.danger}
            onCancel={closeConfirmDialog}
            onConfirm={confirmDialogAction}
          />
        </>
      )}
    </main>
  );
}
