# Schema nhập/xuất thư viện, phiên bản 2

Schema công bố theo [prompts/09_LIBRARY_IMPORT_EXPORT.md](../prompts/09_LIBRARY_IMPORT_EXPORT.md) và [ADR-0004](ADR/0004-import-export-thu-vien.md). Mã nguồn: [src/domain/library/exchange/schema.ts](../src/domain/library/exchange/schema.ts).

- `format`: `consquotation-library`
- `schemaVersion`: `2` (từ bản 1.9.0, [ADR-0012](ADR/0012-danh-muc-nha-cung-cap-schema-v2.md))

Add-in từ chối file có `schemaVersion` lớn hơn phiên bản nó hỗ trợ. Lý do: tránh nhập thiếu dữ liệu của phiên bản mới.

Thay đổi so với v1:
- thêm loại dữ liệu **Nhóm** và **Nhà cung cấp**;
- thêm cột **Nhóm** cho tài nguyên, cột **Nhà cung cấp** cho công tác và giá tài nguyên;
- JSON có thêm `library.name` (tên thư viện).

File v1 (bản 1.8.0 trở về trước) vẫn nhập được. Cột "Nhóm" của công tác trong file v1 được chuyển thành nhóm.

## Ba dạng file

| Dạng | Tạo bằng | Nhập bằng | Ghi chú |
|---|---|---|---|
| **JSON sao lưu** (`.json`) | Thư viện › Nhập/Xuất › **Tải bản sao lưu (.json)** | **Chọn file (.json, .csv)** | Đầy đủ nhất: giữ cả id và thời điểm tạo/sửa. Dùng để khôi phục hoặc chuyển máy |
| **Workbook Excel** | **Xuất ra workbook Excel** (hoặc **Mở file mẫu trống**) | Mở workbook trong Excel, rồi **Đọc từ workbook đang mở** › **Đọc toàn bộ bản xuất** | Gồm sheet `Thông tin` và mỗi loại dữ liệu một sheet. Tham chiếu giữa các loại bằng mã |
| **CSV** (UTF-8) | Tự tạo, hoặc từ [file mẫu](templates/) | **Chọn file (.json, .csv)** | Mỗi file chứa một loại dữ liệu. Dấu phân cách `,` `;` hoặc tab được tự nhận diện |

Add-in **không đọc trực tiếp file `.xlsx`**: hãy mở file trong Excel trước, rồi đọc từ workbook đang mở. Việc đọc thẳng `.xlsx` cần thêm thư viện phân tích file; xem ADR-0004.

## Cột của từng loại dữ liệu

Tên cột so khớp không phân biệt dấu, hoa thường, dấu `*` hay khoảng trắng thừa. Một số tên khác cũng được nhận (cột "Tên khác được nhận"). Bạn luôn có thể map cột bằng tay ở bước **Map cột**. Cột in **đậm** là bắt buộc.

### Nhóm (sheet `Nhóm`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| **Tên nhóm** | chữ | Tên khác được nhận: Tên danh mục, Danh mục. Tối đa 120 ký tự |
| Ghi chú | chữ | |

### Nhà cung cấp (sheet `Nhà cung cấp`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| **Tên nhà cung cấp** | chữ | Tối đa 120 ký tự |
| Liên hệ | chữ | Điện thoại, email, địa chỉ… Tối đa 500 ký tự |
| Ghi chú | chữ | |

Nhóm và nhà cung cấp được so khớp **theo tên**: bỏ khoảng trắng thừa, không phân biệt hoa thường, nhưng phân biệt dấu ("Cát" khác "Cạt"). Ở sheet công tác, tài nguyên và giá, cột "Nhóm" và "Nhà cung cấp" ghi **tên**. Nếu tên chưa có, add-in tạo mới khi nhập (bản xem trước liệt kê các tên này). Dòng lỗi hoặc dòng trùng bị bỏ qua thì không tạo gì.

### Công tác (sheet `Công tác`)

| Cột | Kiểu | Tên khác được nhận |
|---|---|---|
| **Mã công tác** | chữ | Mã hiệu |
| **Tên công tác** | chữ | Nội dung công việc, Tên công việc |
| Nhóm | chữ | Nhóm công tác, Danh mục. Tên nhóm (xem trên) |
| **Đơn vị tính** | chữ | Đơn vị, ĐVT |
| Mô tả | chữ | |
| Đơn giá | số ≥ 0 | Giá. Để trống = chưa có giá (khác 0) |
| Tiền tệ | chữ | Bắt buộc khi có đơn giá |
| Nhà cung cấp | chữ | NCC. Tên nhà cung cấp |
| Nguồn giá | chữ | Nguồn |
| Hiệu lực từ ngày | ngày | Từ ngày |
| Hiệu lực đến ngày | ngày | Đến ngày. Phải sau hoặc bằng ngày bắt đầu |
| Ghi chú | chữ | |

### Tài nguyên (sheet `Tài nguyên`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| **Mã tài nguyên** | chữ | Tên khác được nhận: Mã vật tư |
| **Tên tài nguyên** | chữ | |
| Loại | `Vật liệu` / `Nhân công` / `Máy thi công` / `Khác` | Không cần gõ dấu. Để trống = Khác |
| Nhóm | chữ | Tên nhóm |
| **Đơn vị tính** | chữ | |
| Ghi chú | chữ | |

### Giá tài nguyên (sheet `Giá tài nguyên`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| **Mã tài nguyên** | chữ | Phải có trong thư viện hoặc trong cùng lần nhập |
| **Đơn giá** | số ≥ 0 | |
| **Đơn vị tính** | chữ | **Không** tự lấy theo đơn vị của tài nguyên |
| **Tiền tệ** | chữ | |
| Hiệu lực từ ngày | ngày | |
| Hiệu lực đến ngày | ngày | |
| Nhà cung cấp | chữ | Tên nhà cung cấp |
| Nguồn | chữ | |
| Trạng thái | `Đang dùng` / `Ngưng dùng` | Để trống = Đang dùng |
| Ghi chú | chữ | |

### Định mức (sheet `Định mức`)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| **Mã công tác** | chữ | Phải có trong thư viện hoặc trong cùng lần nhập |
| **Mã tài nguyên** | chữ | Như trên |
| **Hao phí** | số > 0 | Tính cho 1 đơn vị công tác |
| Ghi chú | chữ | |

## Quy tắc đọc giá trị

- **Mã** luôn được giữ dạng chữ.
  - Ô Excel dạng số có định dạng `000` được đọc đúng như hiển thị, ví dụ `007`.
  - Khoảng trắng ở hai đầu bị bỏ.
  - So sánh mã không phân biệt hoa thường.
- **Số** dùng dấu thập phân `.` hoặc `,` và không có dấu phân cách hàng nghìn.
  - `1.500.000` bị **báo lỗi** chứ không bị đoán, vì nó có thể là 1,5 triệu hoặc 1,5.
  - Ô số trong Excel được đọc đúng giá trị số.
- **Ngày** có thể viết `yyyy-mm-dd` hoặc `dd/mm/yyyy` (ngày đứng trước tháng).
  - Ô Excel có định dạng ngày được đọc theo giá trị ngày.
  - Một ô số **không** có định dạng ngày thì bị báo lỗi chứ không bị đoán là ngày.
- **Chữ tiếng Việt** được chuẩn hóa về dạng dựng sẵn (NFC); nghĩa của chữ không đổi.
  - Chữ bắt đầu bằng `=` được giữ nguyên dạng chữ, không bao giờ chạy như công thức.
- **CSV** phải là UTF-8 (có hoặc không có BOM) hoặc UTF-16 có BOM.
  - File dùng bảng mã khác bị từ chối để tránh hỏng tiếng Việt.
  - Trong Excel, lưu đúng định dạng bằng **File › Save As › CSV UTF-8 (Comma delimited)**.

## Xử lý khi nhập

- **Dòng lỗi không bao giờ được nhập.** Báo cáo chỉ đúng dòng (số dòng trên sheet hoặc file) và cột.
- **Không suy diễn** giá trị thiếu, ví dụ:
  - không tự lấy đơn vị tính;
  - không tự điền tiền tệ;
  - đơn giá trống không thành 0.
- **Dòng trống** được bỏ qua và đếm riêng.
- **Mã trùng trong cùng file** bị báo lỗi ở dòng sau, kèm chỉ dẫn tới dòng đầu tiên.
- **Bản ghi trùng với thư viện** được xác định như sau:

  | Loại | Coi là trùng khi |
  |---|---|
  | Nhóm, nhà cung cấp | Cùng tên |
  | Công tác, tài nguyên | Cùng mã |
  | Giá | Cùng id (với JSON), hoặc giống hệt nhau: cùng tài nguyên, đơn giá, đơn vị, tiền tệ, thời gian hiệu lực và nguồn |
  | Định mức | Cùng công tác và cùng tài nguyên |

  Cách xử lý mặc định là **Bỏ qua**. Chọn **Cập nhật** thì add-in chỉ đổi các trường có cột trong file; cột không có trong file giữ nguyên giá trị cũ. Muốn hủy thì bấm **Hủy** ở bước kiểm tra hoặc ở hộp xác nhận.
- **Mỗi lần nhập được ghi trong một giao dịch.** Nếu lỗi giữa chừng, thư viện giữ nguyên.
  - Ngay trước khi ghi, add-in kiểm tra lại với thư viện hiện tại. Nếu thư viện vừa bị đổi ở task pane khác, add-in dừng và yêu cầu xem lại.
- Giới hạn mỗi lần nhập:
  - 50.000 dòng cho mỗi loại dữ liệu;
  - file tối đa 20 MB;
  - từ 5.000 dòng, add-in báo trước rằng việc nhập có thể mất vài giây.

## File JSON

```json
{
  "format": "consquotation-library",
  "schemaVersion": 2,
  "exportedAt": "2026-10-26T08:37:12.000Z",
  "appVersion": "1.9.0",
  "library": { "name": "Thư viện của tôi" },
  "data": {
    "categories": [],
    "suppliers": [],
    "workItems": [],
    "resources": [],
    "resourcePrices": [],
    "norms": []
  }
}
```

Mỗi bản ghi trong file có các trường của mô hình dữ liệu ([src/domain/library/types.ts](../src/domain/library/types.ts)). Giá và định mức tham chiếu bằng `resourceId` và `workItemId`. Công tác và tài nguyên tham chiếu nhóm bằng `categoryId`; công tác và giá tham chiếu nhà cung cấp bằng `supplierId` (`null` = không có). Tham chiếu tới id không có trong file bị báo lỗi theo bản ghi.

Khi khôi phục vào thư viện đã có nhóm hoặc nhà cung cấp **cùng tên**, add-in dùng lại bản ghi đang có thay vì tạo bản thứ hai.

File JSON **chỉ chứa dữ liệu thư viện**. Cài đặt nội bộ của add-in không được xuất; add-in cũng không lưu bí mật nào.

## File mẫu

Thư mục [templates/](templates/) có các file CSV UTF-8 chỉ chứa dòng tiêu đề:

- [nhom.csv](templates/nhom.csv)
- [nha-cung-cap.csv](templates/nha-cung-cap.csv)
- [cong-tac.csv](templates/cong-tac.csv)
- [tai-nguyen.csv](templates/tai-nguyen.csv)
- [gia-tai-nguyen.csv](templates/gia-tai-nguyen.csv)
- [dinh-muc.csv](templates/dinh-muc.csv)

Trong add-in, nút **Mở file mẫu trống** mở một workbook có sẵn đủ các sheet và tiêu đề cột. Điền dữ liệu vào workbook đó rồi dùng **Đọc toàn bộ bản xuất** để nhập.
