# ADR-0010: Biên dịch theo browserslist, bỏ polyfill

- Trạng thái: Chấp nhận
- Ngày: 2026-10-21
- Liên quan: [ADR-0001](0001-nen-tang-excel-muc-tieu.md) (IE11/EdgeHTML không hỗ trợ), prompts/14, prompts/17

## Bối cảnh

Template Yeoman ban đầu có hai thiết lập phục vụ IE11:
- entry `polyfill` (gồm `core-js/stable` và `regenerator-runtime`) nặng 236 KiB (77 KiB gzip), luôn được tải trước `taskpane.js`;
- Babel đặt `targets: { esmodules: false }`, tức biên dịch xuống ES5.

Tuy nhiên ADR-0001 đã quyết định IE11/EdgeHTML **không được hỗ trợ**: `compat-gate.js` (ES5, chạy trước bundle) chỉ hiện thông báo trên các webview đó, không tải ứng dụng. `package.json` cũng đã có `browserslist` loại IE11 (`defaults, safari >= 13, not ie 11, not dead`).

## Quyết định

- Bỏ entry `polyfill`.
- Babel `preset-env` dùng `browserslist` của dự án thay cho `esmodules: false`.
- `compat-gate.js` giữ nguyên ES5 và được chép thẳng, không qua Babel.
- API duy nhất có nguy cơ vượt Safari 13 là `crypto.randomUUID` (cần Safari 15.4); polyfill cũng không bù được API này. Thay bằng `randomId()` có dự phòng `crypto.getRandomValues` (`src/shared/uuid.ts`, có unit test).

## Hệ quả

- **Trang tải ít hơn 236 KiB** (77 KiB gzip). Thời gian render lần đầu đo được là 0,31 s (trước đó 0,34–0,50 s).
- Đã chạy lại các luồng chính trên Excel Windows (WebView2), không có lỗi.
- Chưa kiểm thử Excel trên Mac với Safari 13–15. Nếu phát hiện thiếu API, chỉ thêm polyfill cho đúng API đó, không thêm lại `core-js` đầy đủ.
