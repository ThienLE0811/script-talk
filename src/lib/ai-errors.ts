/**
 * Client helpers for calling the app's own API routes (AI and database), with Vietnamese
 * messages for their error codes. A 401 sends the user to /login.
 */
export const AI_ERROR_TEXT: Record<string, string> = {
  missing_key: "Server chưa có GEMINI_API_KEY. Xem hướng dẫn ở trang Trò chuyện tự nhiên.",
  invalid_key: "API key không hợp lệ. Kiểm tra lại GEMINI_API_KEY trong .env.local.",
  rate_limited: "Đã hết lượt gọi Gemini (gói miễn phí giới hạn theo phút và theo ngày). Đợi một lát rồi thử lại.",
  overloaded: "Gemini đang quá tải, kể cả model dự phòng. Thử lại sau ít phút.",
  timeout: "Gemini phản hồi quá lâu. Thử lại nhé.",
  bad_request: "Yêu cầu gửi lên không hợp lệ.",
  upstream_error: "Gemini đang gặp lỗi. Thử lại sau ít phút.",
  network: "Không kết nối được tới server. Kiểm tra mạng rồi thử lại.",
  db_not_configured: "Server chưa có MONGODB_URI nên chưa lưu được kịch bản. Xem phần cấu hình trong README.",
  db_error: "Không kết nối được cơ sở dữ liệu. Thử lại sau ít phút.",
  not_found: "Không tìm thấy kịch bản này (có thể đã bị xoá ở thiết bị khác).",
  unauthorized: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  auth_not_configured: "Server chưa đặt APP_ACCESS_CODE.",
};

export function aiErrorText(code: string | null | undefined): string {
  return AI_ERROR_TEXT[code ?? ""] ?? AI_ERROR_TEXT.upstream_error;
}

export class AiRequestError extends Error {
  constructor(
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}

function goToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export async function readAiError(res: Response): Promise<AiRequestError> {
  const body = await res.json().catch(() => null);
  const code = typeof body?.error === "string" ? body.error : res.status === 401 ? "unauthorized" : "upstream_error";
  if (res.status === 401 && code === "unauthorized") goToLogin();
  return new AiRequestError(code, typeof body?.message === "string" ? body.message : undefined);
}

/** Send a request to one of the app's API routes and return the parsed JSON body. */
export async function requestJSON<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new AiRequestError("network");
  }
  if (!res.ok) throw await readAiError(res);
  return (await res.json()) as T;
}

export function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJSON<T>("POST", url, body, signal);
}
