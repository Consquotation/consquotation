# Implementation Roadmap

## Giai đoạn 0 — Xác minh
Chốt Excel mục tiêu, offline, storage và triển khai; xác minh API requirement sets; ghi ADR.

## Giai đoạn 1 — Scaffold
Tạo Office.js add-in, TypeScript, lint/typecheck/test/build, Ribbon command, task pane và hướng dẫn sideload. Nghiệm thu: mở được trong Excel mục tiêu.

## Giai đoạn 2 — Workbook adapter
Đọc workbook/sheet/selection; tạo mẫu an toàn; chèn bảng và công tác; kiểm tra vùng đích. Nghiệm thu: không phá dữ liệu ngoài vùng.

## Giai đoạn 3 — Thư viện cá nhân
Mô hình WorkItem/Resource/ResourcePrice/NormDefinition; CRUD/search; storage; import/export có schema version. Nghiệm thu: backup/restore được.

## Giai đoạn 4 — Báo giá cơ bản
Chèn công tác, nhập khối lượng/đơn giá, thành tiền/tổng, validation. Nghiệm thu: test cases tính toán đạt.

## Giai đoạn 5 — Định giá nâng cao
Phân tích cấu thành, nguồn giá, ngày hiệu lực, cấu hình điều chỉnh thương mại và truy vết.

## Giai đoạn 6 — Hoàn thiện
Mẫu/in, hiệu năng, tương thích, bảo mật, regression, tài liệu và triển khai.

Không chuyển giai đoạn khi còn lỗi nghiêm trọng mà chưa được ghi nhận và chấp thuận.
