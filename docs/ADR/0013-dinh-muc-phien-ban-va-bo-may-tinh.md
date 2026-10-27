# ADR-0013: Định mức có phiên bản, thành phần tài nguyên và bộ máy tính đơn giá

- Trạng thái: Chấp nhận (triển khai trong bản 1.10.0, chờ người dùng duyệt trước khi phát hành)
- Ngày: 2026-10-27
- Liên quan: [ADR-0003](0003-luu-tru-thu-vien-ca-nhan.md) (lưu trữ), [ADR-0004](0004-import-export-thu-vien.md) (nhập/xuất), [ADR-0008](0008-tinh-don-gia-va-thanh-tien.md) (tính đơn giá), [ADR-0011](0011-lop-thao-tac-excel-dung-chung.md) (lớp thao tác Excel), [ADR-0012](0012-danh-muc-nha-cung-cap-schema-v2.md) (schema v2)

## Bối cảnh

Bản 1.9.0 lưu định mức dạng dòng phẳng `{workItemId, resourceId, quantity}`: mỗi dòng là hao phí một tài nguyên cho 1 đơn vị công tác. Mô hình này thiếu:
- mã định mức riêng, phiên bản, ngày áp dụng, nguồn và trạng thái;
- hao hụt;
- cách khóa định mức đã dùng để báo giá cũ còn truy vết được;
- một bộ máy tính tách khỏi giao diện, có mã lỗi ổn định và không trả về 0 khi thiếu dữ liệu.

Giai đoạn 16 yêu cầu bổ sung các điểm trên, kèm bảng diễn giải xuất ra Excel và kiểm thử các phép tính mẫu (2 × 10.000 + 0,5 × 40.000 + 0,25 × 80.000 = 60.000; hao hụt 5% đưa hao phí 2 thành 2,1).

## Quyết định

1. **Hai loại bản ghi mới.**
   - `Norm {id, code, name, unit, categoryId, workItemId, version, effectiveFrom, sourceType, source, sourceVerified, status, wasteIncluded, notes, createdAt, updatedAt}`.
   - `NormComponent {id, normId, resourceId, resourceCodeSnapshot, resourceNameSnapshot, resourceUnitSnapshot, resourceTypeSnapshot, consumption, wasteRate, sortOrder, notes, createdAt, updatedAt}`.
   - Định mức liên kết với công tác qua `workItemId` (tùy chọn). Không gộp định mức vào công tác, vì một công tác có thể có nhiều phiên bản định mức theo thời gian.
2. **Trạng thái và phiên bản.**
   - `draft` (Nháp): sửa được mọi thứ, thêm/sửa/xóa thành phần.
   - `approved` (Đang dùng): khóa thành phần, mã, phiên bản, đơn vị và cờ "đã gồm hao hụt". Tên, nhóm, nguồn, ngày áp dụng, ghi chú và công tác liên kết vẫn sửa được.
   - `inactive` (Ngừng dùng): giữ nguyên để truy vết, không quay lại nháp.
   - Mỗi mã chỉ có một phiên bản Đang dùng; mỗi công tác chỉ liên kết với một định mức Đang dùng.
   - Chỉ xóa được bản nháp. Muốn sửa định mức đã duyệt thì "Sao chép thành phiên bản mới": tạo bản nháp số phiên bản kế tiếp và làm mới snapshot tài nguyên.
3. **Hao hụt.** `Hao phí tính toán = Hao phí cơ sở × (1 + Tỷ lệ hao hụt)`.
   - Tỷ lệ lưu dạng phân số (0,05), nhập và hiển thị dạng phần trăm (5). Chuyển đổi bằng số học thập phân, không qua số thực.
   - Tỷ lệ từ 0 đến 100%. Lớn hơn 100% bị chặn vì gần như chắc chắn là nhập nhầm (5 thay cho 0,05).
   - Cờ `wasteIncluded` cho định mức mà nguồn đã gồm hao hụt. Khi bật, form không nhận hao hụt, và nếu dữ liệu cũ hoặc dữ liệu nhập vẫn có hao hụt thì bộ máy bỏ qua và cảnh báo `wasteIgnored` để tránh tính hai lần.
4. **Không quy đổi đơn vị.** Hao phí khai theo đơn vị của tài nguyên. Giá có đơn vị khác đơn vị tài nguyên thì không dùng (`priceUnitMismatch`). Đổi đơn vị của tài nguyên sau khi đã khai hao phí là lỗi (`resourceUnitChanged`) cho đến khi người dùng kiểm tra lại hao phí và bấm "Cập nhật liên kết" ở bản nháp.
5. **Snapshot tài nguyên.** Thành phần lưu mã, tên, đơn vị, loại tài nguyên tại thời điểm thêm. Bộ máy luôn tính theo tài nguyên hiện tại, dùng snapshot để phát hiện thay đổi: đổi đơn vị là lỗi; đổi mã, tên hoặc loại là cảnh báo. Tài nguyên đã bị xóa thì thành phần hiện theo snapshot và báo lỗi `resourceMissing`.
6. **Bộ máy tính thuần TypeScript** ([normCalc.ts](../../src/domain/pricing/normCalc.ts)), không gọi Office.js và không đọc giao diện.
   - Đầu vào: định mức, thành phần, tài nguyên, giá, ngày tính, giá được chọn (tùy chọn), quy tắc làm tròn (tùy chọn).
   - Kết quả: từng thành phần (hao phí cơ sở, tỷ lệ áp dụng, hao phí tính toán, giá dùng, thành tiền), tổng theo nhóm vật liệu/nhân công/máy/khác, đơn giá tổng hợp, danh sách vấn đề, thời điểm tính và vân tay dữ liệu đầu vào.
   - Trạng thái `valid`, `validWithWarnings`, `invalid`. Có lỗi thì thành tiền của thành phần đó và đơn giá tổng hợp là `null`, không bao giờ thay bằng 0.
   - 24 mã vấn đề ổn định (`missingPrice`, `ambiguousPrice`, `priceUnitMismatch`, `overflow`…), thông báo tiếng Việt nằm ở [strings.norms.vi.ts](../../src/shared/strings.norms.vi.ts).
   - Có nhiều giá dùng được cho cùng tài nguyên thì báo `ambiguousPrice`, không tự chọn giá mới nhất.
7. **Số học thập phân không thêm thư viện.** [decimal.ts](../../src/domain/pricing/decimal.ts) tính trên chuỗi chữ số (dấu, chữ số, số chữ số thập phân). Không dùng BigInt vì browserslist còn Safari 13 (ADR-0010). Làm tròn đúng ngữ nghĩa ROUND, ROUNDUP, ROUNDDOWN của Excel, kể cả số chữ số âm.
   - Không làm tròn từng bước. Đơn giá tổng hợp làm tròn một lần nếu có quy tắc; mặc định không làm tròn.
   - Kết quả có phần nguyên quá 15 chữ số (giới hạn chính xác của Excel) bị báo `overflow`.
8. **Báo giá dùng định mức Đang dùng.** Khi chèn công tác vào báo giá theo "Phân tích từ định mức", add-in lấy định mức Đang dùng liên kết với công tác. Sheet "Phân tích đơn giá" nhận hao phí tính toán (đã gồm hao hụt); cột nguồn ghi "hao phí gồm hao hụt 5% (cơ sở 2)" và "định mức MÃ vN".
9. **Bảng diễn giải xuất ra Excel.** [normExplanation.ts](../../src/domain/pricing/normExplanation.ts) dựng bảng; [excelNormExportGateway.ts](../../src/office/excelNormExportGateway.ts) ghi bằng lớp core (ADR-0011).
   - Luôn ghi vào sheet mới "Diễn giải MÃ vN"; trùng tên thì thêm hậu tố " (2)". Không ghi vào sheet đang có.
   - Hao phí tính toán, thành tiền và tổng theo nhóm là công thức Excel (`=F7*(1+G7)`, `=H7*I7`, `SUMIF`, `SUM`). Cột bên cạnh ghi kết quả của add-in để đối chiếu.
   - Trước khi ghi, add-in tính lại và so vân tay với lần hiển thị. Thư viện đã đổi thì dừng và yêu cầu xem lại.
10. **Không tuyên bố pháp lý.** ConsQuotation không kèm định mức nào. Nguồn định mức là "Người dùng tự xây dựng" hoặc "Tài liệu bên ngoài" (bắt buộc ghi tên tài liệu, có ô "Đã đối chiếu với tài liệu gốc"). Giao diện ghi rõ add-in không xác nhận tính pháp lý. Kiểm tra thư viện cảnh báo định mức nguồn tài liệu chưa đối chiếu.
11. **Lưu trữ và trao đổi.**
    - IndexedDB v2 → v3 trong giao dịch `versionchange`. Kho `norms` cũ (giữ tên) chứa thành phần; kho mới `normSets` chứa định mức.
    - Nâng cấp: các dòng định mức cũ được gom theo công tác thành định mức phiên bản "1", mã và tên lấy từ công tác. Công tác còn tồn tại thì định mức Đang dùng; công tác đã bị xóa thì định mức là nháp, tên ghi "(công tác đã bị xóa)". Hao hụt 0, thứ tự theo thời điểm tạo.
    - Schema trao đổi v3: sheet "Định mức" (đầu định mức) và "Thành phần định mức" (tham chiếu Mã định mức + Phiên bản). JSON có `norms` và `normComponents`.
    - File v1/v2 vẫn nhập được: bảng định mức cũ (Mã công tác, Mã tài nguyên, Hao phí) được hiểu là thành phần, tự tạo định mức phiên bản 1 theo công tác.
    - Không thêm thành phần vào định mức không còn là nháp, trừ khi định mức đó được tạo mới trong cùng lần nhập.

## Hệ quả

- Bản 1.10.0 nâng thư viện lên schema 3 ở lần mở đầu tiên. Bản 1.9.0 và cũ hơn không mở được thư viện này (báo "được tạo bởi phiên bản mới hơn", không ghi đè). File sao lưu schema 3 không nhập được vào bản cũ.
- Giá áp dụng của thành phần được lưu (`NormComponent.priceId`, null = tự lấy khi chỉ có một giá dùng được).
  - Đổi được ở bản nháp và phiên bản Đang dùng, vì giá thay đổi theo thời gian còn hao phí thì không. Phiên bản Ngừng dùng khóa.
  - Khi chèn vào báo giá, giá đã lưu là lựa chọn mặc định ở bước phân tích nếu vẫn dùng được.
  - Bị bỏ khi đổi tài nguyên của thành phần hoặc khi Cập nhật liên kết sau đổi đơn vị.
  - Bản sao lưu JSON giữ lựa chọn này; sheet và CSV không có cột tương ứng.
- Kiểm tra lại trước khi xuất nằm ở hàm thuần `recheckNorm` (tính lại với thư viện vừa đọc, so vân tay), có unit test riêng.
- Không có loại tài nguyên "nhiên liệu" riêng; dùng loại "Khác".
- Bundle production `taskpane.js` tăng khoảng 62 KB (625.527 → 689.967 byte).

## Kết quả xác minh (2026-10-27)

Trên Excel Microsoft 365 Windows (16.0.20430), bản dev, workbook tạm do `npm start` tạo:
- Thư viện v2 thật của bản dev (3 dòng định mức của 2 công tác) được nâng lên v3 thành "007 v1" và "XT-02 v1", Đang dùng, hao phí và tài nguyên khớp từng dòng.
- Định mức thử THU-DM-16 với 3 tài nguyên giả định (10.000 VND/kg, 40.000 VND/công, 80.000 VND/ca): 60.000 VND; thêm hao hụt 5% cho vật liệu thì hao phí 2,1 và đơn giá 61.000 VND.
- Bảng diễn giải xuất ra sheet mới: công thức Excel cho ra 2,1; 21.000; tổng vật liệu 21.000; đơn giá 61.000, khớp cột kết quả add-in. Xuất lần hai tạo sheet " (2)", sheet cũ giữ nguyên.
- Chèn công tác liên kết định mức v2 vào báo giá: sheet phân tích ghi hao phí 2,1 với ghi chú hao hụt; đơn giá 62.720,25 = 21.000 + 20.000 + 20.000 + 1.720,25.
- Đổi đơn vị tài nguyên ca → giờ: thành phần báo lỗi, đơn giá "Chưa tính được"; "Cập nhật liên kết" ở bản nháp nhận đơn vị mới và lỗi chuyển sang thiếu giá cùng đơn vị.
- Giá áp dụng: chọn giá NCC B cho XM ở v2 (Đang dùng) thì đơn giá 62.720,25; tải lại task pane vẫn giữ lựa chọn; chèn vào báo giá thì ô giá của XM mặc định là NCC B; v1 (Ngừng dùng) khóa ô chọn.
- Sửa giá THU16-A trực tiếp trong IndexedDB (giả lập task pane khác) rồi bấm xuất: không tạo sheet, báo dữ liệu vừa đổi, kết quả tính lại 63.770,25. Xuất lần hai ghi 2,1 × 10.500 = 22.050.
