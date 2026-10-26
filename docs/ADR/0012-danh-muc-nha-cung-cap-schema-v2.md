# ADR-0012: Danh mục, nhà cung cấp và schema thư viện v2

- Trạng thái: Chấp nhận (triển khai trong bản 1.9.0, chờ người dùng duyệt trước khi phát hành)
- Ngày: 2026-10-26
- Liên quan: [ADR-0003](0003-luu-tru-thu-vien-ca-nhan.md) (lưu trữ thư viện), [ADR-0004](0004-import-export-thu-vien.md) (nhập/xuất), [ADR-0011](0011-lop-thao-tac-excel-dung-chung.md) (lớp thao tác Excel)

## Bối cảnh

Giai đoạn "thư viện đơn giá cá nhân" yêu cầu:
- danh mục do người dùng quản lý: thêm, đổi tên, xóa có xử lý bản ghi liên quan, đếm số bản ghi;
- nhà cung cấp ở mức cơ bản (tên, liên hệ, ghi chú);
- lọc theo danh mục, loại, nhà cung cấp; sắp xếp theo mã, tên, đơn giá;
- nhập từ vùng dữ liệu hoặc Excel Table.

Bản 1.8.0 (schema v1) chỉ có "Nhóm" dạng chữ tự do trên công tác. Vì vậy không có nhóm rỗng, đổi tên phải sửa từng công tác, tài nguyên không có nhóm, và không có nhà cung cấp.

Mô hình đề xuất trong yêu cầu là một bảng "đơn giá" phẳng có `itemType` (vật liệu, nhân công, máy, công tác tổng hợp). Thư viện hiện tại đã tách thành hai loại:
- công tác (đơn giá tổng hợp, có thể có định mức);
- tài nguyên (vật liệu, nhân công, máy, khác), mỗi tài nguyên có nhiều giá theo thời gian.

Cách tách này đã được thống nhất ở prompts/08 và dùng cho phân tích đơn giá (ADR-0008).

## Quyết định

1. **Giữ nơi lưu trữ.** Nguồn dữ liệu chính vẫn là IndexedDB của add-in (ADR-0003). Sao lưu, khôi phục và chuyển máy vẫn dùng file JSON và workbook Excel (ADR-0004). Không thêm máy chủ hay dịch vụ đám mây.
2. **Giữ cách tách công tác / tài nguyên.** Không gộp thành bảng đơn giá phẳng. `itemType` của yêu cầu ứng với:
   - công tác = "công tác tổng hợp";
   - tài nguyên = `type` (vật liệu, nhân công, máy thi công, khác).
3. **Thêm hai loại bản ghi có id:**
   - `Category {id, name, notes}`. Công tác và tài nguyên có `categoryId` (null = chưa phân nhóm).
   - `Supplier {id, name, contactInfo, notes}`. Công tác và giá tài nguyên có `supplierId`.
   - Trường "Nguồn giá" dạng chữ vẫn giữ.
4. **Tên danh mục và nhà cung cấp duy nhất.** So sánh bỏ khoảng trắng thừa, không phân biệt hoa thường, nhưng **giữ dấu** ("Cát" khác "Cạt").
5. **Xóa có kiểm soát.**
   - Xóa danh mục không bao giờ xóa công tác hay tài nguyên. Người dùng chọn chuyển chúng sang danh mục khác hoặc bỏ phân nhóm, trong một giao dịch.
   - Xóa nhà cung cấp chỉ bỏ liên kết; giá và nguồn giá giữ nguyên.
6. **Nâng cấp IndexedDB v1 → v2** trong giao dịch `versionchange`. Lỗi thì database giữ nguyên v1.
   - Mỗi tên "Nhóm" cũ thành một danh mục. Các tên chỉ khác hoa thường hoặc khoảng trắng gộp làm một.
   - Không mất bản ghi nào.
7. **Schema trao đổi v2.**
   - Thêm sheet/loại "Nhóm" và "Nhà cung cấp".
   - Thêm cột "Nhóm" cho tài nguyên, "Nhà cung cấp" cho công tác và giá.
   - Dạng bảng tham chiếu nhóm và nhà cung cấp **bằng tên**. JSON tham chiếu bằng id và có thêm `library.name`.
   - File v1 vẫn nhập được: cột `group` của v1 thành danh mục.
8. **Tạo nhóm/nhà cung cấp khi nhập.** Tên chưa có trong cột Nhóm/Nhà cung cấp được tạo mới, nhưng chỉ khi dòng hợp lệ và thực sự được thêm hoặc cập nhật. Bản xem trước liệt kê các tên sẽ tạo; hộp xác nhận nêu số lượng.
9. **Mã trùng vẫn bị chặn** (quy tắc từ prompts/08, chặt hơn mức "cảnh báo" của yêu cầu), vì mã là khóa so khớp khi nhập/xuất. **Tên trùng chỉ cảnh báo**, không tự gộp.
10. **Quy tắc giá giữ nguyên:**
    - giá âm bị từ chối;
    - giá 0 được lưu và Kiểm tra thư viện cảnh báo;
    - đơn giá công tác để trống là "chưa có giá" (khác 0), vì giá có thể đến từ định mức.
11. **Nhập từ Excel Table.** `WorkbookGateway.listTables()` và `readTableSource()` dùng `listTables` và `requireTable` của lớp core (ADR-0011), chỉ đọc.

## Hệ quả

- Bản 1.9.0 nâng cấp thư viện của người dùng ngay lần đầu mở tab Thư viện. Nếu sau đó quay về bản 1.8.0, add-in báo "thư viện được tạo bởi phiên bản mới hơn" và không ghi đè.
- File sao lưu của 1.9.0 (schema 2) không nhập được vào 1.8.0. File của 1.8.0 nhập được vào 1.9.0.
- Nhóm trên dòng báo giá vẫn là bản sao tên nhóm lúc chèn. Đổi tên nhóm sau đó không đổi báo giá đã lập.
- Thông tin liên hệ của nhà cung cấp là dữ liệu cá nhân do người dùng nhập. Dữ liệu này chỉ nằm trong IndexedDB và trong file sao lưu do người dùng tự tải, không được gửi đi đâu.

## Kết quả xác minh (2026-10-26)

Trên Excel Microsoft 365 Windows (16.0.20430.20182), bản dev:
- Thư viện v1 thật của bản dev (4 công tác, 3 tài nguyên, 4 giá, 3 định mức, 3 tên nhóm) được nâng lên v2. Số bản ghi giữ nguyên, mỗi công tác trỏ đúng nhóm cũ, không còn trường `group`.
- Unit test nâng cấp từ database v1 dựng bằng fake-indexeddb.
- Sao lưu v2 rồi nhập lại: 24 bản ghi đều được nhận là trùng, không thêm gì. File sao lưu v1 ngày 2026-10-22 đọc được.
