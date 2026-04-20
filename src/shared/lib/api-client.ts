export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(path: string, options: RequestInit = {}) {
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
    throw new ApiError(json.error || "요청 처리에 실패했습니다", response.status, json);
  }
  return json;
}
