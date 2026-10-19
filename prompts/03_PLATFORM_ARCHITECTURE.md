# Platform and Architecture

Ưu tiên Office JavaScript Add-in (Office.js), TypeScript, HTML/CSS và scaffold Office Add-in đang được Microsoft hỗ trợ. Xác minh tài liệu/API requirement sets hiện hành trước khi triển khai.

## Phân lớp gợi ý
- `manifest/`: manifest và khai báo lệnh.
- `src/taskpane/`: UI task pane.
- `src/commands/`: ribbon/command handlers.
- `src/office/`: wrapper/adapter Office.js.
- `src/domain/`: entities và business rules.
- `src/application/`: use cases, validation, orchestration.
- `src/storage/`: interface và storage implementations.
- `src/import-export/`: parser, validator, serializer.
- `src/shared/`: types, constants, utilities.
- `tests/`: unit/integration tests.

Điều chỉnh theo scaffold thực tế; không đổi cấu trúc chỉ để khớp ví dụ.

## Quy tắc
- Domain không phụ thuộc DOM hoặc Office.js.
- Gom tương tác Excel vào adapter; dùng `Excel.run` và `context.sync()` đúng cách.
- Không giữ Office.js proxy object ra ngoài batch context.
- Validate dữ liệu trước khi ghi workbook.
- Có abstraction cho storage; không gắn logic nghiệp vụ vào một backend.
- Dùng TypeScript strict mode nếu tương thích.
- Ghi ADR cho quyết định về nền tảng, storage, import/export và triển khai.
