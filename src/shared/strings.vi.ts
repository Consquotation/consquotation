/** Chuỗi giao diện tiếng Việt. Gom tại đây để thống nhất thuật ngữ (ADR-0006). */
export const STRINGS = {
  appName: "ConsQuotation",
  appTagline: "Lập báo giá thi công xây dựng ngay trong Excel",

  unsupported: {
    title: "Phiên bản Excel chưa tương thích",
    missingRequirement: (name: string, version: string) =>
      `Excel hiện tại chưa hỗ trợ ${name} ${version}, là mức tối thiểu ConsQuotation cần để hoạt động an toàn.`,
    wrongHost: "ConsQuotation chỉ chạy trong Microsoft Excel.",
    remedy:
      "Hãy cập nhật Office lên phiên bản mới hơn (Microsoft 365, Office 2021 trở lên, hoặc bản retail 2016/2019 đã cập nhật), hoặc dùng Excel trên web.",
    noChange: "Add-in không thay đổi dữ liệu trong workbook của bạn.",
  },

  overview: {
    title: "Tổng quan",
    phaseNotice:
      "Bản đang phát triển: đã có tạo bảng báo giá và thêm công tác thủ công (tab Báo giá). Thư viện cá nhân, nhập/xuất và kiểm tra báo giá sẽ được bổ sung ở các giai đoạn tiếp theo.",
  },

  environment: {
    title: "Môi trường Excel",
    host: "Ứng dụng",
    platform: "Nền tảng",
    version: "Phiên bản",
    baseline: (name: string, version: string) => `Mức API tối thiểu (${name} ${version})`,
    supported: "Đạt",
    notSupported: "Không đạt",
  },

  storage: {
    title: "Kiểm tra lưu trữ cục bộ",
    description:
      "Ghi thử một mốc thời gian vào bộ nhớ cục bộ của add-in rồi đọc lại lần ghi trước. Dùng để kiểm tra dữ liệu còn sau khi khởi động lại Excel. Không chạm vào workbook.",
    run: "Chạy kiểm tra",
    running: "Đang kiểm tra…",
    indexedDb: "IndexedDB",
    available: "Khả dụng",
    unavailable: "Không khả dụng",
    persisted: "Lưu trữ bền vững (persisted)",
    persistRequest: "Xin lưu trữ bền vững",
    persistResult: {
      already: "Đã được cấp từ trước",
      granted: "Được chấp nhận",
      denied: "Bị từ chối",
      unsupported: "Webview không hỗ trợ",
    },
    yes: "Có",
    no: "Không",
    unknown: "Không xác định",
    usage: "Dung lượng đã dùng / hạn mức",
    partitionKey: "Partition key",
    none: "(không có)",
    database: "Cơ sở dữ liệu kiểm tra",
    previousWrite: "Lần ghi trước",
    noPreviousWrite: "Chưa có — đây là lần ghi đầu tiên, hoặc dữ liệu cũ đã bị xóa.",
    currentWrite: "Lần ghi này",
    failed: "Kiểm tra lưu trữ thất bại",
    cacheWarning:
      "Lưu ý: dữ liệu cục bộ của add-in bị xóa khi xóa cache add-in của Office. Thư viện cá nhân sau này phải được sao lưu thường xuyên.",
  },

  tabs: {
    label: "Các phần của ConsQuotation",
    overview: "Tổng quan",
    quote: "Báo giá",
    settings: "Cài đặt",
  },

  header: {
    help: "Trợ giúp",
  },

  shortcuts: {
    title: "Lối tắt",
    createQuote: "Tạo bảng báo giá",
    addWorkItem: "Thêm công tác thủ công",
    help: "Xem hướng dẫn",
  },

  quoteTables: {
    title: "Bảng báo giá trong workbook",
    loading: "Đang tìm bảng báo giá…",
    empty: "Chưa có bảng báo giá nào. Dùng lối tắt Tạo bảng báo giá để bắt đầu.",
    failed: "Không đọc được danh sách bảng báo giá",
    row: (sheet: string, rows: number) => `Sheet "${sheet}" · ${rows} dòng`,
    headersChanged: "Tiêu đề cột đã bị đổi",
    go: "Đi tới",
    goLabel: (table: string) => `Đi tới bảng ${table}`,
    reload: "Tải lại",
  },

  help: {
    title: "Trợ giúp",
    back: "Quay lại",
    frameTitle: "Hướng dẫn sử dụng ConsQuotation",
  },

  settings: {
    versionTitle: "Phiên bản",
    version: "Phiên bản add-in",
    buildMode: "Bản build",
    development: "Phát triển (dev)",
    production: "Chính thức (production)",
    unavailableNote:
      "Định dạng và sao lưu thư viện sẽ có ở đây khi tính năng Thư viện của tôi được triển khai.",
  },

  context: {
    title: "Workbook hiện tại",
    workbook: "Workbook",
    sheet: "Sheet",
    selection: "Vùng chọn",
    protectedSheet: "Sheet đang được bảo vệ (Protect) — add-in sẽ không ghi vào sheet này.",
    unsaved: "(chưa lưu)",
    none: "(không có)",
    refresh: "Làm mới",
    loading: "Đang đọc workbook…",
    failed: "Không đọc được workbook",
  },

  create: {
    title: "Tạo bảng báo giá",
    description:
      "Tạo khối thông tin báo giá và một Excel Table với các cột STT, Mã công tác, Nhóm công tác, Nội dung công việc, Đơn vị tính, Khối lượng, Đơn giá, Thành tiền, Ghi chú. Thành tiền = Khối lượng × Đơn giá (để trống khi thiếu một trong hai).",
    placement: "Vị trí tạo",
    newSheet: "Sheet mới (khuyến nghị — không ảnh hưởng dữ liệu có sẵn)",
    atSelection: "Tại ô đang chọn trên sheet hiện tại",
    sheetName: "Tên sheet mới",
    sheetNameHint: "Nếu trùng tên sheet có sẵn, add-in tự thêm (2), (3)…",
    initialRows: "Số dòng công tác ban đầu",
    submit: "Tạo bảng báo giá",
    working: "Đang kiểm tra và tạo…",
    confirmLocationTitle: "Tạo bảng báo giá tại vị trí này?",
    confirmLocationBody: (where: string) =>
      `Add-in sẽ ghi vào vùng ${where}. Vùng này hiện đang trống. Lưu ý: không hoàn tác được bằng Ctrl+Z; nếu tạo nhầm, hãy xóa bảng thủ công.`,
    confirmOverwriteTitle: "Vùng đích đang có dữ liệu",
    confirmOverwriteBody: (where: string, count: number, sample: string) =>
      `Vùng ${where} có ${count} ô đang có dữ liệu (ví dụ: ${sample}). Nếu tiếp tục, nội dung các ô này sẽ bị xóa và thay bằng mẫu báo giá. Thao tác này KHÔNG hoàn tác được bằng Ctrl+Z. Nếu cần giữ dữ liệu, hãy Hủy rồi chọn vị trí khác hoặc sao chép dữ liệu ra chỗ khác trước.`,
    confirmCreate: "Tạo bảng",
    confirmOverwrite: "Ghi đè",
    cancel: "Hủy",
    created: (table: string, where: string) => `Đã tạo bảng ${table} tại ${where}.`,
    changed:
      "Workbook đã thay đổi trong lúc chờ xác nhận nên add-in chưa ghi gì. Hãy bấm Tạo bảng báo giá để kiểm tra lại.",
    blockedTitle: "Không thể tạo bảng tại vị trí này",
    skippedMerged:
      "Excel này chưa hỗ trợ kiểm tra ô gộp (cần ExcelApi 1.13); hãy tự kiểm tra vùng đích không có ô gộp.",
    failed: "Tạo bảng báo giá thất bại",
    partialHint:
      "Một phần mẫu có thể đã được ghi trước khi lỗi xảy ra. Hãy kiểm tra vùng đích trong Excel.",
  },

  append: {
    title: "Thêm công tác thủ công",
    description:
      "Thêm một dòng vào cuối bảng báo giá đã chọn. Bạn cũng có thể gõ trực tiếp vào bảng trong Excel.",
    table: "Bảng báo giá",
    noTables: "Workbook chưa có bảng báo giá nào. Hãy tạo bảng trước.",
    loadingTables: "Đang tìm bảng báo giá…",
    reloadTables: "Tải lại danh sách",
    tableOption: (table: string, sheet: string, rows: number) =>
      `${table} — sheet "${sheet}" (${rows} dòng)`,
    headersChangedOption: " — tiêu đề cột đã bị đổi",
    code: "Mã công tác",
    group: "Nhóm công tác",
    descriptionField: "Nội dung công việc",
    unit: "Đơn vị tính",
    quantity: "Khối lượng",
    unitPrice: "Đơn giá",
    notes: "Ghi chú",
    numberHint:
      "Để trống nếu chưa có. Dùng . hoặc , làm dấu thập phân, không dùng dấu phân cách hàng nghìn.",
    position: "Vị trí chèn",
    positionEnd: "Cuối bảng",
    positionBelow: "Ngay dưới dòng đang chọn trong bảng",
    positionBelowHint: "Chọn một ô trong bảng báo giá trên Excel trước khi bấm Thêm.",
    submit: "Thêm vào bảng",
    working: "Đang thêm…",
    confirmShiftTitle: "Dữ liệu bên dưới bảng sẽ bị đẩy xuống",
    confirmShiftBody: (count: number, sample: string) =>
      `Bên dưới bảng (trong phạm vi các cột của bảng) có ${count} ô đang có dữ liệu (ví dụ: ${sample}). Khi thêm dòng, Excel sẽ đẩy các ô này xuống, không xóa dữ liệu, nhưng chúng có thể lệch hàng so với các cột bên cạnh.`,
    confirmShift: "Vẫn thêm dòng",
    added: (where: string) => `Đã thêm công tác tại ${where}.`,
    changed:
      "Bảng hoặc dữ liệu bên dưới đã thay đổi trong lúc chờ xác nhận nên add-in chưa ghi gì. Hãy bấm Thêm vào bảng để kiểm tra lại.",
    blockedTitle: "Không thể thêm dòng vào bảng này",
    failed: "Thêm công tác thất bại",
  },

  blockers: {
    protected: "Sheet đang được bảo vệ (Protect). Bỏ bảo vệ sheet hoặc chọn vị trí khác.",
    tableOverlap: (tables: string) =>
      `Vùng đích chồng lên Excel Table có sẵn: ${tables}. Chọn vị trí khác.`,
    mergedCells: (addresses: string) =>
      `Vùng đích có ô gộp (${addresses}). Bỏ gộp ô hoặc chọn vị trí khác.`,
    outOfBounds:
      "Mẫu báo giá vượt quá giới hạn hàng/cột của sheet. Chọn ô ở vị trí cao hơn hoặc bên trái hơn.",
    sheetMissing: "Sheet không còn tồn tại (có thể vừa bị đổi tên hoặc xóa).",
    tableMissing:
      "Bảng không còn tồn tại (có thể vừa bị đổi tên hoặc xóa). Tải lại danh sách bảng.",
    headersChanged:
      "Tiêu đề cột của bảng đã bị đổi so với mẫu nên add-in không chắc ghi đúng cột. Khôi phục tiêu đề cột hoặc gõ trực tiếp trong Excel.",
    selectionOutsideTable:
      "Vùng đang chọn không nằm trong bảng đã chọn. Chọn một ô trong bảng trên Excel, hoặc chọn vị trí Cuối bảng.",
  },
} as const;
