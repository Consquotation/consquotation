# Kiểm thử thư viện đơn giá cá nhân v2 (2026-10-26, bản 1.9.0)

Phạm vi: nhóm, nhà cung cấp, lọc/sắp xếp, phần tổng quan, nhập từ Excel Table, schema v2 và nâng cấp từ v1. Tài liệu: [docs/LIBRARY.md](../../docs/LIBRARY.md), [docs/LIBRARY_SCHEMA.md](../../docs/LIBRARY_SCHEMA.md), [ADR-0012](../../docs/ADR/0012-danh-muc-nha-cung-cap-schema-v2.md).

**Lần chạy 2026-10-26:** Claude tự chạy trên Excel desktop thật (build 16.0.20430.20182), bản dev, workbook tạm do `npm start` mở. Task pane được điều khiển qua DevTools; kết quả đọc lại từ IndexedDB và từ Excel. Excel không chạy workbook nào của người dùng trong lúc thử. Ghi `Đạt` / `Không đạt` / `Chưa chạy`.

## Nâng cấp và độ bền

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| V1 | Mở tab Thư viện với thư viện v1 có sẵn của bản dev | Database lên v2; giữ đủ bản ghi; mỗi tên nhóm cũ thành một nhóm; không còn trường `group` | Đạt: 4 công tác, 3 tài nguyên, 4 giá, 3 định mức giữ nguyên; 3 nhóm (Tường, Móng, Khác); 0 công tác lệch nhóm |
| V2 | Tải lại task pane | Dữ liệu, tên thư viện, số liệu tổng quan còn nguyên | Đạt |
| V3 | Khởi động lại Excel | Như V2 | Chưa chạy (đã kiểm tra IndexedDB còn sau khi tải lại pane; Excel được đóng hẳn ở cuối lần thử, chưa mở lại để đối chiếu) |
| V4 | Lỗi lưu trữ (IndexedDB đầy/bị đóng) | Báo lỗi tiếng Việt ở form/danh sách, không im lặng | Chưa chạy trên Excel (chưa có cách gây lỗi IndexedDB an toàn); đã có unit test cho thông báo lỗi lưu trữ |

## Nhóm và nhà cung cấp

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| C1 | Danh mục › Thêm nhóm "Cây xanh thử" | Lưu; hiện "0 công tác · 0 tài nguyên" | Đạt |
| C2 | Thêm nhóm "  cây   xanh thử " | Báo lỗi trùng tại ô Tên nhóm, không lưu | Đạt |
| C3 | Sửa nhóm "Khác" thành "Khác (thử đổi tên)" | Đổi tên; số bản ghi giữ nguyên | Đạt |
| C4 | Xóa nhóm "Tường" (đang có 1 công tác), chọn chuyển sang "Cây xanh thử" | Hộp xác nhận nêu số bản ghi và ô chọn nơi chuyển; công tác chuyển sang nhóm mới, không bị xóa | Đạt |
| C5 | Xóa nhà cung cấp đang dùng (1 công tác, 1 giá) | Hộp xác nhận nêu số liệu; chỉ bỏ liên kết; nguồn giá giữ nguyên | Đạt |

## Công tác, tài nguyên, giá

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| F1 | Lưu công tác thiếu tên, đơn vị, đơn giá -5 | Lỗi tại từng ô; mã đã gõ vẫn còn | Đạt |
| F2 | Đơn giá "1.250.000 VNĐ" | Báo số không hợp lệ | Đạt |
| F3 | Tên trùng công tác có sẵn | Gợi ý "Đã có bản ghi cùng tên: XT-02", vẫn lưu được | Đạt |
| F4 | Chọn "+ Nhóm mới…" và "+ Nhà cung cấp mới…" trong form, bấm đúp Lưu | 1 công tác, 1 nhóm, 1 nhà cung cấp; giá 1.250.000,5 giữ phần lẻ | Đạt |
| F5 | Tài nguyên có nhóm; giá 0 có nhà cung cấp | Lưu; danh sách hiện "giá hiện hành 0 VND / m3"; Kiểm tra thư viện cảnh báo giá bằng 0 | Đạt |
| F6 | Xóa công tác: hộp xác nhận, bấm Hủy | Hộp xác nhận ghi "mã: tên"; Hủy không xóa | Đạt |

## Tìm kiếm, lọc, sắp xếp, giao diện

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| S1 | Tìm "vuon uom" | Ra công tác của nhà cung cấp "Vườn ươm Thử" | Đạt |
| S2 | Tìm chuỗi không có | "Không có mục nào khớp tìm kiếm." | Đạt |
| S3 | Lọc nhóm "Móng", "Chưa phân nhóm"; lọc loại "Nhân công" | Đúng bản ghi | Đạt |
| S4 | Sắp theo đơn giá | Tăng dần, "Chưa có giá" ở cuối | Đạt |
| S5 | Chiều rộng task pane 320 px | Không cuộn ngang ở tab Thư viện (mọi mục) và các tab Tổng quan, Báo giá, In ấn, Cài đặt | Đạt sau khi sửa (xem lỗi 1). Tab Tính giá vẫn rộng 348 px: lỗi có từ trước, ghi ở phần tồn tại |
| S6 | Thư viện rỗng | Thông báo "chưa có công tác/tài nguyên" | Chưa chạy trên Excel (không xóa thư viện dev để thử); thông báo này không đổi so với bản 1.8.0 |

## Nhập, xuất, sao lưu

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| I1 | Nhập từ Excel Table "BangGiaThu" (bảng của người dùng) | Đọc đúng vùng bảng, tự map cột | Đạt |
| I2 | Bản xem trước | 2 mới, 1 trùng (mã "007"), 2 lỗi (thiếu tên, giá "abc") theo dòng và cột; "1 nhà cung cấp mới: Vườn ươm B" | Đạt |
| I3 | Hủy ở hộp xác nhận, rồi Nhập (bấm đúp) | Hủy không ghi; Nhập ghi đúng một lần | Đạt |
| I4 | Sau khi nhập | Không có nhóm/nhà cung cấp tạo từ dòng lỗi; giá là công thức `=2*100` nhập thành 200; chữ "=1+1" giữ là chữ; bảng nguồn không đổi | Đạt |
| I5 | Đổi tên thư viện, tải bản sao lưu JSON | File schema 2 có `library.name`, nhóm, nhà cung cấp, tham chiếu bằng id | Đạt |
| I6 | Nhập lại chính file vừa tải | 24 bản ghi đều trùng; không thêm gì | Đạt |
| I7 | Chọn file sao lưu v1 ngày 2026-10-22 | Đọc được, xem trước đủ 4 loại dữ liệu | Đạt |
| I8 | Xuất ra workbook Excel | Workbook mới có sheet Thông tin (schemaVersion 2, libraryName), Nhóm, Nhà cung cấp, Công tác (có cột Nhóm, Nhà cung cấp)… | Đạt (workbook xuất được đóng không lưu sau khi kiểm) |

## Hồi quy

| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| R1 | Tạo bảng báo giá, chèn công tác THU-T1 từ thư viện, nhập khối lượng 3 | Nhóm công tác "Cây xanh thử"; Thành tiền 2.550.000; ghi chú "Thư viện: THU-T1; nhà cung cấp: Vườn ươm B; tiền tệ: VND" | Đạt |
| R2 | Kịch bản tích hợp lớp core (giai đoạn 14) | 26/26 | Đạt |

## Lỗi phát hiện trong lần chạy (đã sửa)

1. **Task pane cuộn ngang ở chiều rộng 320 px.**
   - Thanh tab chính (6 tab) đã tràn từ trước. Thanh tab của thư viện và ô chọn nhà cung cấp trong bộ lọc cũng tràn.
   - Cách sửa: hai thanh tab tự xuống dòng; ô chọn trong bộ lọc không rộng hơn cột lưới.
2. **Hộp xác nhận nhập không nhắc nhóm/nhà cung cấp sẽ tạo.** Nút ghi "Nhập 3 bản ghi" nhưng hộp xác nhận ghi "Thêm mới 2 bản ghi". Đã thêm "tạo 1 nhà cung cấp mới" vào câu xác nhận.
3. **Form giá nguồn không báo lỗi lưu trữ.** Lỗi IndexedDB khi lưu hoặc xóa giá bị bỏ qua mà không báo. Đã thêm thông báo lỗi. Danh sách công tác cũng báo lỗi khi sao chép hoặc xóa thất bại.

Ghi chú về dữ liệu thử: lần đọc Table đầu tiên ra "Nhập 4 bản ghi" vì ô "007" ghi qua `formulas` đã bị Excel đổi thành số 7 (ADR-0008, kết quả 5). Add-in đọc đúng giá trị trong ô; kịch bản sửa ô thành chữ rồi đọc lại.
