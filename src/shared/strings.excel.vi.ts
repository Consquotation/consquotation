/**
 * Chuỗi tiếng Việt của lớp thao tác Excel (src/office/core/) và khu vực Kiểm thử Excel.
 * Thông báo lỗi chỉ chứa tên sheet/Table/địa chỉ, không chứa nội dung ô.
 */

export const EXCEL_ERRORS = {
  sheetNotFound: (sheet: string) =>
    `Không tìm thấy sheet "${sheet}". Có thể sheet vừa bị đổi tên hoặc xóa.`,
  sheetExists: (sheet: string) => `Workbook đã có sheet tên "${sheet}".`,
  tableNotFound: (table: string) =>
    `Không tìm thấy bảng "${table}". Có thể bảng vừa bị đổi tên hoặc xóa.`,
  tableExists: (table: string) => `Workbook đã có bảng hoặc tên đã đặt "${table}".`,
  invalidSheetName: (reason: string) => `Tên sheet không hợp lệ: ${reason}`,
  invalidTableName: (reason: string) => `Tên bảng không hợp lệ: ${reason}`,
  invalidAddress: (address: string) =>
    `Địa chỉ vùng ô "${address}" không hợp lệ. Dùng dạng A1 hoặc A1:D10, không kèm tên sheet, không chọn cả cột hoặc cả hàng.`,
  sizeMismatch: (
    address: string,
    rows: number,
    columns: number,
    dataRows: number,
    dataColumns: number
  ) =>
    `Dữ liệu có ${dataRows} hàng × ${dataColumns} cột nhưng vùng ${address} có ${rows} hàng × ${columns} cột. Add-in không ghi khi kích thước không khớp.`,
  matrixEmpty: "Không có dữ liệu để ghi (ma trận rỗng).",
  matrixRagged: (row: number, expected: number, actual: number) =>
    `Hàng ${row} có ${actual} cột, khác các hàng khác (${expected} cột).`,
  cellType: (row: number, column: number) =>
    `Ô ở hàng ${row}, cột ${column} có kiểu dữ liệu không ghi được (chỉ nhận chữ, số hữu hạn, đúng/sai hoặc ô trống). Ngày phải đổi sang số sê-ri của Excel trước khi ghi.`,
  textTooLong: (row: number, column: number) =>
    `Ô ở hàng ${row}, cột ${column} dài quá 32.767 ký tự (giới hạn của Excel).`,
  formulaInvalid: (row: number, column: number) =>
    `Công thức ở hàng ${row}, cột ${column} không hợp lệ (trống sau dấu "=" hoặc dài quá 8.192 ký tự).`,
  tooLarge: (cells: number, max: number) =>
    `Vùng có ${cells.toLocaleString("vi-VN")} ô, vượt giới hạn ${max.toLocaleString("vi-VN")} ô của thao tác này. Hãy chia nhỏ vùng.`,
  targetNotEmpty: (address: string, count: number, sample: string) =>
    `Vùng ${address} có ${count} ô đang có dữ liệu (ví dụ: ${sample}). Cần xác nhận trước khi ghi đè.`,
  targetChanged: (address: string) =>
    `Vùng ${address} đã thay đổi kể từ lúc kiểm tra nên add-in chưa ghi gì. Hãy kiểm tra lại.`,
  notOwned: (table: string) =>
    `Bảng "${table}" không do ConsQuotation tạo (tên không bắt đầu bằng CQ_) nên add-in không sửa.`,
  sheetProtected: (sheet: string) =>
    `Sheet "${sheet}" đang được bảo vệ (Protect). Bỏ bảo vệ sheet rồi thử lại.`,
  workbookProtected:
    "Cấu trúc workbook đang được bảo vệ nên không thể thêm hoặc đổi tên sheet. Bỏ bảo vệ workbook (Review › Protect Workbook) rồi thử lại.",
  tableOverlap: (address: string, tables: string) =>
    `Vùng ${address} chồng lên bảng có sẵn: ${tables}.`,
  unsupported: (feature: string, version: string) =>
    `Excel này chưa hỗ trợ ${feature} (cần ExcelApi ${version}).`,
  shiftRight: (table: string, count: number, sample: string) =>
    `Bên phải bảng ${table}, trong các hàng của bảng, có ${count} ô đang có dữ liệu (ví dụ: ${sample}). Thêm cột sẽ làm Excel đẩy các ô này sang phải một cột, lệch với các hàng ngoài bảng. Hãy chuyển dữ liệu đó đi trước.`,
  shiftDown: (table: string, count: number, sample: string) =>
    `Bên dưới bảng ${table}, trong các cột của bảng, có ${count} ô đang có dữ liệu (ví dụ: ${sample}). Thêm dòng sẽ làm Excel đẩy các ô này xuống. Cần xác nhận trước khi thêm.`,
  noMatch: (column: string, value: string) => `Không có dòng nào có ${column} = "${value}".`,
  ambiguousMatch: (column: string, value: string, count: number) =>
    `Có ${count} dòng cùng ${column} = "${value}" nên add-in không biết sửa dòng nào. Hãy dùng tiêu chí chỉ khớp một dòng.`,
  columnMissing: (table: string, column: string) => `Bảng "${table}" không có cột "${column}".`,
  duplicateColumn: (table: string, column: string) =>
    `Bảng "${table}" đã có cột "${column}" (Excel không phân biệt hoa thường).`,
  duplicateHeaders: (headers: string) => `Tiêu đề cột bị trùng: ${headers}.`,
  emptyHeader: (column: number) => `Tiêu đề cột ${column} đang trống.`,
} as const;

export const EXCEL_LAB_STRINGS = {
  title: "Kiểm thử Excel (dành cho phát triển)",
  expand: "Mở",
  collapse: "Thu gọn",
  intro:
    'Chạy thử lớp thao tác Excel trên một sheet riêng tên "CQ Thử nghiệm". Không đọc hay sửa sheet và bảng khác của bạn. Dữ liệu mẫu chỉ là chữ "Thử …", không phải đơn giá thật. Khu vực này chỉ có trong bản phát triển.',
  sections: {
    active: "1. Sheet hiện hành",
    sheets: "2. Danh sách sheet",
    steps: "3–7. Sheet, dữ liệu và bảng thử nghiệm",
  },
  readActive: "Đọc sheet hiện hành",
  listSheets: "Liệt kê sheet",
  createSheet: "Tạo sheet thử nghiệm",
  writeSample: "Ghi dữ liệu mẫu",
  createTable: "Tạo bảng từ dữ liệu mẫu",
  formatTable: "Định dạng bảng",
  readBack: "Đọc lại để xác nhận",
  working: "Đang chạy…",
  workbookName: "Workbook",
  workbookNameUnknown: "(chưa lưu hoặc Excel không cho biết tên)",
  readOnly: "Chỉ đọc",
  workbookProtected: "Cấu trúc workbook bị khóa",
  activeSheet: "Sheet đang mở",
  sheetProtectedLabel: "Sheet bị bảo vệ",
  usedRange: "Vùng có dữ liệu",
  usedRangeEmpty: "(sheet trống)",
  sheetCount: "Số sheet",
  yes: "Có",
  no: "Không",
  sheetLine: (name: string, visibility: string, isProtected: boolean, active: boolean) =>
    `${name}${active ? " (đang mở)" : ""}${visibility !== "Visible" ? ` · ${visibility === "Hidden" ? "ẩn" : "ẩn sâu"}` : ""}${isProtected ? " · bị bảo vệ" : ""}`,
  sheetCreated: (sheet: string) => `Đã tạo sheet "${sheet}".`,
  sheetAlreadyThere: (sheet: string) =>
    `Sheet "${sheet}" đã có từ trước; add-in dùng lại, không tạo thêm.`,
  sampleWritten: (address: string) => `Đã ghi dữ liệu mẫu vào ${address}.`,
  tableCreated: (table: string, address: string) => `Đã tạo bảng ${table} tại ${address}.`,
  tableAlreadyThere: (table: string) => `Bảng ${table} đã có; add-in không tạo trùng.`,
  formatted: (table: string) =>
    `Đã định dạng bảng ${table}: tiêu đề, viền, định dạng số theo cột, độ rộng cột, cố định hàng tiêu đề.`,
  readBackResult: (
    rows: number,
    columns: number,
    empty: number,
    errors: number,
    formulas: number
  ) =>
    `Đọc lại: ${rows} dòng × ${columns} cột, ${empty} ô trống, ${formulas} ô công thức, ${errors} ô lỗi.`,
  readBackMatch:
    "Giá trị đọc lại khớp dữ liệu đã ghi (chữ có dấu, ký tự đặc biệt, số 0, ô trống, công thức).",
  readBackMismatch: (cells: string) => `Khác dữ liệu đã ghi ở: ${cells}.`,
  missingSheet: 'Chưa có sheet "CQ Thử nghiệm". Bấm Tạo sheet thử nghiệm trước.',
  missingTable: "Chưa có bảng thử nghiệm. Bấm Tạo bảng từ dữ liệu mẫu trước.",
  missingSample: "Vùng mẫu đang trống. Bấm Ghi dữ liệu mẫu trước.",
  confirmOverwriteTitle: "Ghi đè vùng mẫu trên sheet thử nghiệm?",
  confirmOverwriteBody: (address: string, count: number) =>
    `Vùng ${address} trên sheet "CQ Thử nghiệm" có ${count} ô đang có dữ liệu. Ghi lại dữ liệu mẫu sẽ thay các ô này. Thao tác không hoàn tác được bằng Ctrl+Z.`,
  confirmOverwrite: "Ghi đè",
  cancel: "Hủy",
  tableBlocksRewrite:
    "Vùng mẫu đang là bảng thử nghiệm. Muốn ghi lại từ đầu, hãy xóa sheet CQ Thử nghiệm trong Excel rồi chạy lại từ bước tạo sheet.",
  failed: "Thao tác thất bại",
  done: "Xong",
  notice: "Lưu ý",
} as const;
