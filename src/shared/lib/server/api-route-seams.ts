import path from "node:path";
import { ensureDir } from "@/shared/lib/server/db";
import type { DatabaseClient } from "@/shared/lib/server/database-client";
import type { QueryAdapter } from "@/shared/lib/server/query-adapter";
import { reportServerIssue } from "@/shared/lib/observability";
import type { Block } from "@/shared/types";

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_FILE_UPLOAD_BYTES = 50 * 1024 * 1024;
const BLOCKED_UPLOAD_MIME_TYPES = new Set(["text/html", "application/xhtml+xml", "image/svg+xml"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"]);
const ALLOWED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const ALLOWED_FILE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".mp4", ".mov", ".webm", ".txt", ".pdf", ".md", ".csv", ".json"]);

export type UploadValidationError = {
  status: number;
  message: string;
};

export type StoredIdeaBlock = Block & Record<string, unknown>;

type TransactionQueries = Pick<QueryAdapter, "extractInsertId" | "withTransaction">;

function parseStoredJson(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseStoredJsonWithWarning(raw: unknown, label: string) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    reportServerIssue("api-route-seams", `failed to parse ${label}`, { error });
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function detectDangerousUploadMime(buffer: Buffer) {
  const sample = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (sample.startsWith("<!doctype html") || sample.startsWith("<html")) {
    return "text/html";
  }
  if (sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"))) {
    return "image/svg+xml";
  }
  return null;
}

function sniffUploadMime(extension: string, buffer: Buffer) {
  const ext = String(extension || "").toLowerCase();
  if (ext === ".png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((byte, idx) => buffer[idx] === byte) ? "image/png" : null;
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    const sig = [0xff, 0xd8, 0xff];
    return sig.every((byte, idx) => buffer[idx] === byte) ? "image/jpeg" : null;
  }
  if (ext === ".gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a" ? "image/gif" : null;
  }
  if (ext === ".webp") {
    const riff = buffer.subarray(0, 4).toString("ascii");
    const webp = buffer.subarray(8, 12).toString("ascii");
    return riff === "RIFF" && webp === "WEBP" ? "image/webp" : null;
  }
  if (ext === ".pdf") {
    const header = buffer.subarray(0, 5).toString("ascii");
    return header === "%PDF-" ? "application/pdf" : null;
  }
  if (ext === ".webm") {
    const sig = [0x1a, 0x45, 0xdf, 0xa3];
    return sig.every((byte, idx) => buffer[idx] === byte) ? "video/webm" : null;
  }
  if (ext === ".mp4" || ext === ".mov" || ext === ".heic") {
    const boxType = buffer.subarray(4, 8).toString("ascii");
    if (boxType !== "ftyp") {
      return null;
    }
    if (ext === ".heic") {
      return "image/heic";
    }
    return ext === ".mov" ? "video/quicktime" : "video/mp4";
  }
  return null;
}

export function uploadDestination() {
  const cwd = process.cwd();
  const dest = path.resolve(cwd, "public", "uploads");
  ensureDir(dest);
  return dest;
}

export function parseStoredIdeaBlocks(raw: unknown): StoredIdeaBlock[] {
  const parsed = parseStoredJson(raw);
  return Array.isArray(parsed) ? (parsed as StoredIdeaBlock[]) : [];
}

export function parseStoredDraftPayload(raw: unknown) {
  return parseStoredJson(raw) ?? {};
}

export function parseStoredJsonObject(raw: unknown) {
  const parsed = parseStoredJson(raw);
  return isPlainObject(parsed) ? parsed : {};
}

export function parseStoredMutedTypes(raw: unknown) {
  const parsed = parseStoredJsonWithWarning(raw, "muted_types_json");
  return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
}

export function normalizeWorkspaceViewConfig(input: unknown) {
  return isPlainObject(input) ? input : {};
}

export function resolveUploadedMimeType(file: File, buffer: Buffer) {
  const extension = path.extname(String(file.name || "")).toLowerCase();
  const dangerous = detectDangerousUploadMime(buffer);
  if (dangerous) {
    return dangerous;
  }
  const sniffed = sniffUploadMime(extension, buffer);
  if (sniffed) {
    return sniffed;
  }
  const declared = String(file.type || "application/octet-stream").toLowerCase();
  if (BLOCKED_UPLOAD_MIME_TYPES.has(declared)) {
    return declared;
  }
  return declared;
}

export function inferUploadedBlockType(blockType: unknown, fileName: unknown, mimeType: unknown) {
  if (blockType === "image" || blockType === "video") {
    return blockType;
  }

  const extension = path.extname(String(fileName || "")).toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (String(mimeType || "").startsWith("image/")) {
    return "image";
  }
  if (String(mimeType || "").startsWith("video/")) {
    return "video";
  }
  return "file";
}

export function validateUploadedBlockFile(targetType: string, file: File, buffer: Buffer): UploadValidationError | null {
  const mimeType = resolveUploadedMimeType(file, buffer);
  const size = buffer.length;
  const extension = path.extname(String(file.name || "")).toLowerCase();

  if (BLOCKED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return { status: 415, message: "보안상 허용되지 않는 파일 형식입니다" };
  }

  const dangerous = detectDangerousUploadMime(buffer);
  if (dangerous) {
    return { status: 415, message: "보안상 허용되지 않는 파일 형식입니다" };
  }

  if (targetType === "image") {
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      return { status: 415, message: "지원하지 않는 이미지 확장자입니다" };
    }
    if (size > MAX_IMAGE_UPLOAD_BYTES) {
      return { status: 413, message: "이미지 업로드 용량은 20MB 이하만 지원합니다" };
    }

    const sniffed = sniffUploadMime(extension, buffer);
    if (!sniffed || !sniffed.startsWith("image/")) {
      return { status: 415, message: "이미지 블록에는 이미지 파일만 업로드할 수 있습니다" };
    }

    return null;
  }

  if (targetType === "video") {
    if (!ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
      return { status: 415, message: "지원하지 않는 동영상 확장자입니다" };
    }
    if (size > MAX_VIDEO_UPLOAD_BYTES) {
      return { status: 413, message: "동영상 업로드 용량은 200MB 이하만 지원합니다" };
    }

    const sniffed = sniffUploadMime(extension, buffer);
    if (!sniffed || !sniffed.startsWith("video/")) {
      return { status: 415, message: "동영상 블록에는 동영상 파일만 업로드할 수 있습니다" };
    }

    return null;
  }

  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
    return { status: 415, message: "지원하지 않는 파일 확장자입니다" };
  }
  if (size > MAX_FILE_UPLOAD_BYTES) {
    return { status: 413, message: "파일 업로드 용량은 50MB 이하만 지원합니다" };
  }

  return null;
}

export function restoreIdeaVersionSnapshot(
  db: DatabaseClient,
  queries: TransactionQueries,
  input: {
    ideaId: number;
    restoredBlocksJson: string;
    restoredLabel: string;
    createdBy: number;
    now: number;
  }
) {
  return queries.withTransaction(() => {
    db.prepare("UPDATE ideas SET blocks_json = ?, updated_at = ? WHERE id = ?").run(
      input.restoredBlocksJson,
      input.now,
      input.ideaId
    );
    const restoredInsert = db.prepare(
      "INSERT INTO idea_versions (idea_id, version_label, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(input.ideaId, input.restoredLabel, input.restoredBlocksJson, input.createdBy, input.now);

    return { restoredVersionId: queries.extractInsertId(restoredInsert) };
  });
}
