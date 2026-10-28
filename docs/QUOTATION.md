# Quy trình lập báo giá và mô hình dữ liệu báo giá

Tài liệu cho người dùng và người phát triển, bản 1.11.0. Quyết định kiến trúc: [ADR-0014](ADR/0014-ho-so-bao-gia-trong-workbook.md). Cách tính đơn giá và sheet phân tích: [ADR-0008](ADR/0008-tinh-don-gia-va-thanh-tien.md). Thư viện và định mức: [LIBRARY.md](LIBRARY.md).

## Quy trình từ đầu đến cuối

1. **Tạo báo giá.** Tab **Báo giá** › Tạo bảng báo giá trên sheet mới (hoặc tại ô đang chọn). Add-in tạo:
   - khối thông tin 10 mục, mục nào cũng tùy chọn: Đơn vị lập, Người lập, Khách hàng, Dự án, Địa điểm, Hạng mục/gói thầu, Mã báo giá, Ngày lập, Phiên bản, Hiệu lực đến;
   - Excel Table `CQ_Quote_n` 14 cột (xem bảng dưới) và dòng tổng.
2. **Nhập thông tin công trình** ở panel Thông tin báo giá (tab Báo giá) hoặc gõ thẳng trên sheet. Sửa được bất cứ lúc nào.
3. **Thêm công tác**:
   - nhập thủ công ở form Thêm công tác;
   - hoặc tab **Thư viện** › Công tác: tìm theo mã, tên, nhóm (không cần gõ dấu), lọc theo nhóm, nhà cung cấp, rồi bấm **Chèn vào báo giá**. Form được điền sẵn để bạn xem lại trước khi bấm Thêm vào bảng;
   - sao chép dòng hoặc nhóm dòng ngay trong Excel; lần **Tính lại và lưu** sau đó gán mã mới cho dòng sao chép.
4. **Chọn định mức và giá** khi chèn công tác có định mức Đang dùng: chọn **Phân tích từ định mức**, xem từng tài nguyên (loại, mã, tên, đơn vị, hao phí đã gồm hao hụt, giá).
   - Tài nguyên có một giá dùng được thì được chọn sẵn; có nhiều giá thì bạn chọn. Giá áp dụng đã lưu trong định mức được chọn sẵn.
   - Giá khác đơn vị không chọn được; add-in không quy đổi đơn vị.
   - Thiếu giá thì đơn giá để trống, không thành 0.
5. **Add-in tính và ghi:**
   - sheet "Phân tích đơn giá": Thành tiền thành phần = Hao phí × Đơn giá nguồn, Đơn giá công tác = Σ, bằng công thức Excel;
   - dòng báo giá: Đơn giá (giá trị do Excel tính), 4 cột đơn giá thành phần, Mã dòng;
   - hồ sơ báo giá: nguồn gốc và snapshot.
6. **Khối lượng và thành tiền:** Thành tiền = Khối lượng × Đơn giá là công thức của bảng, tự cập nhật khi bạn sửa khối lượng. Đơn giá và đơn giá thành phần không đổi theo.
7. **Tổng hợp:** dòng tổng của bảng; tab **Tính giá** › Tổng hợp cho chiết khấu, phụ phí, thuế. Mỗi khoản có loại, cách tính (% trên lũy kế, % trên giá trị báo giá, số tiền), giá trị, thứ tự. Add-in không đặt sẵn khoản nào hay tỷ lệ nào.
8. **Kiểm tra:** tab **Công tác** cho trạng thái từng dòng, tổng theo nhóm, đối chiếu tổng; tab **Tính giá** › Kiểm tra báo giá cho từng ô. Sửa xong bấm **Tính lại và lưu**.
9. **Hoàn tất:** tab Công tác › **Đánh dấu hoàn tất**. Bị chặn nếu còn dòng lỗi.
10. **Lưu và in** bằng Excel như bình thường (File › Save, in hoặc xuất PDF ở tab In ấn).

## Tab Công tác

| Phần | Nội dung |
|---|---|
| Trạng thái báo giá | Chưa có hồ sơ, Nháp, Đã hoàn tất, Đã sửa sau khi hoàn tất, Hồ sơ không đọc được; việc lần lưu tới sẽ làm |
| Nút | Tính lại và lưu; Đánh dấu hoàn tất / Mở lại để sửa; Tải lại; Bổ sung cột quản lý theo dòng (bảng cũ) |
| Tổng hợp | Số dòng hợp lệ / có cảnh báo / lỗi; tổng của ô tổng và tổng add-in tự cộng; tổng theo nhóm công tác; quy tắc làm tròn; vấn đề của dòng tổng và bảng tổng hợp |
| Danh sách dòng | Lọc theo trạng thái, tìm theo mã, nội dung, nhóm; mỗi dòng: số hàng, mã, nội dung, trạng thái, phương pháp, khối lượng × đơn giá = thành tiền, đơn giá theo loại |
| Chi tiết dòng | Nguồn (thư viện, định mức và phiên bản, giá lúc chèn), lỗi và cảnh báo kèm hướng xử lý, thành phần hao phí (cơ sở, hao hụt, áp dụng, giá, nguồn); nút Đi tới dòng, Cập nhật theo thư viện |

**Tính lại và lưu** đọc lại sheet rồi làm 4 việc:
- gán Mã dòng cho dòng chưa có hoặc dòng sao chép;
- ghi đơn giá thành phần cho dòng phân tích (chỉ khi ô trống hoặc đúng giá trị add-in đã ghi);
- bỏ mục hồ sơ của dòng đã xóa;
- lưu kết quả tính từng dòng vào hồ sơ.

Nếu sheet vừa bị sửa so với lúc bạn đang xem, add-in không ghi gì và tải lại.

## Trạng thái của dòng

| Trạng thái | Khi nào |
|---|---|
| Hợp lệ | Không có vấn đề |
| Có cảnh báo | Tính được, nhưng: giá trị 0; thư viện đã đổi so với lúc chèn; đơn giá lệch kết quả phân tích; đơn giá thành phần bị sửa tay hoặc tổng không khớp; định mức có phiên bản mới; dòng chưa có Mã dòng hoặc thiếu dữ liệu truy vết |
| Lỗi | Không tính được thành tiền hợp lệ: thiếu, sai kiểu hoặc âm khối lượng/đơn giá; ô lỗi; phân tích thiếu hao phí hoặc giá nguồn (chỉ rõ tài nguyên); đơn vị giá khác đơn vị hao phí; vượt 15 chữ số |

Dòng lỗi không bao giờ được tính là 0: kết quả lưu trong hồ sơ để trống đơn giá và thành tiền.

## Snapshot và thay đổi thư viện

- Đơn giá trên báo giá là bản sao giá trị, nên sửa thư viện không đổi báo giá đã lập.
- Hồ sơ giữ id công tác, id tài nguyên, id giá và giá lúc chèn. Khi thư viện đổi, dòng hiện cảnh báo, ví dụ: `Giá "A" trong thư viện đã đổi: 10.000 → 10.500 VND/kg`.
- Bấm **Cập nhật theo thư viện** để xem trước thay đổi, rồi xác nhận:
  - dòng lấy từ thư viện: ghi đơn giá mới;
  - dòng phân tích: ghi giá nguồn mới lên sheet phân tích. Khối phân tích dùng chung cho mọi dòng cùng mã công tác, nên các dòng đó cũng nhận đơn giá mới.
- Đơn vị hoặc tiền tệ của giá đã đổi thì add-in chỉ báo, không cập nhật. Định mức có phiên bản mới thì chỉ báo; muốn dùng phải chèn lại công tác.

## Cấu trúc bảng báo giá

| Cột | Ai ghi | Ghi chú |
|---|---|---|
| STT | Công thức của bảng | Gõ đè được (đánh số nhóm) |
| Mã công tác, Nhóm công tác, Nội dung công việc, Đơn vị tính | Người dùng hoặc thư viện | |
| Khối lượng | Người dùng | |
| Đơn giá vật liệu, nhân công, máy, khác | Add-in (dòng phân tích); trống với dòng khác | Giá trị, không phải công thức |
| Đơn giá | Người dùng, thư viện, hoặc add-in ghi giá trị do Excel tính trên sheet phân tích | |
| Thành tiền | Công thức `Khối lượng × Đơn giá` (làm tròn theo quy tắc nếu có) | Trống khi thiếu số liệu |
| Ghi chú | Người dùng; add-in ghi nguồn khi chèn từ thư viện | `Thư viện: …`, `Phân tích định mức: …` |
| Mã dòng | Add-in | Ẩn; không sửa tay |

Bảng tạo trước bản 1.11.0 có 9 cột vẫn dùng được như trước. Tab Công tác đề nghị **Bổ sung cột quản lý theo dòng**; add-in chỉ thêm khi các ô ngay bên phải bảng trống.

## Mô hình dữ liệu (hồ sơ báo giá)

Lưu trong workbook dưới dạng Custom XML Part, namespace `urn:consquotation:quotation`, mỗi bảng một phần. Mã nguồn: [src/domain/quotation/model.ts](../src/domain/quotation/model.ts).

```
QuotationRecord
  schemaVersion: 1          id                tableName ("CQ_Quote_1")
  status: draft | completed completedAt       completedFingerprint
  createdAt                 updatedAt         items: QuotationItemRecord[]

QuotationItemRecord (một dòng công tác; id = giá trị cột Mã dòng)
  id                        pricingMethod: manual | library | norm
  workCode, workName, unit  (lúc chèn)
  source: { workItemId, normId, normCode, normVersion } | null
  libraryPrice: { workItemId, unitPrice, currency } | null
  components: QuotationComponent[]
  result: QuotationPricingResult | null      (lần tính gần nhất)
  writtenBreakdown: { material, labor, machine, other } | null
  createdAt, updatedAt

QuotationComponent (snapshot một tài nguyên của dòng phân tích)
  resourceType              resourceId        resourceCodeSnapshot   resourceNameSnapshot
  unitSnapshot              baseConsumption   wasteRate              appliedConsumption
  priceId                   unitPriceSnapshot priceUnitSnapshot      currency
  sourceReference

QuotationPricingResult
  materialCost, laborCost, machineCost, otherCost   (null nếu không phải dòng phân tích hoặc lỗi)
  unitPrice, quantity, amount                        (null nếu lỗi)
  roundingPolicy            status: valid | validWithWarnings | invalid
  issues: { code, severity, message, hint?, resourceCode? }[]
  calculatedAt              calculationVersion ("quote-line-1")
```

Số lượng, đơn giá, thành tiền, nhóm, ghi chú và thứ tự dòng luôn đọc từ sheet; hồ sơ không giữ bản thứ hai để tránh lệch. Mã báo giá, khách hàng, dự án… đọc từ khối thông tin.

**Nâng cấp schema:** `migrateRecord` kiểm tra cấu trúc. Hồ sơ có `schemaVersion` lớn hơn bản add-in hỗ trợ, hoặc sai cấu trúc, bị từ chối: tab Công tác báo "Hồ sơ không đọc được" và add-in không ghi đè.

## Khi Excel và hồ sơ lệch nhau

| Tình huống | Add-in làm gì |
|---|---|
| Gõ thêm dòng trực tiếp trong Excel | Dòng có cảnh báo "chưa có Mã dòng"; Tính lại và lưu gán mã, tạo mục hồ sơ |
| Sao chép dòng | Cảnh báo "Mã dòng trùng"; Tính lại và lưu gán mã mới, chép nguồn của dòng gốc |
| Xóa dòng | Tính lại và lưu bỏ mục hồ sơ |
| Sửa khối lượng, đơn giá | Kết quả tính theo sheet; dòng ghi "Khác lần tính đã lưu" tới lần lưu sau |
| Sửa tay đơn giá thành phần | Cảnh báo, không ghi đè |
| Ghi ô xong nhưng lưu hồ sơ lỗi | Báo lỗi; lần Tính lại và lưu sau đồng bộ lại từ sheet |
| Sheet bị bảo vệ | Excel từ chối, add-in báo; hồ sơ không đổi |
| Bảng bị xóa hoặc đổi tên | Không tìm thấy bảng; hồ sơ cũ nằm yên trong file |
| Tạo bảng mới trùng tên bảng đã xóa | Hồ sơ cũ được tách khỏi tên bảng (thuộc tính `table` thành `<tên>#tách <thời điểm>`), vẫn giữ trong file; bảng mới bắt đầu "Chưa có hồ sơ" |
| Hai task pane cùng ghi một bảng | Mỗi lần ghi đọc lại kết quả; bên bị ghi đè báo "vừa thay đổi" và không lưu hồ sơ; Tính lại và lưu lần nữa để khớp |

Không có giao dịch chung giữa ô Excel và hồ sơ. Thứ tự luôn là ghi ô trước, lưu hồ sơ sau.

## Kiểm thử

- Unit test: `npm test`, file [tests/unit/quotation.test.ts](../tests/unit/quotation.test.ts) (10 tình huống bắt buộc của giai đoạn 17 cùng đồng bộ, hoàn tất, mã hóa XML).
- Chạy thử trong Excel: [tests/manual/quotation-checklist.md](../tests/manual/quotation-checklist.md).
- Kịch bản tích hợp trên Excel thật (cần `npm start`, task pane đang mở): `node tests/integration/run-in-taskpane.mjs tests/integration/quotation.scenarios.js` (23 tình huống, tự dọn dữ liệu thử).
- Kiểm thử tổng thể giai đoạn 18: [PHASE_18_TEST_REPORT.md](PHASE_18_TEST_REPORT.md).
