const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const ROOT = "/Users/chavis/AI-Project/mumur";
const PORT = 3201;
const BASE = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      void error;
    }
    await sleep(200);
  }
  throw new Error("Server did not start in time");
}

function startServer() {
  return spawn("pnpm", ["run", "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore"
  });
}

function extractCookie(setCookieHeader) {
  const first = String(setCookieHeader || "").split(";")[0];
  return first || "";
}

async function request(pathname, options = {}, cookie = "") {
  const headers = {
    ...(options.headers || {})
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test("Next API core flow works", async (t) => {
  const seed = spawn("pnpm", ["run", "seed:local"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    seed.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`seed failed: ${code}`));
    });
  });

  const server = startServer();
  t.after(() => {
    server.kill("SIGTERM");
  });

  await waitForHealth();

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "localtester@mumur.local",
      password: "mumur1234!"
    })
  });

  assert.equal(login.response.status, 200);
  const cookie = extractCookie(login.response.headers.get("set-cookie"));
  assert.equal(cookie.startsWith("mumur_session="), true);

  const me = await request("/api/auth/me", {}, cookie);
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.email, "localtester@mumur.local");
  const ownerTeamId = me.body.team.id;

  const teamsBefore = await request("/api/teams", {}, cookie);
  assert.equal(teamsBefore.response.status, 200);
  assert.equal(teamsBefore.body.teams.some((team) => team.id === ownerTeamId && team.active), true);

  const secondEmail = `member-${Date.now()}@mumur.local`;
  const secondPassword = "mumur1234!";
  const registerSecond = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Second Member",
      email: secondEmail,
      password: secondPassword,
      teamName: `team-${Date.now()}`
    })
  });
  assert.equal(registerSecond.response.status, 201);
  const secondCookie = extractCookie(registerSecond.response.headers.get("set-cookie"));

  const inviteExisting = await request(
    "/api/team/invitations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: secondEmail, role: "member" })
    },
    cookie
  );
  assert.equal(inviteExisting.response.status, 201);
  assert.equal(inviteExisting.body.invitation.status, "accepted");

  const unknownEmail = `ghost-${Date.now()}@mumur.local`;
  const invitePending = await request(
    "/api/team/invitations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unknownEmail, role: "member" })
    },
    cookie
  );
  assert.equal(invitePending.response.status, 201);
  assert.equal(invitePending.body.invitation.status, "pending");

  const retryPending = await request(
    `/api/team/invitations/${invitePending.body.invitation.id}/retry`,
    { method: "POST" },
    cookie
  );
  assert.equal(retryPending.response.status, 200);
  assert.equal(retryPending.body.invitation.status, "pending");

  const members = await request("/api/team/members", {}, cookie);
  assert.equal(members.response.status, 200);
  assert.equal(members.body.members.some((member) => member.email === secondEmail), true);

  const secondTeams = await request("/api/teams", {}, secondCookie);
  assert.equal(secondTeams.response.status, 200);
  assert.equal(secondTeams.body.teams.some((team) => team.id === ownerTeamId), true);

  const switched = await request(
    "/api/teams/switch",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: ownerTeamId })
    },
    secondCookie
  );
  assert.equal(switched.response.status, 200);
  assert.equal(switched.body.team.id, ownerTeamId);

  const secondMe = await request("/api/auth/me", {}, secondCookie);
  assert.equal(secondMe.response.status, 200);
  assert.equal(secondMe.body.team.id, ownerTeamId);

  const createIdea = await request(
    "/api/ideas",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Next API Test Idea",
        category: "qa",
        status: "seed",
        blocks: [{ id: "b1", type: "text", content: "first", checked: false }]
      })
    },
    cookie
  );
  assert.equal(createIdea.response.status, 201);
  const ideaId = createIdea.body.idea.id;

  const comment = await request(
    `/api/ideas/${ideaId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `hello @${secondEmail}`, blockId: "b1" })
    },
    cookie
  );
  assert.equal(comment.response.status, 201);

  const mentionInbox = await request("/api/notifications?limit=20&mentionsOnly=true", {}, secondCookie);
  assert.equal(mentionInbox.response.status, 200);
  assert.equal(
    mentionInbox.body.notifications.some(
      (item) => item.type === "mention.created" && Number(item.payload?.targetUserId) === Number(secondMe.body.user.id)
    ),
    true
  );

  const ownerMentionInbox = await request("/api/notifications?limit=20&mentionsOnly=true", {}, cookie);
  assert.equal(ownerMentionInbox.response.status, 200);
  assert.equal(ownerMentionInbox.body.notifications.length, 0);

  const vote = await request(
    `/api/ideas/${ideaId}/votes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voteType: "score", value: 4 })
    },
    cookie
  );
  assert.equal(vote.response.status, 201);
  assert.equal(vote.body.votes.score.average, 4);

  const thread = await request(
    `/api/ideas/${ideaId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Discussion", description: "desc", status: "active" })
    },
    cookie
  );
  assert.equal(thread.response.status, 201);
  const threadId = thread.body.thread.id;

  const threadComment = await request(
    `/api/ideas/${ideaId}/threads/${threadId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "thread note" })
    },
    cookie
  );
  assert.equal(threadComment.response.status, 201);

  const form = new FormData();
  form.set("versionLabel", "v1.0");
  form.set("notes", "notes");
  form.set("file", new Blob(["hello plan"]), "plan.txt");
  const version = await request(
    `/api/ideas/${ideaId}/versions`,
    {
      method: "POST",
      body: form
    },
    cookie
  );
  assert.equal(version.response.status, 201);

  const summary = await request(`/api/ideas/${ideaId}/summary`, { method: "POST" }, cookie);
  assert.equal(summary.response.status, 200);
  assert.match(summary.body.aiSummary, /\[qa\/seed\]/);

  const notifications = await request("/api/notifications?limit=10", {}, cookie);
  assert.equal(notifications.response.status, 200);
  assert.equal(Array.isArray(notifications.body.notifications), true);
  assert.equal(notifications.body.notifications.length > 0, true);
  assert.equal(
    notifications.body.notifications.some(
      (item) => item.type === "mention.created" && Number(item.payload?.targetUserId) === Number(secondMe.body.user.id)
    ),
    false
  );

  const readAll = await request("/api/notifications/read-all", { method: "POST" }, cookie);
  assert.equal(readAll.response.status, 200);

  const webhook = await request(
    "/api/integrations/webhooks/slack",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: "https://hooks.slack.com/services/T000/B000/XYZ",
        enabled: false
      })
    },
    cookie
  );
  assert.equal(webhook.response.status, 200);

  const dashboard = await request("/api/dashboard/summary", {}, cookie);
  assert.equal(dashboard.response.status, 200);
  assert.equal(typeof dashboard.body.metrics.totalIdeas, "number");

  const list = await request("/api/ideas", {}, cookie);
  assert.equal(list.response.status, 200);
  assert.equal(Array.isArray(list.body.ideas), true);
  assert.equal(list.body.ideas.some((item) => item.id === ideaId), true);
});
