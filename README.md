# ScriptTalk

Ứng dụng web luyện nói tiếng Anh, gồm nhiều chế độ luyện tập chọn từ menu bên trái:

| Chế độ | Đường dẫn |
| --- | --- |
| Luyện theo kịch bản: máy đọc các vai còn lại, bạn nói vai của mình và được chấm điểm từng từ | `/script` |
| Trò chuyện tự nhiên: nói chuyện tự do với AI theo chủ đề, được góp ý ngữ pháp sau mỗi câu | `/chat` |
| Sổ tay câu: các câu đã được sửa và câu còn nói chưa tốt, ôn theo lịch nhắc lại (nghe mẫu → nói lại → chấm điểm) | `/phrases` |

Vòng luyện tập gợi ý:

1. **AI viết kịch bản**: bấm "AI viết" ở chế độ kịch bản, nhập tình huống (tiếng Việt cũng được). Gemini soạn hội thoại hai vai và chọn sẵn vai cho bạn.
2. **Luyện kịch bản**: hết bài, bấm "Luyện lại N câu chưa đạt" để chỉ luyện những câu dưới điểm đạt (kèm câu dẫn của đối phương).
3. **Trò chuyện tự do** theo cùng chủ đề. Bấm "Kết thúc" để xem tổng kết: điểm mạnh, lỗi cần luyện, cụm từ nên học.
4. **Lưu thành kịch bản** từ màn hình tổng kết: câu của bạn được thay bằng bản đã sửa, rồi luyện lại cho thuộc.
5. **Ôn sổ tay câu** mỗi ngày: câu được AI sửa tự vào sổ tay; câu chưa đạt khi luyện kịch bản và các cụm từ trong tổng kết có nút lưu. Câu đạt được nhắc lại thưa dần (1, 2, 4, 8… ngày), câu chưa đạt được nhắc lại ngay lần sau. Trang chủ nhắc khi có câu cần ôn.

Các bước 1, 3, 4 cần Gemini API key (xem phần cấu hình bên dưới).

## Chạy

```bash
npm install
npm run dev
```

Mở http://localhost:3000 bằng **Chrome hoặc Edge** (cần nhận giọng nói) và cho phép micro.

Mọi cấu hình nằm trong `.env.local` (chép từ `.env.example`). File này đã nằm trong `.gitignore`. Sửa xong thì dev server tự nạp lại.

### Mã truy cập (đăng nhập)

Ứng dụng dành cho một người dùng: ai muốn vào phải nhập đúng mã ở trang `/login`.

- `APP_ACCESS_CODE`: mã truy cập. Nên là một cụm dài, khó đoán.
- Ở máy cá nhân có thể để trống để bỏ qua màn hình đăng nhập khi phát triển.
- **Trên production (Vercel), thiếu biến này thì toàn bộ trang bị khoá**, để không bao giờ lỡ mở công khai.
- Đổi mã thì mọi thiết bị đang đăng nhập sẽ bị đăng xuất.

### Cơ sở dữ liệu (MongoDB)

Kịch bản đã lưu nằm trong MongoDB, nên dùng chung được giữa máy tính, điện thoại, localhost và Vercel.

1. Tạo tài khoản [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) và một cluster **M0 (miễn phí)**. Nên chọn region gần Vercel, ví dụ Singapore.
2. Tạo database user, rồi mục **Network Access** cho phép `0.0.0.0/0` (Vercel không có IP cố định).
3. Lấy connection string (`mongodb+srv://…`) rồi đặt vào `MONGODB_URI`. Hoặc dùng tích hợp MongoDB Atlas trong Vercel Marketplace để biến này được điền tự động.

Kịch bản đã lưu trong trình duyệt từ trước khi có database sẽ hiện thông báo **"Chuyển lên server"** ở mục "Đã lưu". Bấm một lần là xong.

### Deploy lên Vercel

Đặt các biến `APP_ACCESS_CODE`, `MONGODB_URI`, `GEMINI_API_KEY` trong **Project Settings → Environment Variables**, rồi deploy lại.

### Cấu hình AI cho chế độ trò chuyện

Chế độ trò chuyện, góp ý, tổng kết và nút "AI viết" dùng Gemini API của Google. Luyện kịch bản tự soạn không cần bước này.

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

Kịch bản đã lưu nằm trên server (MongoDB). Nút **Xuất** ở mục "Đã lưu" tải toàn bộ kịch bản về file `.json` để sao lưu, còn **Nhập** đưa file đó trở lại. Khi nhập: kịch bản đã có thì bỏ qua, cùng một kịch bản nhưng bản trong file mới hơn thì được cập nhật, còn lại được thêm vào; không bao giờ xoá.

## Cách hoạt động

- Giọng nói xử lý ngay trên trình duyệt bằng Web Speech API (Text-to-Speech + Speech Recognition). Speech Recognition của Chrome gửi âm thanh lên server Google nên cần Internet.
- Luyện và chấm điểm kịch bản chạy ngay trên trình duyệt.
- Backend là các API route của Next.js: `/api/scripts/*` đọc/ghi MongoDB, còn `/api/chat/*` và `/api/script/generate` gọi Gemini. Chỉ có câu chữ đi qua server, không có âm thanh.
- Mọi trang và API đều cần đăng nhập bằng mã truy cập (middleware), nên người khác có link cũng không đọc được dữ liệu hay dùng lượt Gemini của bạn.
- Bản nháp đang soạn và cài đặt (vai, giọng, tốc độ…) lưu trong `localStorage` vì gắn với từng thiết bị. Cuộc trò chuyện chưa được lưu (trừ khi bấm "Lưu thành kịch bản").

## Phím tắt khi luyện

| Phím | Kịch bản | Trò chuyện |
| --- | --- | --- |
| Space | Bật mic / dừng nói | Bật mic / dừng nói |
| Enter | Sang câu tiếp | — |
| Esc | Tạm dừng | Tạm dừng |
