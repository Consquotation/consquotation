# Checklist kiểm thử thủ công trên Excel desktop (giai đoạn 18)

Dùng cho người kiểm thử trên Excel Microsoft 365 Windows, bản dev (`npm start`) hoặc bản production đã cài. Chỉ dùng workbook mới hoặc bản sao. Không dùng thư viện hay báo giá thật. Dữ liệu giả định nên có mã bắt đầu bằng `THU-`.

Cột "Kết quả 2026-10-27/28" ghi lần Claude tự chạy qua DevTools trên Excel 16.0.20430 (workbook tạm, dữ liệu giả định). "Chưa chạy" nghĩa là cần người kiểm thử làm.

Trước khi bắt đầu: đảm bảo cổng 3000 không bị dev server khác chiếm (xem README › Lỗi thường gặp).

## A. Khởi động

| # | Bước | Kỳ vọng | Kết quả 2026-10-27/28 |
|---|---|---|---|
| A1 | `npm start`, mở tab ConsQuotation (Dev) › Mở ConsQuotation | Pane hiện "Đã tải xong · Đã kết nối Excel", có 7 tab | Đạt |
| A2 | Đóng pane, mở lại | Dữ liệu báo giá đọc lại từ workbook, không mất | Đạt (tải lại pane: trạng thái Nháp và 2 dòng còn nguyên) |

## B. Luồng 12 bước

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| B1 | Báo giá › Tạo bảng báo giá trên sheet mới | Bảng 14 cột, cột Mã dòng ẩn, khối thông tin 10 mục | Đạt (kịch bản) |
| B2 | Điền thông tin công trình (khách hàng, địa điểm, gói thầu, ngày lập, hiệu lực) › Lưu | Ghi vào sheet, ngày dạng dd/mm/yyyy; hiệu lực trước ngày lập bị báo lỗi | Đạt (kịch bản) |
| B3 | Thêm một công tác nhập tay | Dòng có Mã dòng; tab Công tác: Hợp lệ | Đạt |
| B4 | Thư viện › công tác có định mức › Chèn vào báo giá › Phân tích từ định mức | Hiện từng tài nguyên, giá chọn sẵn khi chỉ có một giá hoặc đã lưu giá áp dụng | Đạt |
| B5 | Chọn giá cho tài nguyên có nhiều giá; giá khác đơn vị không chọn được | Đúng | Đạt (kịch bản) |
| B6 | Nhập khối lượng › Thêm | Sheet phân tích có khối mới; dòng báo giá có đơn giá và 4 đơn giá thành phần khớp phép tính tay | Đạt |
| B7 | Sửa khối lượng ngay trên sheet | Thành tiền đổi; đơn giá không đổi | Đạt |
| B8 | Công tác › Tính lại và lưu | "Đã lưu kết quả tính vào hồ sơ." | Đạt |
| B9 | Tính giá › Tổng hợp: thêm chiết khấu % rồi thuế % | Thứ tự áp dụng và lũy kế đúng phép tính tay | Chưa chạy lại ở giai đoạn 18 (đã có ở giai đoạn 10) |
| B10 | Công tác › Đánh dấu hoàn tất | "Đã hoàn tất" | Đạt |
| B11 | File › Save As (.xlsx), đóng, mở lại, mở pane, tab Công tác | Trạng thái, dòng, tổng như trước khi lưu | Đạt ở giai đoạn 17; chưa chạy lại sau bản sửa B2 |
| B12 | In ấn › xuất PDF | Cột Mã dòng không in; 13 cột vừa trang theo thiết lập co giãn | Chưa chạy |

## C. Snapshot và thư viện

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| C1 | Sửa giá một tài nguyên trong Thư viện | Báo giá giữ giá cũ; dòng "Có cảnh báo" nêu giá cũ → mới; báo giá vẫn "Đã hoàn tất" | Đạt |
| C2 | Bấm Cập nhật theo thư viện › xác nhận | Hộp xác nhận nêu từng giá đổi; sau cập nhật số liệu đúng; báo giá về Nháp; ghi chú hao hụt giữ nguyên | Đạt |
| C3 | Chuyển định mức sang Ngừng dùng | Dòng có cảnh báo "đã chuyển sang Ngừng dùng"; số liệu không đổi | Đạt (unit test + kịch bản với phiên bản mới) |
| C4 | Xóa giá đã dùng trong thư viện | Cảnh báo "không còn trong thư viện"; báo giá không đổi | Đạt (unit test) |

## D. Sửa trực tiếp trong Excel

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| D1 | Gõ thêm một dòng ngay trong bảng | Cảnh báo "chưa có Mã dòng"; Tính lại và lưu gán mã | Đạt |
| D2 | Sao chép một dòng (cùng Mã dòng) | Cảnh báo "Mã dòng trùng"; Tính lại gán mã mới | Đạt (giai đoạn 17) |
| D3 | Xóa một dòng | Tính lại bỏ mục hồ sơ | Đạt (giai đoạn 17) |
| D4 | Gõ chữ vào ô Khối lượng; xóa trống ô Khối lượng | Dòng Lỗi đúng nguyên nhân; Hoàn tất bị chặn | Đạt |
| D5 | Xóa giá nguồn của một tài nguyên trên sheet phân tích | Dòng Lỗi chỉ đúng tài nguyên; tổng add-in khác ô tổng và có giải thích | Đạt |
| D6 | Đổi tên cột "Khối lượng" | Báo lỗi cấu trúc; Hoàn tất bị chặn; đổi lại tên thì hết | Đạt (kịch bản) |
| D7 | Đổi tên sheet báo giá | Vẫn dùng được | Đạt (kịch bản) |
| D8 | Bảo vệ sheet rồi Tính lại và lưu | Thông báo AccessDenied; hồ sơ không đổi | Đạt (giai đoạn 17) |
| D9 | Xóa sheet báo giá đã hoàn tất, tạo báo giá mới | Báo giá mới "Chưa có hồ sơ", không nhận trạng thái cũ (lỗi B1) | Đạt (kịch bản) |

## E. Nhiều báo giá và dữ liệu lớn

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| E1 | Hai báo giá trong một workbook | Hồ sơ riêng; lưu báo giá này không đổi báo giá kia | Đạt (kịch bản) |
| E2 | 300 dòng | Tab Công tác mở dưới 1 giây; Tính lại và lưu dưới vài giây; tổng đúng | Đạt: 0,2–0,3 s; 1,1–1,9 s |
| E3 | Mở cùng workbook ở hai cửa sổ Excel, bấm Tính lại cùng lúc | Một bên có thể báo "vừa thay đổi"; Tính lại lần nữa thì khớp | Chưa chạy bằng hai cửa sổ thật (đã giả lập bằng 3 service song song) |

## F. Thư viện, nhập/xuất (hồi quy)

| # | Bước | Kỳ vọng | Kết quả |
|---|---|---|---|
| F1 | Nhập file CSV có dòng sai, mã trùng | Báo đúng dòng/cột; không nhập dòng lỗi | Đạt (unit test) |
| F2 | Xuất thư viện ra workbook rồi đọc lại | Toàn bộ là trùng, không thêm gì | Đạt (unit test; giai đoạn 15–16 trên Excel) |
| F3 | Tải bản sao lưu JSON rồi khôi phục vào thư viện trống | Đủ bản ghi, id, thời điểm | Đạt (unit test) |

## G. Giao diện

| # | Bước | Kỳ vọng | Kết quả 2026-10-28 |
|---|---|---|---|
| G1 | Tab Công tác khi workbook chưa có bảng báo giá | "Workbook chưa có bảng báo giá. Tạo bảng ở tab Báo giá." | Đạt |
| G2 | Bảng chưa có dòng | "Bảng chưa có dòng công tác nào." | Đạt |
| G3 | Khối lượng "1.500.000" ở form Thêm công tác | Lỗi kèm hướng dẫn, không ghi; không lặp câu hướng dẫn (B4) | Đạt sau khi sửa B4 |
| G4 | Nhập lại khối lượng đúng › Thêm | Dòng được thêm | Đạt |
| G5 | Tìm "tim kiem" (không dấu) | Chỉ còn dòng có "tìm kiếm" | Đạt |
| G6 | Lọc "Lỗi" khi không có dòng lỗi | "Không có dòng nào khớp bộ lọc." | Đạt |
| G7 | Lọc "Lỗi" khi có một dòng lỗi | Đúng một dòng | Đạt |
| G8 | Đánh dấu hoàn tất khi còn lỗi | "Chưa hoàn tất được:" kèm lý do | Đạt |
| G9 | Bấm đúp Tính lại và lưu | Nút bị khóa, hiện "Đang đọc bảng báo giá…" | Đạt |
| G10 | Sau bấm đúp | Một thông báo thành công; hồ sơ 2 mục, 2 mã, không trùng | Đạt |
| G11 | Tải lại pane | Trạng thái Nháp giữ nguyên | Đạt |
| G12 | Tải lại pane | Danh sách dòng giữ nguyên | Đạt |
| G13 | Bề rộng 320px, cả 7 tab | Không tràn ngang (305px) | Đạt |
| G14 | Chi tiết dòng phân tích | Nguồn, định mức và phiên bản, thành phần với cơ sở, hao hụt, giá | Đạt (giai đoạn 17) |
| G15 | Đi tới dòng | Excel chọn đúng dòng | Đạt (giai đoạn 17) |
| G16 | Bảng cũ 9 cột | Banner nêu 5 cột thiếu; Bổ sung cột có xác nhận | Đạt (giai đoạn 17) |

## H. Chưa kiểm chứng (cần người kiểm thử hoặc môi trường khác)

- Excel trên web, Mac.
- In và xuất PDF bảng 14 cột (B12).
- Lưu, đóng, mở lại file thật sau bản sửa B2 (B11).
- Hai cửa sổ Excel thật cùng ghi (E3).
- Cài bản production.
