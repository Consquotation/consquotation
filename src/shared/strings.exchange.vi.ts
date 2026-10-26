import { DatasetKind } from "../domain/library/exchange/schema";

/** Chuỗi giao diện tiếng Việt cho Nhập/Xuất và sao lưu thư viện (prompts/09). */
export const EXCHANGE_STRINGS = {
  sectionTab: "Nhập/Xuất",
  kinds: {
    categories: "Nhóm",
    suppliers: "Nhà cung cấp",
    workItems: "Công tác",
    resources: "Tài nguyên",
    resourcePrices: "Giá tài nguyên",
    norms: "Định mức",
  } as Record<DatasetKind, string>,

  backup: {
    title: "Sao lưu và xuất",
    description:
      "Thư viện chỉ nằm trên máy này. Hãy sao lưu thường xuyên và chép file sang nơi an toàn (OneDrive, ổ đĩa ngoài).",
    json: "Tải bản sao lưu (.json)",
    jsonHint: "Bản sao lưu đầy đủ nhất, dùng để khôi phục hoặc chuyển máy.",
    workbook: "Xuất ra workbook Excel",
    workbookHint:
      "Mở workbook mới, mỗi loại dữ liệu một sheet — xem, sửa hoặc lưu làm bản sao lưu.",
    template: "Mở file mẫu trống",
    templateHint: "Workbook chỉ có tiêu đề cột theo schema, để điền dữ liệu rồi nhập.",
    jsonDone: (fileName: string) =>
      `Đã gửi file "${fileName}" cho Excel tải về — add-in không xác nhận được việc lưu file, hãy kiểm tra file đã có trong thư mục Downloads (Tải về) rồi chép sang nơi an toàn.`,
    workbookDone:
      "Excel đã mở workbook mới chứa thư viện. Hãy lưu bằng File › Save As — workbook chưa được lưu sẽ mất khi đóng.",
    templateDone: "Excel đã mở workbook mẫu trống. Điền dữ liệu, rồi dùng phần Nhập bên dưới.",
    failed: "Không xuất được",
  },

  status: {
    never: "Thư viện chưa được sao lưu lần nào. Dữ liệu sẽ mất nếu xóa cache Office hoặc đổi máy.",
    stale: (at: string) => `Thư viện đã thay đổi sau lần sao lưu/xuất gần nhất (${at}).`,
    ok: (at: string) => `Lần sao lưu/xuất gần nhất: ${at}.`,
    backupNow: "Sao lưu ngay",
  },

  import: {
    title: "Nhập vào thư viện",
    description:
      "Nhập từ file sao lưu (.json), file CSV, hoặc một sheet trong workbook đang mở. Luôn có bước xem trước; không ghi gì khi bạn chưa xác nhận.",
    chooseFile: "Chọn file (.json, .csv)…",
    fileHint:
      'File .xlsx: mở file đó trong Excel trước, rồi dùng "Đọc từ workbook đang mở". CSV phải lưu dạng UTF-8.',
    fromWorkbook: "Đọc từ workbook đang mở",
    sheet: "Sheet",
    refreshSheets: "Làm mới danh sách sheet",
    readSheet: "Đọc sheet",
    table: "Hoặc một Excel Table",
    tableHint: "Đọc đúng vùng của bảng (tiêu đề + dữ liệu). Add-in chỉ đọc, không sửa bảng.",
    tableOption: (name: string, sheet: string, rows: number) =>
      `${name} (sheet "${sheet}", ${rows} dòng)`,
    readTable: "Đọc bảng",
    sheetSize: (name: string, rows: number, cols: number) =>
      rows === 0 ? `${name} (trống)` : `${name} (${rows} dòng × ${cols} cột)`,
    backupDetected: (exportedAt: string, libraryName: string) =>
      `Workbook này là bản xuất thư viện ConsQuotation${libraryName ? ` "${libraryName}"` : ""}${exportedAt ? ` (xuất lúc ${exportedAt})` : ""}.`,
    backupFileLabel: (fileName: string, libraryName: string) =>
      libraryName ? `File "${fileName}" (thư viện "${libraryName}")` : `File "${fileName}"`,
    createdRefs: (categories: string[], suppliers: string[]) =>
      [
        categories.length > 0 ? `${categories.length} nhóm mới: ${categories.join(", ")}` : "",
        suppliers.length > 0 ? `${suppliers.length} nhà cung cấp mới: ${suppliers.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ") +
      ". Các tên này có trong cột Nhóm/Nhà cung cấp nhưng chưa có trong thư viện; add-in sẽ tạo khi nhập.",
    readBackup: "Đọc toàn bộ bản xuất",
    reading: "Đang đọc dữ liệu…",
    readFailed: "Không đọc được nguồn dữ liệu",
    tooBig: (mb: number) => `File lớn hơn ${mb} MB. Hãy chia nhỏ file.`,
    xlsxNotSupported:
      'Add-in không đọc trực tiếp file .xlsx. Hãy mở file đó trong Excel, rồi dùng "Đọc từ workbook đang mở".',
    emptySource: "Nguồn không có dữ liệu.",
    fileUnreadable:
      "Không đọc được file. File có thể đã bị di chuyển, bị xóa hoặc đang bị ứng dụng khác khóa. Hãy chọn lại.",
    sheetTooLarge: (total: number, max: number) =>
      `Sheet có ${total} dòng, vượt giới hạn ${max} dòng mỗi lần nhập. Hãy chia nhỏ dữ liệu.`,

    sourceRead: (label: string, rows: number) => `Đã đọc ${label}: ${rows} dòng.`,
    headerRow: "Dòng tiêu đề",
    headerRowHint: "Số dòng (trên sheet/file) chứa tên cột. Add-in tự nhận diện; sửa nếu sai.",
    kind: "Loại dữ liệu",
    chooseKind: "Chọn loại dữ liệu…",
    kindUnknown: "Không nhận ra loại dữ liệu từ tên cột. Hãy chọn loại và map cột.",
    mappingTitle: "Map cột",
    notMapped: "— Không nhập —",
    preview: "Xem trước (5 dòng đầu)",

    duplicateMode: "Bản ghi trùng với thư viện",
    skip: "Bỏ qua (giữ nguyên dữ liệu trong thư viện)",
    update: "Cập nhật theo file (chỉ các cột có trong file)",
    updateHint:
      "Trùng: công tác/tài nguyên cùng mã; giá giống hệt (cùng tài nguyên, đơn giá, đơn vị, tiền tệ, hiệu lực, nguồn); định mức cùng công tác và tài nguyên.",
    largeWarning: (rows: number) => `Nhập ${rows} dòng có thể mất vài giây.`,
    summaryTitle: "Kết quả kiểm tra",
    columns: {
      source: "Nguồn",
      kind: "Loại",
      total: "Tổng",
      added: "Mới",
      duplicates: "Trùng",
      errors: "Lỗi",
      empty: "Dòng trống",
    },
    problemsTitle: "Không thể nhập",
    issuesTitle: (n: number) => `${n} lỗi — các dòng này sẽ không được nhập`,
    issuesSkipped: (n: number) => `${n} dòng lỗi đã được bỏ qua (không nhập)`,
    importing: "Đang ghi vào thư viện…",
    moreIssues: (n: number) => `… và ${n} lỗi khác.`,
    nothingToImport: "Không có bản ghi mới hoặc cần cập nhật.",
    submit: (n: number) => `Nhập ${n} bản ghi vào thư viện`,
    cancel: "Hủy",
    confirmTitle: "Nhập vào thư viện?",
    confirmBody: (
      added: number,
      updated: number,
      skipped: number,
      errors: number,
      newCategories = 0,
      newSuppliers = 0
    ) =>
      [
        `Thêm mới ${added} bản ghi`,
        newCategories > 0 ? `tạo ${newCategories} nhóm mới` : null,
        newSuppliers > 0 ? `tạo ${newSuppliers} nhà cung cấp mới` : null,
        updated > 0 ? `cập nhật ${updated} bản ghi đã có` : null,
        skipped > 0 ? `bỏ qua ${skipped} bản ghi trùng` : null,
        errors > 0 ? `bỏ qua ${errors} dòng lỗi` : null,
      ]
        .filter(Boolean)
        .join(", ") + ". Thao tác không hoàn tác được — nếu cần, hãy sao lưu trước.",
    confirm: "Nhập",
    changedMeanwhile:
      "Thư viện vừa thay đổi (ví dụ ở task pane khác) nên kết quả kiểm tra đã khác. Hãy xem lại rồi bấm Nhập lần nữa.",
    done: (added: number, updated: number) =>
      `Đã nhập: thêm ${added}, cập nhật ${updated} bản ghi. Không có dòng lỗi nào được nhập.`,
    failed: "Nhập thất bại — thư viện giữ nguyên, không có dữ liệu nào được ghi.",
    another: "Nhập nguồn khác",
  },
} as const;
