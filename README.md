# ScriptTalk

Ứng dụng web luyện nói tiếng Anh, gồm nhiều chế độ luyện tập chọn từ menu bên trái:

| Chế độ | Đường dẫn | Trạng thái |
| --- | --- | --- |
| Luyện theo kịch bản: máy đọc các vai còn lại, bạn nói vai của mình và được chấm điểm từng từ | `/script` | Đã có |
| Trò chuyện tự nhiên: nói chuyện tự do theo chủ đề, không cần kịch bản | `/chat` | Sắp ra mắt |

## Chạy

```bash
npm install
npm run dev
```

Mở http://localhost:3000 bằng **Chrome hoặc Edge** (cần nhận giọng nói) và cho phép micro.

## Luyện theo kịch bản

```
# At the coffee shop
A: Hi there! What can I get for you today?
B: Hi, can I have a medium latte, please?
```

- Mỗi câu một dòng: `Tên vai: câu thoại`. Tên vai đặt tùy ý (`Waiter:`, `Me:`...).
- `#` ở đầu dòng là tiêu đề. Một dòng không có `Tên:` sẽ được nối vào câu trước.
- Ghi chú trong `(ngoặc)` hoặc `[ngoặc vuông]` không được đọc và không tính điểm.

## Cách hoạt động

- Không cần backend: dùng Web Speech API của trình duyệt (Text-to-Speech + Speech Recognition).
- Speech Recognition của Chrome gửi âm thanh lên server Google nên cần Internet.
- Kịch bản và cài đặt được lưu trong `localStorage` của trình duyệt.

## Phím tắt khi luyện

| Phím | Tác dụng |
| --- | --- |
| Space | Bật mic / dừng nói |
| Enter | Sang câu tiếp |
| Esc | Tạm dừng |
