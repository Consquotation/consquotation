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

> **Hiện chưa có chức năng xuất/nhập thư viện ra file.** Chức năng này thuộc bước tiếp theo (prompts/09). Trong lúc chờ, tab Thư viện luôn hiện cảnh báo. Hãy cân nhắc trước khi nhập nhiều dữ liệu.

Khi có chức năng xuất/nhập (prompts/09), quy trình sẽ là:

1. **Sao lưu:** Thư viện › Xuất. Add-in mở một workbook mới chứa toàn bộ thư viện; bạn lưu workbook đó bằng Excel (File › Save As) vào nơi an toàn như OneDrive hoặc ổ đĩa ngoài.
2. **Khôi phục hoặc chuyển máy:** trên máy mới, hoặc sau khi xóa cache, mở workbook sao lưu, rồi dùng Thư viện › Nhập. Có xem trước dữ liệu và chọn cách xử lý mã trùng.

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
