# ADR-0014: Hồ sơ báo giá trong workbook, định danh dòng và trạng thái tính toán

- Trạng thái: Chấp nhận (triển khai trong bản 1.11.0, chờ người dùng duyệt trước khi phát hành)
- Ngày: 2026-10-27
- Liên quan: [ADR-0003](0003-luu-tru-thu-vien-ca-nhan.md) (thư viện trong IndexedDB), [ADR-0008](0008-tinh-don-gia-va-thanh-tien.md) (tính đơn giá, sheet phân tích), [ADR-0011](0011-lop-thao-tac-excel-dung-chung.md) (lớp Excel), [ADR-0013](0013-dinh-muc-phien-ban-va-bo-may-tinh.md) (định mức, số học thập phân)

## Bối cảnh

Giai đoạn 17 yêu cầu một quy trình lập báo giá có:
- định danh báo giá và trạng thái;
- định danh dòng ổn định, không phụ thuộc số hàng Excel;
- snapshot nguồn gốc (thư viện, định mức, giá) để truy vết và để báo giá cũ không tự đổi khi thư viện đổi;
- trạng thái tính toán từng dòng (valid / valid_with_warnings / invalid);
- lưu, mở lại, nâng cấp schema an toàn;
- tách đơn giá vật liệu, nhân công, máy, khác.

Trước giai đoạn này, báo giá chỉ là Excel Table `CQ_Quote_n` cộng sheet "Phân tích đơn giá". Mọi kiểm tra đọc lại sheet (prompts/07), không có kho báo giá riêng. Đánh giá chi tiết: [PHASE_17_ASSESSMENT.md](../PHASE_17_ASSESSMENT.md).

## Quyết định

1. **Báo giá vẫn sống trong workbook.** Không thêm kho báo giá trong IndexedDB hay dịch vụ ngoài. Lý do:
   - workbook là tài liệu người dùng lưu, gửi, mở trên máy khác;
   - kho thứ hai sẽ lệch ngay khi người dùng sửa sheet;
   - prompts/12 yêu cầu chọn phương án đơn giản nhất mà nền tảng hỗ trợ.
2. **Hồ sơ báo giá (`QuotationRecord`) là Custom XML Part** (ExcelApi 1.5; mức tối thiểu lúc chạy là 1.8) trong namespace `urn:consquotation:quotation`, mỗi bảng báo giá một phần.
   - Phần tử gốc có thuộc tính `table` để tìm được hồ sơ kể cả khi phần dữ liệu hỏng.
   - Dữ liệu là JSON (đã thoát ký tự XML) trong phần tử `<data>`.
   - Không dùng `workbook.settings`: giới hạn kích thước nhỏ, dùng chung với cấu hình làm tròn.
   - Không dùng sheet ẩn: người dùng có thể vô tình sửa hoặc xóa.
3. **Nguồn sự thật theo trường.**
   - Sheet: mã, nhóm, nội dung, đơn vị, khối lượng, đơn giá, thành tiền, ghi chú, thứ tự dòng; hao phí và giá nguồn trên sheet phân tích. Khi sheet và hồ sơ lệch nhau, sheet thắng.
   - Hồ sơ: id báo giá, trạng thái, id dòng ↔ phương pháp và nguồn (id công tác thư viện, id/mã/phiên bản định mức), snapshot thành phần (id tài nguyên, id giá, hao phí cơ sở, tỷ lệ hao hụt, hao phí áp dụng, giá, đơn vị giá, tiền tệ, chữ nguồn), kết quả tính lần gần nhất, đơn giá thành phần add-in đã ghi.
   - Thông tin công trình (mã báo giá, khách hàng, dự án…) nằm ở khối thông tin trên sheet, không nhân đôi trong hồ sơ.
4. **Cột mở rộng của bảng báo giá:** "Đơn giá vật liệu", "Đơn giá nhân công", "Đơn giá máy", "Đơn giá khác", "Mã dòng".
   - Bảng mới có sẵn 14 cột; cột Mã dòng bị ẩn khi tạo trên sheet mới.
   - Bảng cũ 9 cột vẫn dùng được như trước. Tính năng theo dòng cần thêm cột: người dùng bấm nút, add-in kiểm tra ô bên phải bảng trống và sheet không bị bảo vệ, rồi thêm vào bên phải. Cột Mã dòng chỉ bị ẩn khi cột đó của sheet không có dữ liệu khác.
   - Mọi cột tìm theo tên; 9 cột cũ vẫn là bộ bắt buộc.
5. **Đơn giá thành phần ghi dạng giá trị**, chỉ cho dòng phân tích định mức (ADR-0008 kết quả 1: công thức ghi vào cột trống lan ra cả cột). Dòng nhập trực tiếp hoặc lấy từ thư viện để trống (không biết cơ cấu, không ghi 0).
   - Add-in chỉ ghi đè khi ô đang trống hoặc đúng bằng giá trị add-in đã ghi lần trước. Ô bị sửa tay thì cảnh báo, không ghi đè.
6. **Đồng bộ (reconcile)** khi "Tính lại và lưu":
   - dòng có dữ liệu chưa có mã → gán mã, tạo mục hồ sơ, đoán phương pháp theo ghi chú;
   - mã trùng (dòng sao chép) → dòng sau nhận mã mới và bản sao nguồn gốc của dòng đầu;
   - mục hồ sơ không còn dòng → bỏ.
   - Mã mới không bao giờ trùng mã đang có.
7. **Không có giao dịch nguyên tử giữa ô Excel và hồ sơ.**
   - Thứ tự ghi luôn là ô trước (kiểm tra giá trị cũ và nhận diện dòng trong cùng `Excel.run`), hồ sơ sau (kiểm tra `updatedAt` của hồ sơ lúc đọc).
   - Nếu bước sau lỗi, lần đồng bộ kế tiếp tạo lại mục hồ sơ từ sheet; phần truy vết nguồn của dòng đó bị mất và dòng được cảnh báo "không có dữ liệu truy vết".
   - Mọi thao tác ghi so vân tay nội dung với lần người dùng đang xem; khác thì không ghi.
8. **Engine tính dòng** (`src/domain/quotation/`), thuần TypeScript:
   - dùng số học thập phân và quy tắc làm tròn của giai đoạn 16, tính trên khối phân tích đọc từ sheet;
   - kết quả: đơn giá theo loại, đơn giá công tác (làm tròn một lần theo quy tắc cấp đơn giá), thành tiền (làm tròn một lần theo cấp thành tiền);
   - đối chiếu với kết quả Excel; dung sai bằng bước làm tròn đang dùng, hoặc 1e-9 tương đối.
9. **Trạng thái dòng** gom từ Kiểm tra báo giá hiện có (thêm chỉ số dòng và mã ổn định cho từng vấn đề) cộng kiểm tra mới.
   - invalid: không tính được thành tiền hợp lệ (thiếu hoặc sai khối lượng, đơn giá; ô lỗi; phân tích thiếu số liệu; đơn vị giá khác đơn vị hao phí).
   - validWithWarnings: tính được nhưng có cảnh báo (giá trị 0, thư viện đã đổi, đơn giá lệch phân tích, đơn giá thành phần bị sửa tay, thiếu truy vết).
   - Dòng invalid không lưu số đơn giá hay thành tiền vào kết quả.
10. **Thư viện đổi:** chỉ báo và lập kế hoạch cập nhật. Người dùng bấm "Cập nhật theo thư viện" và xác nhận thì mới ghi:
    - dòng thư viện: ghi đơn giá mới;
    - dòng phân tích: ghi giá nguồn mới lên sheet phân tích (khối dùng chung theo mã), rồi đơn giá công tác do Excel tính lại vào mọi dòng cùng mã.
    - Định mức có phiên bản mới thì chỉ cảnh báo; muốn áp dụng phải chèn lại.
11. **Trạng thái báo giá:** nháp / hoàn tất.
    - Hoàn tất bị chặn khi còn dòng invalid, lỗi dòng tổng hoặc bảng tổng hợp, ô tổng lỗi, hoặc dòng chưa có trong hồ sơ.
    - Hoàn tất lưu vân tay nội dung. Sheet bị sửa sau đó thì hiện "Đã sửa sau khi hoàn tất".
    - "Tính lại và lưu", thêm dòng, hoặc cập nhật theo thư viện làm nội dung khác thì báo giá về nháp.
12. **Nâng cấp schema hồ sơ:** `schemaVersion` = 1, có hàm `migrateRecord`. Hồ sơ của schema mới hơn hoặc sai cấu trúc bị từ chối đọc và không bị ghi đè.

## Hệ quả

- Lưu workbook bằng Excel là lưu hồ sơ; không cần cơ chế sao lưu mới. Đóng workbook không lưu thì mất cả thay đổi trên sheet lẫn hồ sơ, như mọi dữ liệu Excel.
- Bảng tạo mới rộng 14 cột; cột Mã dòng bị ẩn và Excel không in cột ẩn (chưa thử in bảng mẫu mới). Dòng tổng, công thức Thành tiền và STT không đổi.
- Khối thông tin thêm 3 mục tùy chọn: Người lập, Địa điểm, Hạng mục/gói thầu. Sheet cũ thiếu các nhãn này không bị coi là hỏng.
- Bản 1.10.0 trở về trước đọc được bảng 14 cột (cột thêm được bỏ qua) nhưng không biết hồ sơ; hồ sơ nằm yên trong file.
- Chưa kiểm thử trên Excel web và Mac: Custom XML Part, ẩn cột, ghi ô có tiền tố `'`.

## Kết quả xác minh (2026-10-27)

Trên Excel Microsoft 365 Windows (16.0.20430), bản dev, chi tiết ở [quotation-checklist.md](../../tests/manual/quotation-checklist.md):
- Bảng mới 14 cột, cột Mã dòng bị ẩn, khối thông tin 10 mục.
- Chèn dòng phân tích định mức, dòng thư viện, dòng nhập tay: mỗi dòng có mã; dòng phân tích có 22.720,25 / 20.000 / 20.000 / 0 = 62.720,25; hồ sơ XML được tạo.
- Đổi giá thư viện: báo giá giữ 62.720,25 và báo cảnh báo. Bấm cập nhật thì ra 63.770,25 = 2,1 × 10.500 + 1.720,25 + 20.000 + 20.000; báo giá đang hoàn tất về nháp.
- Sửa khối lượng, chép dòng, xóa dòng trực tiếp trong Excel: được nhận ra và đồng bộ đúng.
- Lưu ra file .xlsx, đóng, mở lại: Custom XML Part còn, trạng thái và kết quả khớp.
- Bảng cũ 9 cột bổ sung được 5 cột; sheet đổi giữa lúc xem và lúc ghi thì không ghi; sheet bị bảo vệ thì báo AccessDenied, hồ sơ không đổi.
