import crypto from "node:crypto";
import type { QueryAdapter } from "@/shared/lib/server/query-adapter";

export const SESSION_COOKIE = "mumur_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
export const MIN_PASSWORD_LENGTH = 10;
export const MIN_SESSION_SECRET_LENGTH = 32;

export function isPasswordPolicyValid(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function passwordPolicyMessage(label = "비밀번호") {
  return `${label}는 ${MIN_PASSWORD_LENGTH}자 이상이며 영문자와 숫자를 포함해야 합니다`;
}

export function assertSessionSecretConfigured() {
  const sessionSecret = process.env.SESSION_SECRET || "";

  if (process.env.NODE_ENV !== "production") {
    return;
  }

  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set in production");
  }

  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters in production`);
  }
}

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
