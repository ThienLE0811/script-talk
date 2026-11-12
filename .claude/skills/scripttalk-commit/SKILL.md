---
name: scripttalk-commit
description: Kiểm tra và tạo commit cho repo ScriptTalk theo quy ước Conventional Commits của dự án. Dùng khi người dùng yêu cầu commit, tạo commit message hoặc chia thay đổi thành nhiều commit.
---

# Commit trong ScriptTalk

Chỉ dùng khi người dùng **yêu cầu commit**. Không tự push, không `--force`, không sửa lịch sử đã push. Quy ước gốc nằm ở mục "Quy ước commit" trong `CLAUDE.md`.

## 1. Xem thay đổi

```bash
git status --short
git diff --stat
git diff
```

Không được đưa vào commit: `node_modules/`, `.next/`, `*.tsbuildinfo`, `next-env.d.ts`, `.env*`, file của editor. Nếu thấy chúng trong danh sách untracked/modified, bỏ qua và báo người dùng (có thể cần thêm vào `.gitignore`).

## 2. Kiểm tra trước khi commit

Chạy theo những gì đã thay đổi:

| Thay đổi | Kiểm tra |
| --- | --- |
| Bất kỳ file `.ts`/`.tsx` | `npx tsc --noEmit` và `npm run lint` |
| `src/lib/script.ts` | Skill `scripttalk-parser-cases` |
| `src/lib/speech.ts`, `src/components/Practice.tsx` | Skill `scripttalk-speech-check` (người dùng tự thử trên Chrome) |
| Chuẩn bị release | `npm run build` (dừng dev server trước vì dùng chung `.next`) |

Nếu kiểm tra lỗi: dừng lại, báo lỗi, không commit trừ khi người dùng nói vẫn commit.

## 3. Chia commit

Mỗi commit là một thay đổi logic. Không gộp refactor với sửa lỗi, không gộp tính năng với cập nhật định dạng code hàng loạt. Nếu diff chứa nhiều việc, đề xuất cách chia rồi `git add` từng nhóm file (hoặc `git add -p` khi cùng một file có hai việc; không dùng chế độ tương tác thì tách bằng patch).

Luôn `git add <đường dẫn cụ thể>`, không dùng `git add -A` hay `git add .`.

## 4. Viết message

Định dạng: `<type>(<scope>): <mô tả>`

- `type`: `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `chore`
- `scope` theo vùng code:

| Scope | Vùng code |
| --- | --- |
| `parser` | `parseScript`, `cleanForSpeech`, `hintText` trong `src/lib/script.ts` |
| `scoring` | `compareLine`, `normalizeSentence` trong `src/lib/script.ts` |
| `speech` | `src/lib/speech.ts`, luồng nói/nghe trong `Practice.tsx` |
| `storage` | `src/lib/settings.ts`, khoá `localStorage` |
| `shortcuts` | Bộ xử lý phím trong `Practice.tsx` |
| `ui` | `Editor.tsx`, `Practice.tsx` (giao diện), `page.tsx`, `globals.css`, `src/components/ui/` |

  Bỏ scope nếu thay đổi trải rộng nhiều vùng. `CLAUDE.md`, `README.md`, file trong `.claude/` dùng `docs` hoặc `chore`.
- Mô tả: tiếng Anh, thể mệnh lệnh, viết thường, không chấm cuối, ≤ ~72 ký tự.
- Body (cách một dòng trống): giải thích **tại sao**. Bắt buộc ghi `BREAKING CHANGE: ...` khi đổi cú pháp kịch bản, đổi kết quả parse/chấm điểm của kịch bản cũ, hoặc đổi cấu trúc dữ liệu `localStorage`.

Ví dụ:

```
fix(parser): keep colons inside dialogue text

Times like 10:30 were split into a new speaker line.
```

## 5. Commit

```bash
git commit -F - <<'MSG'
<message>
MSG
git log --oneline -3
```

Báo lại cho người dùng hash và message của từng commit, và nhắc rằng chưa push.
