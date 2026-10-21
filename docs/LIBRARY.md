# Thư viện của tôi — nơi lưu, sao lưu, khôi phục, chuyển máy

Theo [prompts/08_USER_OWNED_LIBRARY.md](../prompts/08_USER_OWNED_LIBRARY.md) và [ADR-0003](ADR/0003-luu-tru-thu-vien-ca-nhan.md).

## Thư viện chứa gì

| Loại | Nội dung |
|---|---|
| Công tác | Mã, tên, nhóm, đơn vị, mô tả, đơn giá (có thể để trống), tiền tệ, nguồn giá, ngày hiệu lực, ghi chú |
| Tài nguyên | Vật liệu, nhân công, máy thi công hoặc loại khác: mã, tên, đơn vị |
| Giá tài nguyên | Đơn giá, đơn vị, tiền tệ, ngày hiệu lực, nguồn, trạng thái (đang dùng/ngưng dùng). Một tài nguyên có thể có nhiều giá |
| Định mức | Hao phí tài nguyên cho 1 đơn vị công tác (tùy chọn) |

ConsQuotation **không kèm sẵn** định mức, đơn giá hay danh mục nào. Thư viện mới luôn trống.

## Lưu ở đâu

- Trong **bộ nhớ cục bộ (IndexedDB) của add-in**, trên máy đang dùng. Dữ liệu gắn với:
  - tài khoản Office đang đăng nhập;
  - địa chỉ của add-in: bản production là `https://consquotation.github.io/consquotation/`, bản dev là `https://localhost:3000`, và hai nơi này **tách biệt nhau**.
- Trên Windows, dữ liệu nằm trong thư mục `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`.
- **Không gửi lên máy chủ nào.** Không đồng bộ giữa các máy, cũng không đồng bộ giữa Excel desktop và Excel trên web.
- Tab **Cài đặt** cho biết số công tác, tài nguyên, giá và định mức hiện có.

## Khi nào dữ liệu có thể mất

| Tình huống | Kết quả |
|---|---|
| Xóa cache Office (`npx office-addin-cache clear`, tùy chọn "clear web add-ins cache" của Office, hoặc xóa thư mục `Wef`) | **Mất toàn bộ thư viện** (đã kiểm chứng) |
| Trình duyệt nhúng tự dọn bộ nhớ khi máy thiếu dung lượng | Có thể mất. WebView2 từ chối cấp lưu trữ bền vững (đã kiểm chứng) |
| Đăng nhập tài khoản Office khác, đổi máy, dùng Excel trên web | Thấy thư viện trống. Dữ liệu cũ vẫn ở nơi cũ |

**Cảnh báo tự động:** khi bạn chèn công tác từ thư viện, workbook được đánh dấu "đã dùng thư viện". Nếu sau này mở workbook đó mà thư viện trên máy trống, tab Thư viện sẽ cảnh báo để bạn khôi phục từ bản sao lưu trước khi nhập lại.

## Sao lưu, khôi phục và chuyển máy

Mọi thao tác nằm ở **Thư viện › Nhập/Xuất**. Định dạng file và quy tắc nhập xem [LIBRARY_SCHEMA.md](LIBRARY_SCHEMA.md).

### Sao lưu

- **Tải bản sao lưu (.json)** — cách khuyên dùng.
  - Trên Excel cho Windows, file được lưu thẳng vào thư mục **Downloads (Tải về)** với tên dạng `ConsQuotation-thu-vien-2026-10-21-0925.json`.
  - Hãy chép file sang nơi an toàn như OneDrive hoặc ổ đĩa ngoài.
  - Đây là bản đầy đủ nhất: giữ cả id và thời điểm tạo/sửa.
- **Xuất ra workbook Excel.**
  - Add-in mở một workbook mới (chưa lưu), mỗi loại dữ liệu một sheet. Hãy lưu bằng **File › Save As**.
  - Dùng khi muốn xem, sửa hàng loạt, hoặc chuyển dữ liệu sang máy khác.

Tab Thư viện nhắc khi thư viện **chưa sao lưu lần nào** hoặc **đã thay đổi sau lần sao lưu/xuất gần nhất**. Tab Cài đặt hiện thời điểm sao lưu gần nhất.

Add-in không biết bạn có lưu workbook xuất ra hay không, nên với việc xuất workbook, mốc sao lưu được ghi ngay khi workbook được mở.

### Khôi phục hoặc chuyển máy

1. Cài ConsQuotation trên máy mới, hoặc mở lại sau khi xóa cache.
2. Vào **Thư viện › Nhập/Xuất**, rồi chọn một trong hai cách:
   - **Chọn file (.json, .csv)** và chọn file sao lưu JSON;
   - mở workbook đã xuất trong Excel, mở ConsQuotation trong workbook đó, rồi bấm **Đọc toàn bộ bản xuất**.
3. Xem bảng kết quả kiểm tra: số dòng mới, trùng, lỗi, dòng trống, kèm danh sách lỗi theo dòng và cột.
4. Chọn cách xử lý bản ghi trùng (mặc định là **Bỏ qua**), rồi bấm **Nhập** và xác nhận.

Khôi phục từ JSON vào thư viện trống cho ra dữ liệu **giống hệt** bản sao lưu; đã kiểm chứng ngày 2026-10-21.

### Nhập dữ liệu của bạn từ Excel/CSV

- **CSV:** lưu bằng **File › Save As › CSV UTF-8**. Mỗi file chứa một loại dữ liệu: công tác, tài nguyên, giá, hoặc định mức.
- **Sheet trong workbook đang mở:** chọn sheet, rồi bấm **Đọc sheet**.
  - Add-in tự tìm dòng tiêu đề (kể cả khi phía trên có dòng tiêu đề phụ), đoán loại dữ liệu và map cột theo tên. Bạn sửa lại được nếu sai.
  - Add-in chỉ **đọc** sheet, không ghi gì vào workbook.
- **File mẫu:** nút **Mở file mẫu trống**, hoặc các file trong [templates/](templates/).

## Báo giá không bị thay đổi khi sửa thư viện

Khi bấm **Chèn vào báo giá**, add-in **chép giá trị** của công tác (mã, nhóm, tên, đơn vị, đơn giá) vào bảng báo giá, kèm ghi chú truy vết như `Thư viện: BT-01; nguồn giá: …; hiệu lực …`. Dòng báo giá không liên kết với thư viện, nên sửa hoặc xóa công tác trong thư viện sau đó **không làm đổi** báo giá đã lập. Đã kiểm chứng: sửa giá trong thư viện thì dòng báo giá vẫn giữ giá cũ.

## Giá có ngày hiệu lực

- Mỗi công tác hoặc giá được gắn nhãn: Còn hiệu lực, Hết hạn, Chưa hiệu lực, hoặc Không ghi hiệu lực.
- Chèn công tác có giá hết hạn, chưa hiệu lực hoặc chưa có giá thì có cảnh báo trước khi thêm. Add-in **không tự đổi** sang giá khác.
- Khi một tài nguyên có nhiều giá đang dùng chồng thời gian, add-in **không tự chọn giá mới nhất là giá đúng**; bạn tự quyết định giá áp dụng.

## Kiểm tra thư viện

Tab Thư viện › **Kiểm tra** liệt kê, nhưng không tự sửa, các vấn đề sau:
- mã trùng;
- thiếu mã, tên hoặc đơn vị;
- công tác chưa có giá;
- giá hết hạn hoặc chưa hiệu lực;
- định mức hoặc giá trỏ tới bản ghi đã bị xóa;
- đơn vị của giá khác đơn vị tài nguyên;
- nhiều giá đang dùng chồng thời gian.

## Dữ liệu của từng người

Mỗi người dùng có thư viện riêng trên máy và tài khoản của mình. ConsQuotation không có tính năng chia sẻ hay gộp thư viện giữa người dùng, và không trộn dữ liệu của người khác.
