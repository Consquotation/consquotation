# ADR-0008: Tính đơn giá và thành tiền

- Trạng thái: Chấp nhận
- Ngày: 2026-10-21
- Theo: [prompts/10_PRICING_FORMULA_ENGINE.md](../../prompts/10_PRICING_FORMULA_ENGINE.md)

## Bối cảnh

Prompts/10 yêu cầu:
- các phương pháp đơn giá: nhập trực tiếp, tra thư viện, phân tích cấu thành từ định mức;
- hiển thị phương pháp và nguồn giá;
- phân biệt ô trống, số 0 và lỗi;
- dùng công thức Excel, xác định cột theo Table và tiêu đề;
- quy tắc làm tròn rõ ràng;
- chiết khấu, phụ phí, thuế và thứ tự áp dụng do người dùng cấu hình;
- truy vết được đơn giá phân tích.

Thử nghiệm trên Excel Microsoft 365 Windows (build 16.0.20430.20182) cho các kết quả sau, và chúng ràng buộc thiết kế.

1. **Ghi một công thức vào một ô của cột đang trống trong Table thì Excel lan công thức ra cả cột.**
   - Điều này xảy ra cả khi ghi qua `range.formulas`, qua `values` hay qua `rows.add`, và tạo thành cột tính toán (calculated column).
   - Ghi vào một ô của cột đã là cột tính toán cũng lan ra cả cột.
   - Nếu cột đã có ít nhất một hằng số thì không lan.
2. **Công thức `[@[…]]` chỉ hợp lệ bên trong Table.** Ghi công thức đó trước khi tạo Table thì Excel báo `GeneralException`.
3. **Excel viết lại tham chiếu có cấu trúc khi lưu:**
   - `CQ_Analysis[Mã công tác]` trong chính bảng đó thành `[Mã công tác]`;
   - `CQ_Quote_1[Thành tiền]` ở dòng tổng thành `[Thành tiền]`;
   - `[@[Loại]]` thành `[@Loại]` khi tên cột không có dấu cách;
   - riêng `CQ_Quote_1[#Headers]` được giữ nguyên.
4. **`COUNTIFS`/`SUMIFS` không so khớp mã chính xác.** Tiêu chí của chúng coi "007", "07", "7" là một, và hiểu `* ? ~` là ký tự đại diện.
5. **Ghi chữ qua `Range.values` bị Excel tự chuyển kiểu:**
   - "007" thành số 7;
   - "1/2" và "1-2" thành ngày;
   - "10%" thành 0,1;
   - "TRUE" thành giá trị logic.
6. Bảng đặt dưới dòng tổng, nằm trong phạm vi cột của bảng báo giá, được Excel đẩy xuống nguyên vẹn khi chèn dòng vào bảng báo giá.
7. Danh sách chọn (data validation) dùng nguồn `"A,B,C"` chạy đúng trên máy có locale tiếng Việt và được kế thừa khi thêm dòng. Cờ `valid` phát hiện được giá trị gõ sai.
8. Công thức ghi theo cú pháp en-US qua `Range.formulas` (dấu `,`) chạy đúng. `formulasLocal` trên máy kiểm thử dùng `;`.
9. `Table.delete()` xóa cả nội dung của bảng.

## Quyết định

### Phương pháp đơn giá

| Phương pháp | Cách làm | Truy vết |
|---|---|---|
| Nhập trực tiếp | Người dùng gõ vào form hoặc vào ô | — |
| Tra thư viện | Chép giá trị (ADR-0003, prompts/08) | Ghi chú `Thư viện: …; nguồn giá …; hiệu lực …` |
| Phân tích định mức | Sheet "Phân tích đơn giá" (Table `CQ_Analysis`) với Thành tiền = Hao phí × Đơn giá nguồn và Đơn giá công tác = Σ, tính bằng công thức Excel | Ghi chú `Phân tích định mức: <mã> (sheet "Phân tích đơn giá")` kèm từng dòng tài nguyên trên sheet |
| Công thức tùy chỉnh | **Không triển khai engine riêng.** Người dùng tự gõ công thức Excel; chức năng Kiểm tra báo giá ghi nhận là "Công thức tự nhập" và báo lỗi nếu có | — |

- **Đơn giá phân tích được ghi vào bảng báo giá dạng GIÁ TRỊ, không phải công thức liên kết** (vì kết quả 1). Giá trị này do chính Excel tính trên sheet phân tích, rồi add-in đọc lại.
  - **Kiểm tra báo giá** so đơn giá trong báo giá với sheet phân tích và đề xuất cập nhật. Việc cập nhật cần xác nhận và kiểm tra lại giá trị cũ trước khi ghi.
- Giá tài nguyên do **người dùng chọn**. Add-in chỉ chọn sẵn khi có đúng một giá đang dùng, còn hiệu lực và đúng đơn vị.
  - Giá khác đơn vị không chọn được.
  - Các giá đã chọn phải cùng tiền tệ.
  - Không chọn giá thì đơn giá nguồn để trống, Đơn giá công tác để trống, và đơn giá trong báo giá cũng để trống.
- Mỗi mã chỉ có **một** khối phân tích trong workbook. Nếu mã đã có phân tích, add-in dùng lại đơn giá đó và thông báo rõ.
- So khớp mã bằng `SUMPRODUCT(--(Mã=[@Mã]), …)` (vì kết quả 4).
  - Hệ quả: một ô lỗi ở bất kỳ dòng nào làm mọi Đơn giá công tác báo lỗi. Đây là hướng an toàn (không đổi lỗi thành 0); chức năng kiểm tra chỉ ra đúng dòng lỗi.

### Trống, 0 và lỗi

- Thành tiền = `IF(OR(KL="",ĐG=""),"", KL×ĐG)`. Thiếu số liệu thì ô để trống và **không được cộng vào tổng**; chức năng kiểm tra cảnh báo từng dòng như vậy.
- Không dùng `IFERROR`. Lỗi lan tới tổng.
- Khi tham chiếu tới một ô tổng, nếu ô đó trống thì trả về `NA()`, vì Excel coi ô trống là 0.
- Đơn giá bằng 0 được cảnh báo riêng, phân biệt với ô trống.

### Làm tròn

Cấu hình theo workbook: `workbook.settings["ConsQuotation.pricing"].rounding`.

| Cấp | Áp dụng cho |
|---|---|
| `unitPrice` | Đơn giá công tác trên sheet phân tích |
| `amount` | Thành tiền từng dòng báo giá |
| `adjustment` | Từng khoản chiết khấu/phụ phí/thuế |

- **Kiểu làm tròn:** không làm tròn, ROUND (0,5 ra xa số 0), ROUNDUP, ROUNDDOWN.
- **Độ chính xác:** từ −9 đến 6 chữ số; số âm là hàng chục, trăm, nghìn…
- **Mặc định:** không làm tròn.
- Áp dụng bằng hàm Excel trong công thức.
- Đơn giá nhập trực tiếp hoặc lấy từ thư viện không bị làm tròn.
- Tổng là tổng các Thành tiền đã làm tròn.
- **Hiển thị theo định dạng ô của Excel** (người dùng chốt khi nghiệm thu, 2026-10-22). Giá trị chỉ bị làm tròn khi người dùng đặt quy tắc. Nếu không, số vẫn giữ đủ phần lẻ và Excel hiển thị theo định dạng ô: ví dụ `#,##0` hiện 265.000,5 thành 265.001, còn tổng sau thuế 28.022.647,572 in ra 28.022.648. Add-in không tự đổi định dạng hay làm tròn để che phần lẻ; người dùng tự chỉnh định dạng ô nếu muốn thấy phần lẻ.
- **Khi áp dụng:** chỉ thay các ô có công thức **mẫu**, nhận diện mọi biến thể quy tắc sau khi chuẩn hóa như kết quả 3. Ô có công thức khác mẫu hoặc ô hằng số được giữ nguyên và được đếm. Bảng mới và dòng mới luôn dùng quy tắc hiện tại, đọc ngay lúc ghi.

### Chiết khấu, phụ phí, thuế

- Bảng `CQ_Summary_<n>` đặt dưới dòng tổng của `CQ_Quote_<n>` (cách 1 hàng), trong các cột "Nội dung công việc" … "Ghi chú" (vì kết quả 6).
  - Khi kiểm tra dữ liệu bên dưới để hỏi xác nhận chèn dòng báo giá, vùng của bảng này được loại trừ.
- Cột của bảng: Khoản mục | Loại (Giảm trừ/Cộng thêm) | Cách tính (% trên lũy kế / % trên giá trị báo giá / Số tiền) | Giá trị | Số tiền | Lũy kế.
- Thứ tự áp dụng là thứ tự dòng. Tổng cộng là Lũy kế của dòng cuối.
- **Không có khoản hay tỷ lệ mặc định nào.**
- Nếu Giá trị trống, Loại hoặc Cách tính sai, thì Tổng cộng báo `#N/A`, không bỏ qua âm thầm.
- Có danh sách chọn cho Loại và Cách tính.
- Khi có bảng tổng hợp, nhãn dòng tổng của bảng báo giá đổi từ "Tổng cộng" thành "Cộng" (chỉ khi nhãn chưa bị người dùng sửa).
- Vùng mới phải trống. Nếu có dữ liệu của người dùng, add-in chặn và không ghi đè. Thay đổi sau đó dùng vân tay (fingerprint) như các thao tác ghi khác.

### Chữ ghi vào ô

Luôn thêm tiền tố `'` (vì kết quả 5). Thay đổi này sửa lỗi có từ prompts/06: mã "007" từng bị lưu thành số 7.

### Tham chiếu vòng

Excel tự cảnh báo; Office.js không cho đọc trạng thái này. Add-in không kiểm tra và nói rõ điều đó trong màn hình kiểm tra.

## Hệ quả

- Thêm port `PricingGateway` (src/application/pricingGateway.ts) và adapter `ExcelPricingGateway`.
- Thêm tab **Tính giá**: Kiểm tra báo giá, Tổng hợp, Quy tắc làm tròn.
- Form Thêm công tác có lựa chọn **Cách xác định đơn giá** khi công tác trong thư viện có định mức.
- Báo giá vẫn là bản sao giá trị. Sửa sheet phân tích không tự đổi báo giá; người dùng cập nhật qua Kiểm tra báo giá.
- Chưa kiểm thử: Excel trên web và Mac (data validation, OFFSET, viết lại tham chiếu có cấu trúc).
