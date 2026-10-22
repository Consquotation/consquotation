# Nghiệm thu toàn bộ (prompts/20)

**Lần chạy:** 2026-10-21/22, bản 1.8.0.

**Môi trường:**
- Claude tự chạy trên Excel desktop thật: Microsoft 365, build 16.0.20430.20182, định dạng vùng vi-VN.
- Task pane mở từ Ribbon và được điều khiển qua DevTools.
- Workbook là workbook tạm do `npm start` tạo; không đụng file của người dùng.

**Cách chạy:** luồng chính chạy lại từ đầu như một người dùng mới, trên sheet "Nghiệm thu". Đi theo đường mặc định, không tự đổi tùy chọn mà người dùng thường không đổi. Đặt ô đánh dấu quanh mọi vùng ghi: K2, L5 bên phải, A30 bên dưới.

**Ký hiệu kết quả:**
- **Đạt**
- **Đạt (đã sửa):** có lỗi phát hiện trong lần nghiệm thu này, đã sửa và chạy lại.
- **Chờ người dùng:** cần thao tác mà chỉ người dùng làm được.

## Nền tảng

| Mục | Bằng chứng | Kết quả |
|---|---|---|
| Excel mục tiêu được chốt; requirement set đã xác minh | [ADR-0001](../../docs/ADR/0001-nen-tang-excel-muc-tieu.md), [ADR-0002](../../docs/ADR/0002-manifest-va-requirement-set.md), [COMPATIBILITY.md](../../docs/COMPATIBILITY.md). Tab Cài đặt trên máy thử: ExcelApi 1.8 đạt, 1.9 (in) đạt, 1.13 (ô gộp) đạt | Đạt |
| Manifest hợp lệ | `npm run validate`: manifest dev hợp lệ. Manifest production đang phát hành (bản tải từ GitHub Pages) cũng hợp lệ. Cả 19 URL trong manifest production trả về 200. Id dev ≠ Id production | Đạt |
| Task pane mở từ Ribbon | Bản dev: tab **ConsQuotation (Dev)** › **Mở ConsQuotation** mở được task pane (2026-10-22) | Đạt (bản dev) |
| | Bản production cài từ thư mục catalog: bước P1 của checklist 05 chưa ai chạy | **Chờ người dùng** |
| Hướng dẫn sideload/triển khai đúng | Làm đúng theo [SIDELOAD.md](../../docs/SIDELOAD.md) (`npm start`) để dựng môi trường lần này. Mọi lệnh `npm run …` trong tài liệu đều có trong `package.json`. Tên tab trong tài liệu khớp manifest | Đạt (phần production chờ P1) |

## Workbook

| Mục | Bằng chứng | Kết quả |
|---|---|---|
| Tạo mẫu trên workbook hiện tại | Sheet mới "Nghiệm thu": khối thông tin và Table 9 cột, `CQ_Quote_1` | Đạt |
| Kiểm tra vùng đích, cảnh báo ghi đè | Tạo tại K1 khi K2, L5 có dữ liệu → báo đúng 2 ô, nêu rõ không hoàn tác được. Bấm Hủy → K2, L5 giữ nguyên, không có bảng mới | Đạt |
| Không đổi dữ liệu ngoài vùng đã xác nhận | Sau toàn bộ luồng, K2 và L5 nguyên vẹn. A30 đứng yên khi add-in ghi vào dòng trống. A30 chỉ dời xuống A31 sau khi người dùng xác nhận "Vẫn thêm dòng". Vùng in A1:I27 không lấn sang cột K, L | Đạt |
| Không tạo sheet/table trùng | Bấm Tạo 3 lần liên tiếp → đúng 1 sheet, 1 bảng. Bấm đúp Thêm vào bảng, Lưu thông tin, Lưu công tác thư viện → mỗi lần chỉ 1 kết quả | Đạt |

## Thư viện cá nhân

| Mục | Bằng chứng | Kết quả |
|---|---|---|
| Tự thêm/sửa/xóa/tìm kiếm | Thêm NT-01, sửa giá 320.000 → 335.000. Tìm không dấu: "lat gach nghiem thu" và "be tong" ra đúng mục. Xóa có hộp xác nhận nêu rõ báo giá không bị đổi | Đạt |
| Không có dữ liệu định mức/giá giả lập cài sẵn | Quét mã nguồn: không có dữ liệu mẫu hay tỷ lệ mặc định ("8%", "Thuế GTGT" chỉ là placeholder). Thư viện mới trống (checklist 08, L1). Tab Thư viện ghi "không kèm sẵn định mức hay đơn giá nào" | Đạt |
| Import có preview và validation | Bảng xem trước Mới/Trùng/Lỗi/Dòng trống theo từng loại. Nút nhập ghi rõ số bản ghi. Hỏi xác nhận trước khi ghi. Lỗi theo dòng và cột: checklist 09, X5 | Đạt |
| Export/import lại bảo toàn dữ liệu | Sao lưu JSON rồi nhập lại → 14/14 bản ghi trùng, 0 mới, 0 lỗi. Nút nhập khóa ở "0 bản ghi" | Đạt |
| Backup/restore; mô tả storage | Xóa XT-02 (kèm 1 định mức) → nhập lại bản sao lưu → "thêm 2". XT-02 trở về đủ, kể cả định mức và dấu `"` trong tên. Tab Cài đặt nêu: IndexedDB trên máy, không gửi đi, mất khi xóa cache Office, không đồng bộ. Thêm [docs/LIBRARY.md](../../docs/LIBRARY.md) | Đạt |

## Tính toán

| Mục | Bằng chứng | Kết quả |
|---|---|---|
| Thành tiền/tổng đúng | 12,5 × 185.000 = 2.312.500 · 40 × 265.000,5 = 10.600.020 · 2 × 1.250.000,75 = 2.500.001,5 · 7.600.000 · 3.600.000 · 700.000. Tổng 27.312.521,5 khớp tính tay | Đạt |
| | Tổng hợp: −5% = −1.365.626,1; +8% = 2.075.751,672; tổng cộng 28.022.647,572 | Đạt |
| Quy tắc làm tròn rõ ràng | 3 nhóm quy tắc, mặc định "Không làm tròn", làm tròn bằng hàm Excel trong công thức. Áp dụng "Gần nhất, 0 chữ số" cho Thành tiền → 2.500.001,5 thành 2.500.002 | Đạt |
| Thiếu dữ liệu/công thức lỗi có cảnh báo | Cố ý xóa đơn giá, gõ chữ vào khối lượng, gõ đè thành tiền, xóa đơn vị → 10 lỗi, 3 cảnh báo, đúng ô | Đạt |
| | Mọi mục đều có "Cách sửa" — trước khi sửa thì các mục của bảng tổng hợp còn thiếu | Đạt (đã sửa) |
| | Khôi phục dữ liệu → "Không phát hiện vấn đề nào" | Đạt |
| Không hard-code thuế/chiết khấu | Khoản mục mới thêm có tên và giá trị trống. Chiết khấu và thuế do người dùng tự nhập | Đạt |
| Truy vết nguồn giá | Dòng chèn từ thư viện có ghi chú "Thư viện: 007; hiệu lực 01/01/2026 – 31/12/2026; tiền tệ: VND". Kiểm tra báo giá tổng hợp nguồn: Thư viện 1 · Nhập trực tiếp 5. Phân tích từ định mức nằm trên sheet "Phân tích đơn giá" (checklist 10) | Đạt |

## Chất lượng

| Mục | Bằng chứng | Kết quả |
|---|---|---|
| Lint/typecheck/build/test đạt hoặc nêu giới hạn | Xem "Kết quả kiểm tra tự động" bên dưới | Đạt, có giới hạn đã ghi |
| Luồng chính đã thử trong Excel thật | Tạo mẫu → thông tin → thêm công tác (tay và từ thư viện) → làm tròn → tổng hợp → kiểm tra → ghi chú/điều khoản → thiết lập in → xuất PDF (1 trang, đủ tiếng Việt, "Trang 1 / 1") → tab Tổng quan báo đủ các bước | Đạt |
| Không có secret trong repository | `git grep` và quét toàn bộ lịch sử git tìm private key, token GitHub/AWS/OpenAI: không thấy. Không có file `.pem/.pfx/.env`. Workflow không dùng `secrets.*` | Đạt |
| README đúng với project thực tế | Đã sửa các chỗ cũ: thư viện "khi được triển khai", cấu trúc `src/` thiếu `domain/`, `application/`; thêm trạng thái nghiệm thu | Đạt (đã sửa) |

## Lỗi tìm thấy trong lần nghiệm thu (đã sửa, đã chạy lại trên Excel)

1. **Ngày lập/Hiệu lực có thể hiện sai thứ tự ngày–tháng trên máy khác.**
   - Hiện tượng: add-in ghi định dạng `dd/mm/yyyy`, nhưng máy có ngày ngắn của Windows là dd/MM/yyyy thì Excel đổi thành định dạng ngày hệ thống (đọc lại là `m/d/yyyy`). Mở file trên máy định dạng vùng en-US sẽ hiện 10/21/2026.
   - Sửa: ghi `dd/mm/yyyy;@` (Excel giữ nguyên) và căn trái cho thẳng hàng với các mục chữ khi in.
2. **Dòng trống của mẫu bị bỏ lại phía trên và vẫn được in ra.**
   - Hiện tượng: công tác thêm bằng add-in luôn được chèn thêm dòng, nên 5 dòng trống của mẫu vẫn còn và bị in ra kèm STT 1–5; công tác thật mang STT 6–8.
   - Ngay sau khi tạo mẫu, lần thêm đầu tiên còn hỏi "đẩy dữ liệu bên dưới".
   - Sửa: khi thêm 1 dòng, add-in ghi vào dòng trống thay vì chèn: dòng đang chọn nếu trống, rồi dòng ngay dưới, hoặc dòng trống đầu tiên ở cuối bảng. Chỉ ghi các cột của mẫu.
   - Trạng thái trống của từng dòng nằm trong vân tay kiểm tra, nên nếu người dùng vừa gõ vào dòng đó, add-in dừng chứ không ghi đè.
   - Kiểm tra báo giá thêm cảnh báo "Còn N dòng trống trong bảng (hàng …)", kèm cách xóa.
3. **Chèn dòng làm mất công thức ở cột người dùng tự thêm** (có từ giai đoạn 06).
   - Hiện tượng: add-in ghi `""` vào cột đó, nên công thức của cột tính toán bị xóa ở dòng mới.
   - Sửa: không ghi cột người dùng (`null`); Excel tự điền công thức cột. Đã kiểm chứng `=ROW()*10` được giữ. Sửa cả bảng phân tích đơn giá.
4. **Thiếu "Cách sửa" ở các mục của bảng tổng hợp và mục "Phân tích mã … thiếu".**
   - Checklist 13–17 ghi "mọi mục có Cách sửa" là chưa đúng.
   - Sửa: đã bổ sung, kèm unit test.

## Quan sát đã được người dùng quyết định (2026-10-22): giữ theo nguyên tắc của Excel

- **Đơn giá có phần lẻ hiển thị làm tròn.**
  - Cột Đơn giá dùng định dạng `#,##0`, nên 265.000,5 hiện thành 265.001, trong khi Thành tiền tính theo số thật (40 × 265.000,5 = 10.600.020).
  - Quyết định: hiển thị theo định dạng ô của Excel. Chỉ làm tròn giá trị khi người dùng đặt quy tắc; người dùng tự chỉnh định dạng ô nếu muốn thấy phần lẻ.
- **Khoản tổng hợp mặc định không làm tròn.**
  - Tổng sau thuế là 28.022.647,572: task pane hiện đủ phần lẻ, bản in hiện 28.022.648 theo định dạng ô.
  - Quyết định: giữ theo nguyên tắc của Excel; nếu cần số chẵn, người dùng đặt quy tắc làm tròn cho nhóm "Khoản chiết khấu/phụ phí/thuế".
- Ghi vào [ADR-0008](../../docs/ADR/0008-tinh-don-gia-va-thanh-tien.md) (mục Làm tròn). Không đổi code.

## Chờ người dùng

**P1: cài bản production từ thư mục catalog.**
- Cách làm: Excel › **Home** › **Add-ins** › **Advanced** › **SHARED FOLDER** › chọn ConsQuotation, sau khi manifest 1.8.0.0 đã được chép vào catalog.
- Kết quả mong đợi: có tab **ConsQuotation** với đủ nút; tab Cài đặt hiện "Chính thức (production)" và phiên bản 1.8.0.
- Claude không tự cài vì đây là thao tác thêm add-in vào Office của bạn.

## Kết quả kiểm tra tự động

Chạy sau thay đổi mã cuối cùng (2026-10-22), đúng các lệnh trong `package.json`:

| Lệnh | Kết quả |
|---|---|
| `npm run lint` | Đạt, 0 lỗi |
| `npm run typecheck` | Đạt, 0 lỗi |
| `npm run test` | Đạt, 17 file, 244/244 test |
| `npm run build` | Đạt, kèm 3 cảnh báo kích thước: `taskpane.js` 573 KiB (161 KiB gzip) vượt mức khuyến nghị 244 KiB |
| `npm run validate` | Manifest hợp lệ |

## Giới hạn còn tồn tại

- **Chưa kiểm thử:**
  - Excel trên web, Mac, và Excel 2016–2024 bản retail (không có môi trường).
  - Excel giao diện tiếng Việt và định dạng vùng en-US (không đổi cài đặt hệ thống của máy thử). Riêng lỗi 1 ở trên đã được sửa để không phụ thuộc định dạng vùng.
  - In ra máy in thật (đã kiểm tra qua xuất PDF).
- **Cảnh báo kích thước bundle:** chưa tách code vì task pane mở dưới 0,5 giây ([PERFORMANCE.md](../../docs/PERFORMANCE.md)).
- **Thao tác của add-in không hoàn tác được bằng Ctrl+Z.** Bù lại, add-in luôn kiểm tra và hỏi trước khi ghi đè hoặc đẩy dữ liệu.
- **Chưa làm** các đặc tả 12 (lưu trữ và quyền riêng tư), 18, 19, 21.
