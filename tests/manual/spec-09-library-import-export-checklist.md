# Kiểm thử — Nhập, xuất và sao lưu thư viện (prompts/09_LIBRARY_IMPORT_EXPORT.md)

## Môi trường

- **Ngày chạy:** 2026-10-21. Claude tự chạy toàn bộ checklist.
- **Excel:** Excel desktop thật, Microsoft 365, build 16.0.20430.20182.
- **Cách điều khiển:** task pane được điều khiển qua DevTools (cổng 9229), chạy trong workbook tạm do `npm start` tạo.
- **Chọn file:** file được gán cho ô chọn file bằng `DOM.setFileInputFiles`. Riêng hộp thoại Open thật được kiểm tra ở bước X17.
- **File thử:**
  - Nằm trong `Downloads\cq-test`.
  - WebView2 không đọc được file trong thư mục Temp khi gán qua DevTools, vì vậy file thử được đặt trong Downloads.
- **Dọn dẹp sau khi chạy:** thư viện dev được khôi phục về bản sao lưu JSON tạo ở bước X9.

## Kết quả

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| X1 | Mở Thư viện › **Nhập/Xuất** | Có 3 nút xuất, phần nhập, và danh sách sheet. Nhắc "chưa sao lưu lần nào" kèm nút **Sao lưu ngay** | Đạt |
| X2 | Chọn lần lượt: file rỗng; CSV mã Windows-1258; `.xlsx`; JSON lạ; JSON schema 2; JSON sai cú pháp; file đã bị xóa sau khi chọn | Mỗi trường hợp có thông báo tiếng Việt đúng; không sang bước kế tiếp | Đạt (sau khi sửa lỗi 1) |
| X3 | CSV chỉ có dòng tiêu đề | Tổng 0 dòng; nút Nhập bị vô hiệu | Đạt |
| X4 | `tainguyen.csv` (dấu `,`; loại `nhan cong` không dấu; một dòng loại `Kim loại`) → Nhập, bấm xác nhận 2 lần | Thêm 3 tài nguyên. Báo lỗi đúng "Dòng 5, cột C (Loại)". Chỉ ghi 1 lần | Đạt |
| X5 | `congtac.csv`: UTF-8 BOM, dấu `;`, 2 dòng tiêu đề phụ, mã `007`, tên `=SUM(A1:A3)`, `1250000,75`, ngày dd/mm/yyyy. Lỗi cài sẵn: thiếu đơn vị, `1.500.000`, `31/02/2026`, mã trùng có khoảng trắng, có giá nhưng thiếu tiền tệ, một dòng trống | Tự nhận tiêu đề ở dòng 3. Kết quả: 3 mới, 5 lỗi (đúng dòng và cột), 1 dòng trống. Dữ liệu lưu đúng: `1250000.75`, ngày ISO; đơn giá trống thành `null`, tiền tệ không bị tự điền | Đạt |
| X6 | Đổi dòng tiêu đề sang 1 | Chặn với thông báo "Thiếu cột bắt buộc…"; nút Nhập bị vô hiệu | Đạt |
| X7 | Nhập lại `congtac.csv` | Bỏ qua: 3 trùng, 0 bản ghi để nhập. Cập nhật: 3 bản ghi | Đạt |
| X8 | `gia.csv` và `dinhmuc.csv` | Giá thiếu đơn vị bị báo lỗi, không lấy đơn vị của tài nguyên. Mã tài nguyên lạ bị báo lỗi. Hao phí 0 bị báo lỗi. `0,000123` được lưu đúng | Đạt |
| X9 | `sai-tieu-de.csv`: không nhận ra loại → chọn Công tác → map tay 3 cột; thử map 1 cột cho 2 trường | Có cảnh báo không nhận ra loại; sau khi map thì nhập được 1 bản ghi. Map trùng cột bị chặn | Đạt |
| X10 | **Tải bản sao lưu (.json)** | File `ConsQuotation-thu-vien-…json` có trong Downloads, đủ 4+3+2+2 bản ghi, tiếng Việt đúng. Nhắc sao lưu đổi thành "Lần sao lưu/xuất gần nhất" | Đạt |
| X11 | Giả lập xóa cache (xóa database) → nhập file JSON vừa tải | Khôi phục 11 bản ghi, **giống hệt** bản sao lưu (cả id và thời điểm) | Đạt |
| X12 | Nhập lại cùng file JSON | Cả 11 bản ghi là trùng; 0 bản ghi để nhập | Đạt |
| X13 | **Xuất ra workbook Excel** (kiểm tra workbook mới qua COM) | Có sheet Thông tin và 4 sheet dữ liệu. Mã `007` dạng chữ; `1250000,75` và `0,000123` dạng số; ngày dạng chữ ISO; `=SUM(A1)` dạng chữ | Đạt |
| X14 | Chép các sheet đã xuất vào workbook test, xóa database → **Đọc toàn bộ bản xuất** → Nhập | Nhận ra bản xuất kèm thời điểm xuất. Khôi phục 11 bản ghi, nội dung giống bản gốc | Đạt (sau khi sửa lỗi 3) |
| X15 | Sheet "Bảng giá NCC" tự tạo: tiêu đề ở dòng 4, bắt đầu từ cột B; mã là số định dạng `000`; ngày Excel ở 2 định dạng; ngày dạng chữ; `1.700.000` dạng chữ; số 45000 không định dạng ngày | Nhận tiêu đề dòng 4. Mã đọc thành `007`. Ngày Excel thành ISO. Số 45000 bị báo "Ngày không hợp lệ" thay vì bị đoán là ngày. Nhãn lỗi chỉ đúng cột C/F. Không ghi gì vào sheet | Đạt |
| X16 | File lớn: CSV 20.000 công tác | Có cảnh báo nhập lâu. Đổi chế độ trùng mất 0,47 s. Ghi mất 4,5 s, trong lúc ghi hiện "Đang ghi vào thư viện…" và khóa các nút. Tab Công tác với 20.004 mục mở trong 0,4 s; tìm kiếm mất 0,38 s | Đạt (sau khi sửa lỗi 2 và 4) |
| X17 | Bấm **Chọn file** (có thao tác người dùng) | Hộp thoại **Open** của Windows mở ra. Đóng hộp thoại thì pane giữ nguyên, không báo lỗi | Đạt |
| X18 | Bấm Hủy ở hộp xác nhận | Không ghi gì | Đạt |
| X19 | Đang ở bước xem trước thì task pane khác thêm cùng mã vào thư viện → bấm Nhập | Dừng lại với thông báo "Thư viện vừa thay đổi…". Không ghi gì. Kết quả kiểm tra cập nhật thành 1 trùng | Đạt |
| X20 | **Mở file mẫu trống** | Workbook mới chỉ có dòng tiêu đề; cột mã định dạng `@` | Đạt |
| X21 | Tab Cài đặt | Hiện "Chưa sao lưu lần nào" hoặc thời điểm sao lưu; câu chỉ dẫn tới Thư viện › Nhập/Xuất | Đạt (sau khi sửa lỗi 5) |

## Lỗi phát hiện và đã sửa trong lần chạy này

1. **File không đọc được thì hiện lỗi tiếng Anh.**
   - Hiện tượng: nếu file bị xóa hoặc di chuyển sau khi chọn, pane hiện nguyên văn lỗi của trình duyệt ("A requested file or directory could not be found…").
   - Sửa: hiện thông báo tiếng Việt và hướng dẫn chọn lại.
2. **Không có dấu hiệu đang chạy khi nhập lớn.**
   - Hiện tượng: với 20.000 dòng, sau khi xác nhận khoảng 4,5 giây không có thông báo gì.
   - Sửa: hiện "Đang ghi vào thư viện…" và khóa các nút trong lúc ghi.
3. **Thời điểm xuất hiện dạng ISO thô** (`2026-10-21T02:26:45.493Z`).
   - Sửa: hiện dạng `21/10/2026 09:26`.
4. **Danh sách thư viện lớn mở chậm** (lỗi có từ spec 08).
   - Hiện tượng: tab Công tác với 20.004 mục mất 2,4 s, vì `localeCompare(…, "vi")` tạo bộ so sánh mới mỗi lần gọi.
   - Sửa: dùng chung một `Intl.Collator`; nay mất 0,4 s.
5. **Tab Cài đặt còn câu cũ** "sao lưu thư viện sẽ có ở đây khi tính năng Thư viện của tôi được triển khai" (có từ spec 05).
   - Sửa: đổi thành câu chỉ dẫn tới Thư viện › Nhập/Xuất.
6. Báo cáo sau khi nhập vẫn ghi "các dòng này **sẽ** không được nhập". Sửa: đổi thành "N dòng lỗi đã được bỏ qua (không nhập)".
7. Danh sách sheet: Excel trả về vùng A1 cho sheet trống. Sửa: kiểm tra giá trị ô đó để báo đúng là "(trống)".

## Chưa kiểm thử

- Excel trên web và Mac: tải file JSON, chọn file và `Excel.createWorkbook`.
- Việc chọn file qua hộp thoại Open đến hết luồng nhập. Hộp thoại đã mở được (X17), nhưng phần đọc file được kiểm tra bằng cách gán file qua DevTools.
