---
name: scripttalk-speech-check
description: Rà soát code và lập danh sách thử tay trên Chrome cho phần đọc (TTS) và nghe (Speech Recognition) của ScriptTalk. Dùng sau khi sửa src/lib/speech.ts, luồng luyện tập hoặc phím tắt trong src/components/Practice.tsx, hoặc khi người dùng báo lỗi mic, giọng đọc, bị kẹt ở trạng thái đang nghe.
---

# Kiểm tra phần nói và nghe

Claude không dùng được micro, nên skill này có hai phần: **Claude tự rà soát code**, rồi **đưa người dùng danh sách thử tay** chỉ gồm những mục liên quan đến thay đổi.

## Phần 1: Claude rà soát code

Đọc diff (`git diff src/lib/speech.ts src/components/Practice.tsx src/app/page.tsx`) và kiểm tra:

**Máy trạng thái trong `Practice.tsx`** (`speaking → listening → result/waiting → … → done`, cùng `paused`):
- Mọi callback bất đồng bộ (`speak().then`, `setTimeout`, `onInterim`, `onDone`) đều kiểm tra `tokenRef.current === token` trước khi đổi state.
- Mọi thao tác ngắt luồng (bỏ qua, tạm dừng, nghe lại, rời màn hình) đều gọi `interrupt()` hoặc tăng `tokenRef`, và `abort()` recognition đang chạy.
- Không có đường nào để phase kẹt ở `listening` hoặc `speaking` khi recognition/TTS kết thúc bằng lỗi.

**`src/lib/speech.ts`**:
- `startListening` gọi `onDone` **đúng một lần** (cờ `ended`), kể cả khi `start()` ném lỗi.
- Cả hai timer (im lặng ~1,6 giây, tối đa 25 giây) đều được `clearTimeout` trong `onend` và `abort`.
- `speak` giữ tham chiếu `activeUtterance` (Chrome có thể thu hồi utterance trước khi `onend` chạy) và luôn resolve, kể cả khi lỗi.
- TTS được dừng trước khi mở mic, để mic không thu giọng máy.

**SSR và hỗ trợ trình duyệt**:
- `window`, `speechSynthesis`, `localStorage` chỉ được truy cập trong `useEffect` hoặc handler, không ở top-level module hay khi render.
- Trình duyệt không hỗ trợ (`isRecognitionSupported()` = false) vẫn dùng được: `Editor.tsx` hiện thông báo tiếng Việt, `Practice.tsx` chuyển sang ô gõ câu trả lời.

**Lỗi recognition**: có thông báo tiếng Việt rõ ràng cho `not-allowed` / `service-not-allowed`, `network`, `no-speech`; `aborted` (do chính app huỷ) không hiện lỗi.

**Phím tắt**: không chạy khi focus ở `INPUT`, `TEXTAREA`, `SELECT`; có `preventDefault` cho Space và Enter; listener được gỡ khi unmount.

Báo các vấn đề tìm thấy kèm file và dòng trước khi đưa danh sách thử tay.

## Phần 2: Danh sách thử tay cho người dùng

Dùng `npm run dev`, mở http://localhost:3000 trên **Chrome hoặc Edge**. Chỉ đưa những mục liên quan đến thay đổi, giữ nguyên dạng checkbox để người dùng đánh dấu:

**Luồng cơ bản**
- [ ] Chọn vai B với kịch bản mẫu, bấm luyện: máy đọc câu A, rồi tự bật mic ở câu B.
- [ ] Nói đúng câu: hiện điểm, từ đúng tô xanh.
- [ ] Nói thiếu một từ: từ đó bị tô là thiếu, điểm giảm.
- [ ] Im lặng sau khi nói khoảng 1,6 giây thì mic tự dừng và chấm điểm.
- [ ] Đi hết kịch bản: hiện màn hình kết thúc.

**Ngắt luồng**
- [ ] Bấm Esc khi máy đang đọc: giọng đọc dừng ngay, không tự sang câu sau.
- [ ] Tiếp tục sau khi tạm dừng: hội thoại chạy tiếp từ đúng câu đang dở.
- [ ] Bấm nghe lại một câu khi máy đang đọc: đọc xong câu đó thì hội thoại chạy tiếp.
- [ ] Bấm Enter / bỏ qua khi đang nghe: mic tắt, không bị chấm điểm câu cũ chèn vào câu mới.
- [ ] Bấm nghe lại nhiều lần liên tiếp: không có hai giọng đọc chồng nhau.
- [ ] Thoát màn hình luyện khi đang đọc hoặc đang nghe: giọng đọc và mic tắt ngay.

**Lỗi**
- [ ] Chặn quyền micro trong trình duyệt: hiện thông báo cho phép micro, không bị kẹt.
- [ ] Tắt mạng (DevTools → Network → Offline) rồi nói: hiện thông báo lỗi mạng.
- [ ] Bật mic nhưng không nói gì: hiện "Chưa nghe thấy gì", bấm Space để thử lại được.

**Phím tắt**
- [ ] Space bật/tắt mic, Enter sang câu tiếp, Esc tạm dừng.
- [ ] Gõ dấu cách trong ô soạn kịch bản: không bật mic, trang không cuộn.

**Giọng và cài đặt**
- [ ] Đổi giọng và tốc độ trong cài đặt: lần đọc sau dùng giọng/tốc độ mới.
- [ ] Tải lại trang: cài đặt vẫn được giữ.

**Trình duyệt khác**
- [ ] Mở trên Firefox: trang vẫn chạy, có thông báo nên dùng Chrome/Edge, và đến lượt mình thì gõ được câu trả lời để chấm điểm.
