import crypto from "node:crypto";
import type { QueryAdapter } from "@/lib/server/query-adapter";

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

export function createSession(queries: QueryAdapter, userId, teamId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  queries.insertSession(token, userId, teamId, expiresAt, Date.now());
  return { token, expiresAt };
}

export function clearExpiredSessions(queries: QueryAdapter) {
  queries.deleteExpiredSessions(Date.now());
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
