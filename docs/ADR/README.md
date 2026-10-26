# Architecture Decision Records — ConsQuotation

Mỗi ADR ghi một quyết định kiến trúc quan trọng: bối cảnh, quyết định, hệ quả và những điểm còn phải xác minh trong Excel thật.

| ADR | Tiêu đề | Trạng thái | Ngày |
|---|---|---|---|
| [0001](0001-nen-tang-excel-muc-tieu.md) | Nền tảng Excel mục tiêu | Chấp nhận | 2026-10-19 |
| [0002](0002-manifest-va-requirement-set.md) | Loại manifest và requirement set tối thiểu | Chấp nhận | 2026-10-19 |
| [0003](0003-luu-tru-thu-vien-ca-nhan.md) | Lưu trữ thư viện cá nhân | Chấp nhận | 2026-10-19 |
| [0004](0004-import-export-thu-vien.md) | Import/export và backup thư viện | Chấp nhận — đã triển khai | 2026-10-19 |
| [0005](0005-hosting-va-trien-khai.md) | Hosting và triển khai | Chấp nhận (mục mở giải quyết bởi ADR-0007) | 2026-10-19 |
| [0006](0006-cong-nghe-ui-va-cong-cu.md) | Công nghệ UI và công cụ phát triển | Chấp nhận | 2026-10-19 |
| [0007](0007-hosting-github-pages.md) | Hosting production trên GitHub Pages | Chấp nhận | 2026-10-19 |
| [0008](0008-tinh-don-gia-va-thanh-tien.md) | Tính đơn giá và thành tiền | Chấp nhận | 2026-10-21 |
| [0009](0009-mau-bao-gia-va-in-an.md) | Mẫu báo giá, ghi chú/điều khoản và in ấn | Chấp nhận | 2026-10-21 |
| [0010](0010-dich-theo-browserslist-bo-polyfill.md) | Biên dịch theo browserslist, bỏ polyfill | Chấp nhận | 2026-10-21 |
| [0011](0011-lop-thao-tac-excel-dung-chung.md) | Lớp thao tác Excel dùng chung | Đề xuất | 2026-10-26 |
| [0012](0012-danh-muc-nha-cung-cap-schema-v2.md) | Danh mục, nhà cung cấp và schema thư viện v2 | Chấp nhận | 2026-10-26 |

Trạng thái có thể là: Đề xuất · Chấp nhận · Thay thế bởi ADR-xxxx · Hủy bỏ.

Khi một quyết định thay đổi, tạo ADR mới và đánh dấu ADR cũ là "Thay thế bởi"; không sửa nội dung ADR đã chấp nhận ngoài phần "Kết quả xác minh".
