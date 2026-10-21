# Kiểm thử — Tính đơn giá và thành tiền (prompts/10_PRICING_FORMULA_ENGINE.md)

**Lần chạy 2026-10-21.** Claude tự chạy trên Excel desktop thật (Microsoft 365, build 16.0.20430.20182), điều khiển task pane qua DevTools (cổng 9229). Mọi thao tác diễn ra trong workbook tạm do `npm start` tạo, trên sheet "BG Tính giá" và "BG làm tròn".

## Thử nghiệm Excel trước khi thiết kế

Kết quả được ghi trong [ADR-0008](../../docs/ADR/0008-tinh-don-gia-va-thanh-tien.md):
- Ghi một công thức vào cột Table đang trống thì Excel lan công thức ra cả cột.
- Bảng tổng hợp đặt dưới bảng báo giá được đẩy xuống đúng khi chèn dòng.
- `COUNTIFS` coi "007", "07", "7" là một.
- Ghi chữ qua `Range.values` thì "007" thành 7, "1/2" thành ngày.
- Excel viết lại tham chiếu có cấu trúc khi lưu.

## Kết quả

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| G1 | Tab **Tính giá** | Có 3 phần: Kiểm tra báo giá, Tổng hợp, Quy tắc làm tròn | Đạt |
| G2 | Thư viện › 007 (có định mức, có đơn giá) › Chèn vào báo giá | Hiện "Cách xác định đơn giá", mặc định là "Đơn giá trong thư viện" | Đạt |
| G3 | Chọn "Phân tích từ định mức" khi XM có 2 giá còn hiệu lực và 1 giá hết hạn, còn nhân công chỉ có giá Ngưng dùng | Không giá nào được chọn sẵn. Có gợi ý "hãy tự chọn… không tự chọn giá mới nhất". Ô Đơn giá bị khóa. Ghi chú đổi sang "Phân tích định mức" | Đạt |
| G4 | Chọn giá, nhập KL 2, bấm Thêm 2 lần | Sheet "Phân tích đơn giá" được tạo, mỗi tài nguyên một dòng, dùng công thức Excel. Đơn giá = 1,25×285.000 + 0,000123×1.720,25 = 356.250,21159075. Báo giá nhận đúng giá trị đó. Chỉ thêm 1 dòng. Có cảnh báo giá Ngưng dùng | Đạt (sau khi sửa lỗi 1) |
| G5 | Chèn lại 007 | Báo "đã có phân tích", khóa ô chọn giá, dùng lại đơn giá có sẵn | Đạt |
| G6 | XT-02 (chưa có đơn giá) để trống giá tài nguyên | Mặc định chọn Phân tích. Đơn giá trong báo giá **để trống** (không phải 0). Có cảnh báo hướng dẫn | Đạt |
| G7 | Kiểm tra báo giá | 5 dòng trống của mẫu bị bỏ qua. Cảnh báo đúng ô G18 (thiếu đơn giá) và I7 trên sheet phân tích. Liệt kê phương pháp và nguồn từng dòng | Đạt |
| G8 | Sửa trực tiếp sheet phân tích (nhập giá còn thiếu, đổi giá nhân công) → Kiểm tra → Đi tới → Cập nhật 3 đơn giá | Báo lệch kèm số dạng 375.000,21. Nút Đi tới chọn đúng G16. Có hộp xác nhận. Sau khi cập nhật, kiểm tra lại "Không phát hiện vấn đề nào" | Đạt |
| G9 | Tổng hợp: Chiết khấu 5% và Thuế GTGT 8%, cả hai tính "% trên lũy kế" | Bảng ở D21:I25 (cách 1 dòng). Kết quả 1.176.608,13 × 0,95 × 1,08 = 1.207.199,95. Nhãn dòng tổng của báo giá thành "Cộng" | Đạt (sau khi sửa lỗi 1) |
| G10 | Thêm dòng công tác thủ công, mã "1-2" | Không hỏi xác nhận đẩy dữ liệu (bảng tổng hợp là của add-in). Bảng tổng hợp dịch xuống D22. Mã "1-2" giữ dạng chữ. Tổng tự cập nhật | Đạt (sau khi sửa lỗi 2) |
| G11 | Xóa giá trị thuế trên sheet; sửa chiết khấu thành 3 | Tổng cộng báo `#N/A`. Kiểm tra cảnh báo đúng ô. Phần Tổng hợp đọc lại giá trị 3 và ô thuế trống | Đạt (sau khi sửa lỗi 6) |
| G12 | Làm tròn: đơn giá phân tích ROUND 0, Thành tiền ROUND −3, tổng hợp ROUNDDOWN 0; một ô Thành tiền gõ đè 999 | Công thức được cập nhật ở cả 3 cấp. Ô 999 giữ nguyên và bị cảnh báo "gõ đè". Ví dụ: chiết khấu −35.339,97 thành −35.339, thuế 91.412,8 thành 91.412. Đơn giá phân tích lệch với báo giá được phát hiện | Đạt (sau khi sửa lỗi 3, 4) |
| G13 | Tạo bảng báo giá mới, thêm dòng 1,5 × 1.234.567 | Công thức Thành tiền dùng ROUND(…,−3); kết quả 1.852.000 | Đạt |
| G14 | Thêm khoản "Phụ phí vận chuyển" (số tiền cố định) khi ngay dưới bảng tổng hợp có dữ liệu → bỏ dữ liệu → đưa phụ phí lên trước thuế → Áp dụng | Lần đầu bị chặn, không ghi đè. Lần sau ghi được; thuế tính trên lũy kế đã gồm phụ phí | Đạt |
| G15 | Xóa bảng tổng hợp | Có hộp xác nhận. Bảng và nội dung bị xóa hết. Nhãn trở lại "Tổng cộng" | Đạt |
| G16 | Chèn phân tích vào bảng có dữ liệu bên dưới (qua hộp xác nhận đẩy xuống) | Ghi đúng giá trị phân tích sau khi làm tròn (375.000 × 4 = 1.500.000) | Đạt |
| G17 | Locale | Công thức ghi theo cú pháp en-US chạy đúng; `formulasLocal` trên máy kiểm thử dùng `;` | Đạt |

## Lỗi phát hiện và đã sửa trong lần chạy này

1. **Tạo sheet phân tích và bảng tổng hợp báo `GeneralException`.**
   - Nguyên nhân: công thức `[@[…]]` được ghi trước khi tạo Table.
   - Hậu quả: còn lại một sheet dở dang.
   - Sửa: tạo Table trước rồi mới ghi; nếu thất bại thì tự xóa sheet vừa tạo.
2. **Mã bị Excel đổi kiểu khi chèn công tác** (lỗi có từ prompts/06): "007" thành 7, "1-2" thành ngày.
   - Sửa: luôn ghi chữ kèm tiền tố `'`.
3. **Áp dụng làm tròn không cập nhật sheet phân tích và bảng tổng hợp.**
   - Nguyên nhân: Excel lưu công thức ở dạng rút gọn (bỏ tên bảng, `[@[Loại]]` thành `[@Loại]`), nên so sánh nguyên văn không khớp.
   - Sửa: chuẩn hóa trước khi so sánh, và nhận diện mọi biến thể quy tắc làm tròn.
   - Cũng nhờ chuẩn hóa này mà Kiểm tra báo giá không còn báo sai "công thức tổng khác mẫu".
4. **Regex nhận diện bảng tổng hợp bị mất dấu `\`** khi sửa file bằng script.
   - Sửa: chuyển phần nhận diện tên bảng vào tầng domain và thêm unit test.
5. Thông báo lệch đơn giá hiện số thô "356250.21159075" và ô trống hiện rỗng. Sửa: số hiện dạng 356.250,21, ô trống hiện "(trống)".
6. Chưa báo lỗi riêng cho ô Tổng cộng của bảng tổng hợp. Sửa: thêm mục báo lỗi này.
7. Tab Tổng quan và Cài đặt còn câu cũ: "nhập/xuất… sẽ được bổ sung" và "Thư viện cá nhân sau này…". Sửa: cập nhật nội dung.

## Không triển khai / chưa kiểm thử

- **Công thức tùy chỉnh có kiểm soát:** prompts/10 ghi "nếu được triển khai". Add-in không có engine riêng. Người dùng tự gõ công thức Excel; Kiểm tra báo giá ghi nhận đó là "Công thức tự nhập" và báo lỗi nếu có.
- **Tham chiếu vòng:** Office.js không cho đọc trạng thái này; Excel tự cảnh báo.
- **Excel trên web và Mac** chưa kiểm thử.
- **Cảnh báo `aria-hidden` trong console khi đóng hộp xác nhận:** đây là hành vi của Fluent Dialog. Có từ các giai đoạn trước và không ảnh hưởng thao tác.
