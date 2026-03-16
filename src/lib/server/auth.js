import crypto from "node:crypto";

export const SESSION_COOKIE = "mumur_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) {
    return false;
  }

  const inputHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(inputHash, "hex"));
}

export function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSession(db, userId, teamId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare("INSERT INTO sessions (id, user_id, team_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
    token,
    userId,
    teamId,
    expiresAt,
    Date.now()
  );
  return { token, expiresAt };
}

export function clearExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

export function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) {
    return out;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) {
      continue;
    }
    out[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return out;
}
