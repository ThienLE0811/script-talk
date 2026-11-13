# CLAUDE.md

Hướng dẫn cho Claude khi làm việc trong repo **ScriptTalk**: ứng dụng web luyện nói tiếng Anh. Có hai chế độ:

- **Luyện theo kịch bản** (`/script`): máy đọc các vai còn lại (TTS), người dùng nói vai của mình (Speech Recognition) và được chấm điểm từng từ. Luyện và chấm điểm chạy hoàn toàn trên trình duyệt; riêng nút "AI viết" gọi Gemini để soạn kịch bản. Hết bài có nút luyện lại riêng các câu chưa đạt. Luồng: thư viện (bảng kịch bản) → bấm một dòng → màn chuẩn bị (vai, giọng, tốc độ…) → "Bắt đầu hội thoại".
- **Trò chuyện tự nhiên** (`/chat`): người dùng nói tự do với AI (Gemini) theo chủ đề, AI trả lời bằng giọng nói và góp ý ngữ pháp sau mỗi câu. Có thể nhận "nhiệm vụ" (3 mục tiêu cụ thể, AI đánh dấu khi làm được). Buổi trò chuyện tự lưu vào lịch sử, mở lại được để xem hoặc nói tiếp. Bấm "Kết thúc" sẽ có tổng kết do AI viết, và có thể lưu buổi trò chuyện thành kịch bản (câu của người học dùng bản đã sửa) để luyện lại.

## Lệnh

```bash
npm install        # cài dependency
npm run dev        # chạy dev server tại http://localhost:3000
npm run build      # build production (cũng kiểm tra type)
npm run start      # chạy bản build production
npm run lint       # ESLint
npx tsc --noEmit   # chỉ kiểm tra type, nhanh hơn build
```

Chưa có unit test. `next build` và `next dev` dùng chung thư mục `.next`, nên cần dừng dev server trước khi build.

Biến môi trường (mẫu đầy đủ ở `.env.example`; trên Vercel đặt trong Environment Variables):

| Biến                        | Dùng cho                                      | Thiếu thì sao                                           |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `APP_ACCESS_CODE`           | Mã nhập ở `/login`                            | Dev: không khoá. Production: khoá toàn bộ (fail closed) |
| `AUTH_SECRET`               | Khoá ký cookie phiên (tuỳ chọn)               | Dùng `APP_ACCESS_CODE`                                  |
| `MONGODB_URI`, `MONGODB_DB` | Lưu kịch bản (MongoDB Atlas)                  | Mục "Đã lưu" báo `db_not_configured`, không lưu được    |
| `GEMINI_API_KEY`            | AI trò chuyện, góp ý, tổng kết, viết kịch bản | Các tính năng AI báo `missing_key`                      |

Chế độ trò chuyện cần `GEMINI_API_KEY` trong `.env.local` (mẫu ở `.env.example`). Tuỳ chọn thêm `GEMINI_MODEL` (mặc định `gemini-3.6-flash`) và `GEMINI_FALLBACK_MODEL` (mặc định `gemini-3.5-flash-lite`). Dev server tự nạp lại `.env.local` khi file thay đổi ("Reload env"). Không có key thì `/chat` hiện hướng dẫn cấu hình, chế độ kịch bản vẫn chạy bình thường.

Thêm component shadcn/ui bằng `npx shadcn@latest add <tên>` (cấu hình trong `components.json`, style `radix-nova`). Các component trong `src/components/ui/` import `cn` từ package `cn` của shadcn, đây là bình thường.

Kiểm thử thủ công bằng **Chrome hoặc Edge** và cho phép micro. Firefox/Safari không hỗ trợ đầy đủ Speech Recognition, nên không dùng để xác nhận tính năng nói.

## Kiến trúc

- **Giọng nói luôn xử lý trên trình duyệt**, ở cả hai chế độ, bằng Web Speech API:
  - `speechSynthesis` (TTS): đọc câu của vai máy hoặc của AI.
  - `SpeechRecognition` / `webkitSpeechRecognition`: nhận câu người dùng nói.
- Speech Recognition của Chrome gửi âm thanh lên server Google nên **cần Internet**. Không có mạng thì lỗi `network`, cần báo lỗi rõ cho người dùng.
- **Đăng nhập (một người dùng, mã truy cập):** `src/middleware.ts` chặn mọi trang và API trừ `/login` và `/api/auth/*`. Trang chưa đăng nhập thì chuyển sang `/login?next=…`, API thì trả 401 `{ error: "unauthorized" }` (client tự chuyển sang `/login`). Cookie `st_session` = `<hạn>.<HMAC>` (Web Crypto, chạy được cả ở Edge), `HttpOnly`, 180 ngày. Đổi `APP_ACCESS_CODE` thì mọi phiên cũ mất hiệu lực (nếu không đặt `AUTH_SECRET`). Đăng nhập sai bị trễ 0,8 giây. `safeNextPath` dùng bộ phân tích URL để chặn chuyển hướng ra trang khác (`//evil`, `/\evil`, `/<tab>/evil`).
- **Cơ sở dữ liệu: MongoDB** (driver `mongodb`). Kết nối cache trên `globalThis` (dev hot-reload và Vercel tái dùng). Chưa có `userId` vì chỉ có một người dùng.
  - Collection `scripts` (`_id` là id kịch bản dạng chuỗi, `title`, `raw`, `createdAt`, `updatedAt` dạng số ms, `practiceCount?`, `lastPracticedAt?`): `GET/POST /api/scripts`, `PUT/DELETE /api/scripts/[id]`, `POST /api/scripts/[id]/practice` (+1 lần luyện, không đổi `updatedAt`), `POST /api/scripts/import` (nhận file Xuất hoặc `{ scripts }`, gộp bằng `mergeScripts`, không bao giờ xoá; giữ nguyên số lần luyện).
  - Số lần luyện: tăng khi luyện **hết cả bài** của một kịch bản đã lưu và có nói ít nhất một câu ("Luyện lại cả bài" cũng tính; luyện lại câu chưa đạt và bản nháp chưa lưu thì không). Hiện trong thư viện, màn chuẩn bị và thẻ kết quả. File Xuất không chứa số lần luyện. Thư viện sắp xếp được theo Mới sửa / Ít luyện nhất / Luyện gần đây (`sortSavedScripts` trong `settings.ts`, lựa chọn lưu ở `Settings.savedSort`).
  - Collection `phrases` (sổ tay câu): `text`, `original?`, `note?`, `source` (`chat | script | manual`), `context?`, lịch ôn Leitner (`box` 0–6, `dueAt`, `reviews`, `lastScore`), và `key` = `phraseKey(text)` có **unique index** để cùng một câu (khác dấu câu, "I'm"/"I am") chỉ lưu một lần; thêm trùng thì giữ tiến độ cũ, chỉ điền `note`/`original` nếu đang thiếu. `GET/POST /api/phrases` (POST nhận `{ items }`, trả `{ added, existing }`), `PATCH /api/phrases/[id]` (`{ score, passed }` → lịch ôn mới), `DELETE /api/phrases/[id]`.
  - Collection `chats` (lịch sử trò chuyện, index `updatedAt`): `_id` do client tạo (`newScriptId`), `topicId`, `customTopic?`, `level`, `topicLabel`, `mission?`, `turns` (`{ role, text, feedback? }`, feedback có `goalsDone` khi có nhiệm vụ), `summary?`, `stats` (server tính bằng `sessionStats`), `activity` (mốc thời gian mỗi lần lưu có thêm câu của người học, tối đa 100; dùng tính chuỗi ngày, nên mở lại buổi cũ để xem không tính là luyện), `createdAt`, `updatedAt`. `GET /api/chats` (danh sách không kèm lời thoại, tối đa 500), `GET/PUT/DELETE /api/chats/[id]` (PUT ghi đè cả buổi, tạo mới nếu chưa có; trường không còn như `summary` cũ thì bị `$unset`).
  - Client tự lưu buổi trò chuyện (debounce 1,5 giây sau mỗi thay đổi, khoá JSON để bỏ qua khi không đổi), lưu nốt bằng `fetch` `keepalive` khi rời trang (`pagehide`) hoặc thoát. Tổng kết chỉ được lưu khi còn khớp số lượt (nói tiếp sau tổng kết thì tổng kết cũ bị gỡ).
  - Câu vào sổ tay: tự động khi AI góp ý "minor"/"fix" trong trò chuyện; bằng nút ở màn hình tổng kết trò chuyện và màn hình kết thúc kịch bản (câu chưa đạt; không tự động vì điểm thấp có thể do mic nghe nhầm); hoặc tự thêm ở trang `/phrases`.
  - Ôn tập: đạt (≥ `REVIEW_PASS_SCORE` = 80%) thì lên hộp và nhắc lại sau 1, 2, 4, 8, 16, 32 ngày; chưa đạt thì về hộp 0, nhắc lại ngay lần sau. Chỉ **lần nói đầu tiên** của mỗi câu trong một buổi được ghi; luyện thêm không ghi lại.
  - Lỗi: `db_not_configured` (503), `db_error` (503), `not_found` (404), `bad_request` (400).
- **Route gọi Gemini** bằng SDK `@google/genai` (`ai.models.generateContent` / `generateContentStream`). Chỉ có chữ đi qua server, không có âm thanh.
  - `POST /api/chat/reply`: nhận `{ topicId, customTopic?, level, history }`, stream câu trả lời dạng `text/plain`.
  - `POST /api/chat/feedback`: nhận `{ level, history, utterance }`, trả JSON `Feedback` (`verdict`, `corrected`, `explanation`) qua `responseJsonSchema`.
  - `POST /api/chat/summary`: nhận `{ topicId, customTopic?, level, history, corrections }`, trả JSON `ChatSummary` (`overall`, `strengths`, `focus`, `phrases`; giải thích bằng tiếng Việt).
  - `POST /api/chat/suggest`: nhận `{ topicId, customTopic?, level, history }`, trả `{ suggestions }` (2–3 câu người học có thể nói tiếp, kèm nghĩa tiếng Việt). Nút bóng đèn / phím H; bấm gợi ý thì máy đọc mẫu rồi bật mic.
  - `POST /api/chat/mission`: nhận `{ topicId, customTopic?, level }`, trả `Mission` (`brief` và 3 `goals`, tiếng Việt). `reply`, `suggest`, `feedback`, `summary` đều nhận thêm `mission?` (feedback và summary nhận cả `goalsDone`): vai AI không làm hộ mục tiêu, feedback trả `goalsDone` là các mục tiêu câu vừa nói hoàn thành, summary nhận xét đã xong nhiệm vụ chưa.
  - `POST /api/chat/translate`: nhận `{ text }`, trả `{ vi }` (bản dịch một câu của AI). Nút "Dịch" dưới mỗi câu, kết quả giữ trong state của lượt đó.
  - `POST /api/script/generate`: nhận `{ topic, level, length }`, trả `GeneratedScript` (`raw` đã đúng cú pháp kịch bản, `learnerRole`, `partnerRole`). Model trả JSON theo schema, server tự ghép thành text và làm sạch tên vai (chỉ chữ cái và khoảng trắng) để parser không hiểu sai.
  - Mọi lời gọi đi qua `withModelFallback`: thử `GEMINI_MODEL` trước, gặp 503 (quá tải), 429 (hết lượt, quota gói miễn phí tính riêng theo model), 500 hoặc quá `REQUEST_TIMEOUT_MS` (20 giây) thì chuyển sang model dự phòng. Request bị client huỷ thì dừng ngay. Model mới ra (ví dụ `gemini-3.8-flash`) từng trả 503 "high demand" liên tục, nên mặc định dùng bản Stable.
  - Lỗi trả về `{ error: code }` với `code` thuộc `missing_key | invalid_key | rate_limited | overloaded | timeout | bad_request | upstream_error`; client đổi mã này thành thông báo tiếng Việt (`aiErrorText` trong `src/lib/ai-errors.ts`, dùng chung cho cả mã lỗi DB và đăng nhập). Gemini báo key sai bằng 400 "API key not valid", không phải 401. SDK báo quá thời gian bằng `AbortError`, giống khi client huỷ, nên phân biệt bằng `req.signal.aborted`.
  - Các route AI không đọc DB: client gửi kèm lịch sử (chỉ chữ) mỗi lần gọi, server cắt còn `MAX_TURNS` lượt gần nhất.
  - Các route AI được middleware bảo vệ như mọi API khác, nhưng chưa có giới hạn lượt gọi.
- **Lưu trữ:** kịch bản đã lưu nằm trong MongoDB. Bản nháp đang soạn và các cài đặt (vai, giọng, tốc độ…) vẫn ở `localStorage` vì gắn với từng thiết bị. Kịch bản cũ trong `localStorage` (`scripttalk.saved`) được chuyển lên server bằng nút "Chuyển lên server" rồi xoá khỏi trình duyệt.
- Không tự thêm backend mới, database/collection mới, API key, dịch vụ STT/TTS bên ngoài hay thư viện nặng nếu chưa được yêu cầu. Không đổi nhà cung cấp AI (đang là Gemini, theo lựa chọn của chủ dự án) khi chưa hỏi.

### Cấu trúc thư mục

- `src/lib/script.ts`: logic thuần, không phụ thuộc DOM. Gồm parser (`parseScript`), chấm điểm (`compareLine`, `normalizeSentence`), `cleanForSpeech` (bỏ ghi chú trước khi đọc), `hintText` (chế độ gợi ý) và `SAMPLE_SCRIPT`.
- `src/lib/speech.ts`: bọc Web Speech API. `useEnglishVoices` (danh sách giọng tiếng Anh, giọng tốt xếp trước), `speak` / `stopSpeaking`, `startListening` (tự dừng sau ~1,6 giây im lặng hoặc tối đa 25 giây), `isRecognitionSupported`.
- `src/lib/translate.ts`: phụ đề tiếng Việt khi luyện kịch bản (`Settings.showTranslation`, mặc định tắt; bật/tắt ở bảng cài đặt hoặc nút trên màn hình luyện). Dùng **Translator API có sẵn của Chrome** (máy tính, bản 138+), dịch ngay trên máy, không qua server và **không tốn lượt Gemini** (chủ dự án chọn vậy để tiết kiệm quota). Lần đầu Chrome tải gói Anh–Việt; việc tải cần một cú bấm, nên nếu Chrome từ chối thì hiện nút "Tải bộ dịch". Bản dịch cache trong bộ nhớ của trang, không lưu DB hay `localStorage`. Phần ghi chú trong ngoặc không dịch. Trình duyệt không hỗ trợ thì chỉ báo một dòng, luyện vẫn bình thường. Câu của người học luôn hiện nghĩa (kể cả khi ẩn câu: đó là gợi ý để tự nhớ câu tiếng Anh); câu vai máy chỉ hiện nghĩa khi đang hiện chữ.
- `src/lib/settings.ts`: kiểu `Settings`, `SavedScript`, giá trị mặc định và các hàm đọc/ghi `localStorage` có `try/catch`.
- `src/lib/settings.ts` cũng chứa `STORAGE_KEYS` (mọi khoá `localStorage`) và `queueScriptForPractice` (ghi vai rồi trả URL màn chuẩn bị `/script?id=…`, dùng khi lưu từ chế độ trò chuyện; không đụng tới bản nháp).
- `src/lib/ai-errors.ts`: gọi API của chính app từ client (`requestJSON`, `postJSON`, `readAiError`, `AiRequestError`) và thông báo tiếng Việt cho mọi mã lỗi (`aiErrorText`: AI, DB, đăng nhập). Gặp 401 thì tự chuyển sang `/login`.
- `src/lib/phrasebook.ts`: logic thuần của sổ tay (`Phrase`, `phraseKey`, `cleanPhraseText`, `scheduleAfterReview`, `reviewQueue`, `phraseStats`, `dueLabel`, `readNewPhrase`). `src/lib/phrases-client.ts`: gọi `/api/phrases` từ client. `src/lib/db/phrases.server.ts`: thao tác trên collection `phrases` (chỉ server).
- `src/app/(app)/phrases/page.tsx`, `src/components/phrases/`: trang Sổ tay câu (`Phrasebook`: thống kê, thêm câu, lọc Cần ôn/Tất cả/Đã thuộc), buổi ôn (`PhraseReview`: máy trạng thái `speaking → listening → result/waiting → done`, dùng `tokenRef` như `Practice.tsx`), và `DueReviewBanner` trên trang chủ.
- `src/lib/progress.ts`: logic thuần cho phần Tiến độ (`practiceDays` theo giờ địa phương từ `activity` của buổi trò chuyện và `lastReviewedAt` của sổ tay, `streaks`, `recentDays`, `progressOverview`, `relativeDayLabel`). `src/components/progress/ProgressOverview.tsx`: hiển thị trên trang chủ (ô số liệu, dải 14 ngày, cột tỷ lệ câu tự nhiên theo buổi, lỗi hay gặp lấy từ `summary.focus`). Không hiện gì khi chưa có dữ liệu. Luyện kịch bản chưa được ghi nhận vào chuỗi ngày.
- `src/lib/scripts-client.ts`: gọi `/api/scripts` từ client (`fetchScripts`, `createScript`, `updateScript`, `deleteScript`, `importScripts`).
- `src/lib/auth/session.ts`: `authMode`, tạo/kiểm tra cookie phiên, `checkAccessCode` (so sánh thời gian hằng), `safeNextPath`. Không phụ thuộc Node, chạy được trong middleware.
- `src/lib/db/mongo.server.ts`, `src/lib/db/scripts.server.ts`: **chỉ dùng ở server**. Kết nối MongoDB (`getDb`, null khi thiếu `MONGODB_URI`) và các thao tác trên collection `scripts`.
- `src/middleware.ts`: bắt buộc đăng nhập (xem mục Kiến trúc).
- `src/app/login/page.tsx`, `src/components/auth/LoginForm.tsx`: trang đăng nhập (nằm ngoài khung sidebar). `src/app/api/auth/login|logout/route.ts`: đặt/xoá cookie.
- `src/app/api/scripts/**`: API kịch bản (xem mục Kiến trúc).
- `src/lib/generate-script.ts`: logic thuần cho "AI viết kịch bản" (prompt, `GENERATE_SCHEMA`, `toGeneratedScript`, `cleanRoleName`, `SCRIPT_LENGTHS`, `TOPIC_SUGGESTIONS`).
- `src/lib/practice.ts`: `failedLineIndexes` (câu của người học bị bỏ qua, chưa trả lời hoặc dưới điểm đạt) và `buildRetryScript` (kịch bản con gồm các câu đó, mỗi câu kèm câu của đối phương ngay trước).
- `src/lib/chat/mission.ts`: logic thuần cho nhiệm vụ (`Mission`, `readMission`, `readGoalIndexes`, prompt soạn nhiệm vụ, đoạn prompt thêm cho vai AI / góp ý / tổng kết).
- `src/lib/chat/history.ts`: kiểu `ChatSession`, `ChatSessionMeta`, `readChatSessionInput` (kiểm tra dữ liệu client gửi lên), `sessionStats`, `completedGoals`. `src/lib/db/chats.server.ts`: thao tác trên collection `chats` (chỉ server). `src/lib/chats-client.ts`: gọi `/api/chats` từ client.
- `src/lib/chat/assist.ts`: logic thuần cho phần trợ giúp khi trò chuyện: `takeSentences` (tách câu đã stream xong để đọc ngay, không cắt `3.5`, `Mr.`), prompt/schema/parse của gợi ý trả lời, prompt dịch.
- `src/lib/chat/summary.ts`: logic thuần cho tổng kết (`SUMMARY_SCHEMA`, prompt, `parseSummary`) và `chatToScript` (vai `Partner` / `Me`).
- `src/lib/backup.ts`: logic thuần cho nút Xuất / Nhập kịch bản ra file `.json`. Gồm `buildBackup`, `parseBackup` (nhận cả object `{ app: "scripttalk", type: "scripts", version, exportedAt, scripts }` lẫn mảng `[{ raw, title? }]` viết tay), `mergeScripts` (trùng id thì giữ bản sửa mới hơn, trùng nội dung thì bỏ qua) và `newScriptId`. Định dạng file là hợp đồng với người dùng: giữ tương thích ngược, tăng `BACKUP_VERSION` khi đổi cấu trúc.
- `src/lib/features.ts`: danh sách các chế độ luyện tập (`FEATURES`). Sidebar, trang chủ và breadcrumb đều đọc từ đây. Thêm chế độ mới = thêm một mục ở đây (`status: "ready" | "soon"`) và tạo route `src/app/(app)/<href>/page.tsx`.
- `src/app/layout.tsx`: font Montserrat (có subset `vietnamese`, biến font gắn trên `<html>`), `ThemeProvider` (next-themes), `TooltipProvider`, `Toaster`.
- `src/app/(app)/layout.tsx`: khung của mọi trang sau đăng nhập (`SidebarProvider` + `AppSidebar` + `SidebarInset` + `AppHeader`). Route group `(app)` không đổi URL.
- `src/app/(app)/page.tsx`: trang chủ, liệt kê các chế độ dạng thẻ.
- `src/app/(app)/script/page.tsx`: route `/script`, chỉ khai báo metadata và render `ScriptPractice` trong `Suspense` (cần cho `useSearchParams`).
- `src/app/(app)/chat/page.tsx`: route `/chat` (`dynamic = "force-dynamic"` để kiểm tra key lúc chạy, không phải lúc build), render `ChatPractice`.
- `src/app/api/chat/reply/route.ts`, `src/app/api/chat/feedback/route.ts`: hai route gọi Gemini (xem mục Kiến trúc).
- `src/lib/chat/prompts.ts`: logic thuần của chế độ trò chuyện. Gồm `TOPICS`, `LEVELS`, prompt (`buildReplySystemPrompt`, `buildFeedbackSystemPrompt`, `START_INSTRUCTION`), `FEEDBACK_SCHEMA`, `parseFeedback`, `sanitizeHistory`.
- `src/lib/chat/gemini.server.ts`: **chỉ dùng ở server** (đọc `GEMINI_API_KEY`). Tạo client, `GEMINI_MODEL`, đổi lỗi SDK thành mã lỗi. Không import từ client component.
- `src/components/script/GenerateScriptDialog.tsx`: hộp thoại "AI viết kịch bản" (chủ đề, trình độ, độ dài).
- `src/components/chat/RecentChats.tsx`: danh sách buổi trò chuyện gần đây ở màn hình chọn chủ đề (mở lại, xoá). Mở lại thì `Conversation` nhận `initial` và bắt đầu ở màn hình tổng kết; "Trò chuyện tiếp" nói tiếp buổi đó với chủ đề và trình độ cũ.
- `src/components/chat/MissionBar.tsx`: thẻ nhiệm vụ (đầu cuộc trò chuyện và trong tổng kết) và dòng tiến độ nhiệm vụ trên thanh điều khiển.
- `src/components/chat/SessionSummary.tsx`: màn hình tổng kết buổi trò chuyện (thống kê, nhiệm vụ, nhận xét AI, lời thoại thu gọn, các câu đã sửa, lưu thành kịch bản, trò chuyện tiếp, buổi mới).
- `src/components/chat/ChatPractice.tsx`: màn hình chọn chủ đề, trình độ, giọng, tốc độ, và màn hình hướng dẫn khi thiếu key.
- `src/components/chat/Conversation.tsx`: phiên trò chuyện. Là máy trạng thái `thinking → speaking → listening → waiting/…`, dùng `tokenRef` như `Practice.tsx`, và huỷ thêm cả request đang chạy (`AbortController`) khi ngắt. Lời đáp được đọc theo từng câu ngay khi stream xong câu đó (chuỗi Promise nối các lần `speak`, dừng khi token đổi hoặc stream lỗi); trong lúc đang trả lời (`replying`) không cho phát câu khác. Góp ý được lấy song song và không bị huỷ khi hội thoại chạy tiếp.
- `src/app/globals.css`: Tailwind v4 và theme token của shadcn (màu chủ đạo indigo, thêm token `success`, bộ token `--sidebar-*`), sáng/tối theo class `.dark`.
- `src/components/layout/`: `AppSidebar` (menu, tự đóng sau khi chọn trên mobile, nút "Đăng xuất" khi bật mã truy cập), `AppHeader` (nút mở menu, breadcrumb, `ThemeToggle`), `ThemeToggle`.
- `src/components/script/ScriptPractice.tsx`: giữ state của chế độ kịch bản và chọn màn theo URL (`useSearchParams`, đổi màn bằng `window.history.pushState` nên nút Back của trình duyệt dùng được): `/script` thư viện, `/script?edit` soạn, `/script?id=<id>` chuẩn bị, `/script?id=<id>&play` luyện. `id` là id kịch bản đã lưu hoặc `draft` (bản nháp đang soạn, luyện thử không tính số lần). URL luyện mà không có phiên đang chạy (tải lại trang) thì quay về màn chuẩn bị. Bản nháp (`scripttalk.draft`) tách khỏi kịch bản đang luyện: bấm dòng trong thư viện không ghi đè bản nháp; mở kịch bản khác để sửa khi bản nháp có thay đổi chưa lưu thì hỏi trước. Kịch bản đã lưu đọc/ghi qua `/api/scripts`; mỗi lần chỉ chạy một thao tác lưu/xoá/nhập (`busy`). Lưu một kịch bản đã bị xoá ở thiết bị khác thì tạo bản mới thay vì mất nội dung.
- `src/components/script/ScriptLibrary.tsx`: thư viện dạng bảng (tìm kiếm, sắp xếp, số câu, số lần luyện, luyện gần nhất, nút sửa/xoá, Nhập/Xuất, banner bản nháp chưa lưu). Bấm một dòng mở màn chuẩn bị.
- `src/components/script/PracticeSetup.tsx`: màn chuẩn bị: bảng cài đặt (vai, giọng, tốc độ, chế độ hiển thị, điểm đạt, phụ đề) và nội dung kịch bản để xem trước (câu của vai mình được tô nổi).
- `src/components/script/Editor.tsx`: màn soạn: ô soạn kịch bản, "AI viết", Lưu, và "Luyện" (sang màn chuẩn bị).
- `src/components/script/Practice.tsx`: màn hình hội thoại. Là máy trạng thái `speaking → listening → result/waiting → …`, dùng `tokenRef` để huỷ callback cũ khi người dùng bỏ qua, tạm dừng hoặc nghe lại. Phím tắt cũng nằm ở đây. Thanh điều khiển là `sticky bottom-0` (không dùng `fixed`, vì sẽ đè lên sidebar).
- `src/components/ui/`, `src/hooks/use-mobile.ts`: sinh ra từ shadcn. Hạn chế sửa tay.

### Khoá localStorage

| Khoá                       | Nội dung                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `scripttalk.draft`         | `{ raw, currentId }`: kịch bản đang soạn                              |
| `scripttalk.settings`      | `Settings`: được merge với `DEFAULT_SETTINGS` khi đọc                 |
| `scripttalk.saved`         | Cũ: kịch bản đã lưu trước khi có MongoDB                              |
| `scripttalk.chat.settings` | `ChatSettings`: chủ đề, trình độ, giọng, tốc độ, bật nhiệm vụ (`mission`) |
| `scripttalk.generate`      | `{ level, length }`: lựa chọn gần nhất trong hộp thoại "AI viết"      |

## Định dạng kịch bản (hợp đồng với người dùng, giữ ổn định)

```
# At the coffee shop
A: Hi there! What can I get for you today?
B: Hi, can I have a medium latte, please?
```

Quy tắc parser:

1. Mỗi câu một dòng: `Tên vai: câu thoại`. Tên vai tùy ý (`Waiter:`, `Me:`...).
2. Dòng bắt đầu bằng `#` là tiêu đề.
3. Dòng không có tiền tố `Tên:` được **nối vào câu trước**.
4. Phần trong `(ngoặc tròn)` hoặc `[ngoặc vuông]` là ghi chú: **không đọc TTS và không tính điểm**, nhưng vẫn hiển thị.
5. Dòng trống bị bỏ qua.

Khi sửa parser:

- Kịch bản cũ đã lưu trong `localStorage` phải vẫn chạy được.
- Cập nhật README nếu thay đổi cú pháp.
- Chú ý trường hợp biên: dấu `:` nằm trong câu thoại (ví dụ `A: It's 10:30.`), dòng đầu không có tên vai, ngoặc không đóng.

## Chấm điểm

- So khớp từng từ giữa câu gốc (đã bỏ ghi chú) và transcript nhận được.
- Chuẩn hóa trước khi so: chữ thường, bỏ dấu câu, gộp khoảng trắng. Cân nhắc cả dạng viết tắt (`I'm` / `I am`) và số (`10` / `ten`).
- Kết quả phải chỉ rõ từ đúng, sai và thiếu để UI tô màu.
- Ưu tiên hàm thuần (pure function), dễ viết unit test, tách khỏi code UI.

## Lưu ý về Web Speech API

- Luôn kiểm tra hỗ trợ trước khi dùng: `window.SpeechRecognition || window.webkitSpeechRecognition`. Nếu không có, hiện thông báo dùng Chrome/Edge.
- Nếu framework có SSR, chỉ truy cập `window`, `speechSynthesis`, `localStorage` ở phía client.
- Danh sách giọng TTS tải bất đồng bộ: lắng nghe `speechSynthesis.onvoiceschanged`.
- **Dừng TTS trước khi bật mic** để mic không thu giọng máy đọc.
- Recognition có thể tự kết thúc khi im lặng (`onend`). Xử lý trạng thái cẩn thận để không bị kẹt ở "đang nghe".
- Xử lý các lỗi `not-allowed` (chưa cấp quyền mic), `no-speech`, `network`, `aborted`.
- Micro chỉ hoạt động trên `localhost` hoặc HTTPS.

## Phím tắt khi luyện

| Phím  | Tác dụng                                |
| ----- | --------------------------------------- |
| Space | Bật mic / dừng nói                      |
| Enter | Sang câu tiếp                           |
| H     | Gợi ý trả lời (chỉ ở chế độ trò chuyện) |
| Esc   | Tạm dừng                                |

Phím tắt **không được kích hoạt khi đang gõ** trong ô soạn kịch bản hoặc input. Nhớ `preventDefault` cho Space để trang không bị cuộn.

## Quy ước khi sửa code

- Giữ thay đổi nhỏ, đúng phạm vi yêu cầu.
- Logic thuần (parser, scoring, chuẩn hóa văn bản) để riêng, không phụ thuộc DOM hay Web Speech API.
- Đọc/ghi `localStorage` bọc trong `try/catch`, có giá trị mặc định khi dữ liệu hỏng hoặc thiếu. Đổi cấu trúc dữ liệu lưu thì cần migration.
- Giao diện và thông báo cho người dùng viết bằng tiếng Việt. Nội dung luyện tập là tiếng Anh (`lang = "en-US"`).

## Quy ước commit

- **Chỉ commit hoặc push khi được yêu cầu.** Không tự `git push --force` và không sửa lịch sử đã push.
- Theo [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <mô tả>`
  - `type`: `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `chore`
  - `scope` (không bắt buộc): `parser`, `scoring`, `speech`, `ui`, `storage`, `shortcuts`
  - Mô tả bằng tiếng Anh, thể mệnh lệnh, viết thường, không có dấu chấm cuối, tối đa ~72 ký tự.
- Body (nếu cần) giải thích **tại sao** thay đổi, không chỉ liệt kê cái gì đã đổi. Ghi `BREAKING CHANGE:` nếu làm đổi cú pháp kịch bản hoặc cấu trúc dữ liệu trong `localStorage`.
- Mỗi commit là một thay đổi logic. Không gộp refactor với sửa lỗi.
- Trước khi commit: chạy lint/build (nếu có) và thử lại luồng nói trên Chrome khi sửa phần `speech`.
- Không commit `node_modules/`, file build, `.env` hay file cá nhân của editor.
- Commit thẳng trên `main`, không tạo nhánh tính năng (`feat/...`, `fix/...`).

Ví dụ:

```
feat(scoring): treat contractions as equal to expanded forms
fix(parser): keep colons inside dialogue text
docs: document note syntax in README
``
- không được thêm dòng "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" vào message commit
```
