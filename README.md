# ScriptTalk

Ứng dụng web luyện nói tiếng Anh, gồm nhiều chế độ luyện tập chọn từ menu bên trái:

| Chế độ | Đường dẫn |
| --- | --- |
| Luyện theo kịch bản: máy đọc các vai còn lại, bạn nói vai của mình và được chấm điểm từng từ | `/script` |
| Trò chuyện tự nhiên: nói chuyện tự do với AI theo chủ đề, được góp ý ngữ pháp sau mỗi câu | `/chat` |

## Chạy

```bash
npm install
npm run dev
```

Mở http://localhost:3000 bằng **Chrome hoặc Edge** (cần nhận giọng nói) và cho phép micro.

### Cấu hình AI cho chế độ trò chuyện

Chế độ trò chuyện dùng Gemini API của Google. Chế độ kịch bản không cần bước này.

1. Tạo API key tại [Google AI Studio](https://aistudio.google.com/apikey). Nếu có gói Google AI Pro, kích hoạt tín dụng Google Cloud ở trang My Benefits và gắn vào project của key.
2. Chép `.env.example` thành `.env.local` rồi điền key:

   ```bash
   GEMINI_API_KEY=key-của-bạn
   ```

3. Khởi động lại `npm run dev`.

`.env.local` đã nằm trong `.gitignore`, không bị commit. Key chỉ được đọc ở server.

## Luyện theo kịch bản

```
# At the coffee shop
A: Hi there! What can I get for you today?
B: Hi, can I have a medium latte, please?
```

- Mỗi câu một dòng: `Tên vai: câu thoại`. Tên vai đặt tùy ý (`Waiter:`, `Me:`...).
- `#` ở đầu dòng là tiêu đề. Một dòng không có `Tên:` sẽ được nối vào câu trước.
- Ghi chú trong `(ngoặc)` hoặc `[ngoặc vuông]` không được đọc và không tính điểm.

Kịch bản đã lưu nằm trong trình duyệt (`localStorage`), riêng theo từng trình duyệt và từng địa chỉ (kể cả khác cổng). Dùng nút **Xuất** ở mục "Đã lưu" để tải toàn bộ kịch bản về file `.json`, và **Nhập** để mở lại trên trình duyệt hoặc máy khác. Khi nhập: kịch bản đã có thì bỏ qua, cùng một kịch bản nhưng bản trong file mới hơn thì được cập nhật, còn lại được thêm vào.

## Cách hoạt động

- Giọng nói xử lý ngay trên trình duyệt bằng Web Speech API (Text-to-Speech + Speech Recognition). Speech Recognition của Chrome gửi âm thanh lên server Google nên cần Internet.
- Chế độ kịch bản chạy hoàn toàn trên trình duyệt.
- Chế độ trò chuyện gửi câu chữ (không gửi âm thanh) tới hai API route của Next.js (`/api/chat/reply`, `/api/chat/feedback`). Hai route này gọi Gemini; câu trả lời được truyền về từng phần rồi đọc to.
- Kịch bản và cài đặt được lưu trong `localStorage` của trình duyệt. Cuộc trò chuyện không được lưu.
- Các API route chưa có xác thực. Đừng deploy công khai khi chưa thêm bảo vệ, nếu không người khác có thể dùng hết tín dụng của key.

## Phím tắt khi luyện

| Phím | Kịch bản | Trò chuyện |
| --- | --- | --- |
| Space | Bật mic / dừng nói | Bật mic / dừng nói |
| Enter | Sang câu tiếp | — |
| Esc | Tạm dừng | Tạm dừng |
