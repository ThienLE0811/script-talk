/** Vietnamese messages for the error codes returned by the /api/* routes that call Gemini. */
export const AI_ERROR_TEXT: Record<string, string> = {
  missing_key: "Server chưa có GEMINI_API_KEY. Xem hướng dẫn ở trang Trò chuyện tự nhiên.",
  invalid_key: "API key không hợp lệ. Kiểm tra lại GEMINI_API_KEY trong .env.local.",
  rate_limited: "Đã hết lượt gọi Gemini (gói miễn phí giới hạn theo phút và theo ngày). Đợi một lát rồi thử lại.",
  overloaded: "Gemini đang quá tải, kể cả model dự phòng. Thử lại sau ít phút.",
  timeout: "Gemini phản hồi quá lâu. Thử lại nhé.",
  bad_request: "Yêu cầu gửi lên không hợp lệ.",
  upstream_error: "Gemini đang gặp lỗi. Thử lại sau ít phút.",
  network: "Không kết nối được tới server. Kiểm tra mạng rồi thử lại.",
};

export function aiErrorText(code: string | null | undefined): string {
  return AI_ERROR_TEXT[code ?? ""] ?? AI_ERROR_TEXT.upstream_error;
}

export class AiRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** POST JSON to an AI route and return the parsed JSON body, throwing AiRequestError on failure. */
export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new AiRequestError("network");
  }
  if (!res.ok) throw await readAiError(res);
  return (await res.json()) as T;
}

export async function readAiError(res: Response): Promise<AiRequestError> {
  const body = await res.json().catch(() => null);
  return new AiRequestError(typeof body?.error === "string" ? body.error : "upstream_error");
}
