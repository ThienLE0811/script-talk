---
name: scripttalk-parser-cases
description: Chạy bộ case kiểm tra parser kịch bản và chấm điểm của ScriptTalk. Dùng mỗi khi sửa src/lib/script.ts (parseScript, cleanForSpeech, normalizeSentence, compareLine, hintText) hoặc khi người dùng báo kịch bản bị tách câu hay chấm điểm sai.
---

# Kiểm tra parser và chấm điểm

Dự án chưa có unit test. Bộ case trong `check.mts` (cùng thư mục với file này) là lưới an toàn cho `src/lib/script.ts`. Mọi kịch bản đã lưu trong `localStorage` (`scripttalk.saved`, `scripttalk.draft`) là văn bản thô và được parse lại mỗi lần mở, nên **sửa parser là sửa luôn mọi kịch bản cũ của người dùng**.

## Chạy

```bash
node .claude/skills/scripttalk-parser-cases/check.mts
```

Cần Node ≥ 22.18 (chạy được TypeScript trực tiếp). Với Node cũ hơn: `node --experimental-strip-types ...`. Lệnh in `N passed, M failed` và trả mã lỗi 1 nếu có case sai.

## Quy trình khi sửa `src/lib/script.ts`

1. **Chạy bộ case trước khi sửa** để biết trạng thái ban đầu.
2. Nếu đang sửa một lỗi: **thêm case tái hiện lỗi trước**, chạy để thấy nó FAIL, rồi mới sửa code.
3. Sửa code, chạy lại. Tất cả phải PASS.
4. Nếu một case cũ FAIL:
   - Không tự sửa kỳ vọng của case cho khớp với code mới.
   - Xác định đó là lỗi mới (sửa code) hay là thay đổi hành vi có chủ đích.
   - Nếu có chủ đích: hỏi người dùng xác nhận, rồi mới cập nhật case. Đồng thời cập nhật README (mục Kịch bản) và CLAUDE.md (Quy tắc parser), và ghi `BREAKING CHANGE:` khi commit nếu kịch bản cũ sẽ hiển thị hay chấm điểm khác đi.
5. Chạy `npx tsc --noEmit` để chắc chắn không vỡ type.

## Trường hợp biên cần nghĩ tới

- Dấu `:` trong câu thoại (`A: It's 10:30.`): chỉ dấu `:` đầu tiên tách tên vai.
- Tên vai: tối đa 25 ký tự, **không được chứa chữ số hay ngoặc** (theo `SPEAKER_RE`). Dòng như `Person1: Hi` hiện bị coi là dòng nối tiếp.
- Dòng không có tên vai ở đầu kịch bản bị bỏ; ở giữa thì nối vào câu trước.
- Ghi chú `(...)` / `[...]`: vẫn hiển thị, không đọc, không chấm, được đánh dấu `neutral`. Ghi chú nhiều từ và ngoặc không đóng.
- Viết tắt (`I'm`, `don't`, `can't`, `won't`), dấu nháy cong `’`, số 0–20 so với chữ, `okay`/`ok`, dấu gạch nối.
- Câu chỉ có ghi chú hoặc người dùng không nói gì.

Khi thêm case mới, dùng các hàm `check(tên, thực tế, kỳ vọng)` có sẵn và xếp vào đúng nhóm (`parseScript`, `cleanForSpeech`, `normalizeSentence`, `compareLine`).
