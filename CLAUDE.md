# CLAUDE.md

Hướng dẫn cho Claude khi làm việc trong repo **ScriptTalk**: ứng dụng web luyện hội thoại tiếng Anh theo kịch bản. Máy đọc các vai còn lại (TTS), người dùng nói vai của mình (Speech Recognition) và được chấm điểm từng từ.

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

Thêm component shadcn/ui bằng `npx shadcn@latest add <tên>` (cấu hình trong `components.json`, style `radix-nova`). Các component trong `src/components/ui/` import `cn` từ package `cn` của shadcn, đây là bình thường.

Kiểm thử thủ công bằng **Chrome hoặc Edge** và cho phép micro. Firefox/Safari không hỗ trợ đầy đủ Speech Recognition, nên không dùng để xác nhận tính năng nói.

## Kiến trúc

- **Chỉ có frontend, không có backend.** Mọi xử lý giọng nói dùng Web Speech API của trình duyệt:
  - `speechSynthesis` (TTS): đọc câu của các vai máy.
  - `SpeechRecognition` / `webkitSpeechRecognition`: nhận câu người dùng nói.
- Speech Recognition của Chrome gửi âm thanh lên server Google nên **cần Internet**. Không có mạng thì lỗi `network`, cần báo lỗi rõ cho người dùng.
- **Lưu trữ:** kịch bản và cài đặt nằm trong `localStorage`. Không có database và tài khoản.
- Không tự thêm backend, API key, dịch vụ STT/TTS bên ngoài hay thư viện nặng nếu chưa được yêu cầu.

### Cấu trúc thư mục

- `src/lib/script.ts`: logic thuần, không phụ thuộc DOM. Gồm parser (`parseScript`), chấm điểm (`compareLine`, `normalizeSentence`), `cleanForSpeech` (bỏ ghi chú trước khi đọc), `hintText` (chế độ gợi ý) và `SAMPLE_SCRIPT`.
- `src/lib/speech.ts`: bọc Web Speech API. `useEnglishVoices` (danh sách giọng tiếng Anh, giọng tốt xếp trước), `speak` / `stopSpeaking`, `startListening` (tự dừng sau ~1,6 giây im lặng hoặc tối đa 25 giây), `isRecognitionSupported`.
- `src/lib/settings.ts`: kiểu `Settings`, `SavedScript`, giá trị mặc định và các hàm đọc/ghi `localStorage` có `try/catch`.
- `src/app/page.tsx`: trang duy nhất. Giữ state, chuyển giữa chế độ soạn (`edit`) và luyện (`practice`), lưu dữ liệu.
- `src/app/layout.tsx`: font Montserrat (có subset `vietnamese`), `ThemeProvider` (next-themes), `TooltipProvider`, `Toaster`.
- `src/app/globals.css`: Tailwind v4 và theme token của shadcn (màu chủ đạo indigo, thêm token `success`), sáng/tối theo class `.dark`.
- `src/components/Editor.tsx`: ô soạn kịch bản, danh sách kịch bản đã lưu và bảng cài đặt (vai, giọng, tốc độ, chế độ hiển thị, điểm đạt).
- `src/components/Practice.tsx`: màn hình hội thoại. Là máy trạng thái `speaking → listening → result/waiting → …`, dùng `tokenRef` để huỷ callback cũ khi người dùng bỏ qua, tạm dừng hoặc nghe lại. Phím tắt cũng nằm ở đây.
- `src/components/ThemeToggle.tsx`: nút chuyển sáng/tối.
- `src/components/ui/`: component sinh ra từ shadcn. Hạn chế sửa tay.

### Khoá localStorage

| Khoá                  | Nội dung                                              |
| --------------------- | ----------------------------------------------------- |
| `scripttalk.draft`    | `{ raw, currentId }`: kịch bản đang soạn              |
| `scripttalk.settings` | `Settings`: được merge với `DEFAULT_SETTINGS` khi đọc |
| `scripttalk.saved`    | `SavedScript[]`: các kịch bản đã lưu                  |

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

| Phím  | Tác dụng           |
| ----- | ------------------ |
| Space | Bật mic / dừng nói |
| Enter | Sang câu tiếp      |
| Esc   | Tạm dừng           |

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
- Tên nhánh: `<type>/<mô-tả-ngắn>`, ví dụ `feat/repeat-line`, `fix/colon-in-dialogue`.

Ví dụ:

```
feat(scoring): treat contractions as equal to expanded forms
fix(parser): keep colons inside dialogue text
docs: document note syntax in README
```
