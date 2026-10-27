/** Chuỗi tiếng Việt của thư viện định mức và bộ máy tính đơn giá (ADR-0013). */

export const NORM_CALC_STRINGS = {
  unnamed: "(thành phần chưa có tài nguyên)",
  normNotFound: "Không tìm thấy phiên bản định mức này. Có thể nó vừa bị xóa.",
  emptyNorm: "Định mức chưa có thành phần nào. Thêm ít nhất một tài nguyên.",
  normInactive: (version: string) =>
    `Phiên bản ${version} đang ở trạng thái Ngừng dùng. Kết quả chỉ để tham khảo.`,
  missingWorkUnit: "Định mức chưa có đơn vị tính của công tác.",
  noResourceLink: (label: string) => `Thành phần ${label} chưa liên kết tài nguyên trong thư viện.`,
  resourceMissing: (code: string, name: string) =>
    `Tài nguyên "${code}${name ? `: ${name}` : ""}" (lúc liên kết) không còn trong thư viện. Hãy liên kết lại hoặc xóa thành phần.`,
  resourceUnitChanged: (code: string, from: string, to: string) =>
    `Đơn vị của tài nguyên "${code}" đã đổi từ "${from}" sang "${to}". Hao phí đang khai theo đơn vị cũ; add-in không tự quy đổi. Kiểm tra hao phí rồi bấm Cập nhật liên kết.`,
  resourceRenamed: (oldCode: string, code: string, name: string) =>
    `Tài nguyên liên kết (lúc liên kết mã "${oldCode}") nay là "${code}: ${name}". Kiểm tra đúng tài nguyên rồi bấm Cập nhật liên kết.`,
  resourceTypeChanged: (code: string) =>
    `Loại của tài nguyên "${code}" đã đổi so với lúc liên kết; chi phí được tính vào nhóm theo loại hiện tại.`,
  duplicateComponent: (code: string) =>
    `Tài nguyên "${code}" xuất hiện nhiều lần trong định mức. Gộp thành một thành phần để không cộng trùng.`,
  invalidConsumption: (label: string) => `Hao phí của ${label} không hợp lệ (phải là số không âm).`,
  zeroConsumption: (label: string) =>
    `Hao phí của ${label} bằng 0: thành phần không đóng góp chi phí.`,
  invalidWasteRate: (label: string) => `Tỷ lệ hao hụt của ${label} không hợp lệ (từ 0% đến 100%).`,
  wasteIgnored: (label: string) =>
    `${label} có tỷ lệ hao hụt nhưng định mức ghi "hao phí đã gồm hao hụt": add-in không cộng thêm để tránh tính trùng.`,
  missingPrice: (code: string) =>
    `Tài nguyên "${code}" chưa có giá đang dùng, còn hiệu lực, cùng đơn vị. Thêm giá hoặc chọn giá cụ thể.`,
  ambiguousPrice: (code: string, count: number) =>
    `Tài nguyên "${code}" có ${count} giá dùng được; add-in không tự chọn. Hãy chọn giá áp dụng.`,
  selectedPriceMissing: (code: string) =>
    `Giá đã chọn cho "${code}" không còn tồn tại. Hãy chọn lại.`,
  priceUnitMismatch: (code: string, priceUnit: string, unit: string) =>
    `Giá chọn cho "${code}" tính theo "${priceUnit}", khác đơn vị tài nguyên "${unit}". Add-in không tự quy đổi đơn vị.`,
  invalidPrice: (code: string) => `Đơn giá của "${code}" không hợp lệ (phải là số không âm).`,
  zeroPrice: (code: string) => `Đơn giá của "${code}" bằng 0. Kiểm tra lại.`,
  inactivePrice: (code: string) => `Giá chọn cho "${code}" đang ở trạng thái Ngưng dùng.`,
  priceNotInEffect: (code: string, expired: boolean) =>
    `Giá chọn cho "${code}" ${expired ? "đã hết hiệu lực" : "chưa có hiệu lực"} vào ngày tính.`,
  currencyMismatch: (list: string) =>
    `Các giá dùng khác tiền tệ (${list}). Add-in không quy đổi tiền tệ; chọn giá cùng một tiền tệ.`,
  overflow:
    "Kết quả vượt quá 15 chữ số, giới hạn chính xác của Excel. Kiểm tra lại hao phí và đơn giá.",
} as const;

export const NORM_UI = {
  title: "Định mức",
  intro:
    "Định mức hao phí do bạn tự nhập hoặc lấy từ tài liệu. ConsQuotation không kèm sẵn định mức nào và không xác nhận tính pháp lý của định mức.",
  add: "Thêm định mức",
  empty: "Chưa có định mức nào.",
  search: "Tìm theo mã, tên (không cần gõ dấu)",
  statusFilter: "Trạng thái",
  allStatuses: "Tất cả",
  status: { draft: "Nháp", approved: "Đang dùng", inactive: "Ngừng dùng" } as Record<
    "draft" | "approved" | "inactive",
    string
  >,
  listLine: (unit: string, components: number) => `đơn vị ${unit} · ${components} thành phần`,
  linkedTo: (code: string) => `công tác ${code}`,
  sourceUser: "Người dùng tự xây dựng",
  sourceDocument: (source: string, verified: boolean) =>
    `Tài liệu: ${source}${verified ? " (đã đối chiếu)" : " (chưa đối chiếu)"}`,
  open: "Mở",
  copyVersion: "Sao chép thành phiên bản mới",
  copied: (code: string, version: string) => `Đã tạo phiên bản nháp ${version} của ${code}.`,
  approve: "Chuyển sang đang dùng",
  deactivate: "Ngừng dùng",
  approved: (code: string, version: string) => `${code} phiên bản ${version} đang dùng.`,
  deactivated: (code: string, version: string) => `${code} phiên bản ${version} đã ngừng dùng.`,
  deleteTitle: "Xóa bản nháp định mức?",
  deleteBody: (code: string, version: string, components: number) =>
    `Xóa định mức ${code} phiên bản ${version} cùng ${components} thành phần. Chỉ bản nháp xóa được. Thao tác không hoàn tác được.`,
  back: "Về danh sách",
  newTitle: "Định mức mới",
  editTitle: (code: string, version: string) => `Định mức ${code} phiên bản ${version}`,
  lockedNote:
    "Phiên bản này không còn là nháp nên thành phần và hao phí đã khóa. Muốn sửa, hãy sao chép thành phiên bản mới.",
  fields: {
    code: "Mã định mức",
    name: "Tên công tác",
    unit: "Đơn vị tính của công tác",
    category: "Nhóm",
    workItem: "Công tác liên kết (dùng khi phân tích đơn giá)",
    noWorkItem: "— Không liên kết —",
    version: "Phiên bản",
    effectiveFrom: "Ngày áp dụng",
    sourceType: "Nguồn định mức",
    sourceUser: "Người dùng tự xây dựng",
    sourceDocument: "Tài liệu bên ngoài",
    source: "Mã hoặc tên tài liệu, số hiệu, ghi chú nguồn",
    sourceVerified: "Đã đối chiếu với tài liệu gốc",
    wasteIncluded: "Hao phí trong nguồn đã gồm hao hụt (không cộng thêm)",
    notes: "Ghi chú",
  },
  save: "Lưu định mức",
  savedNorm: (code: string, version: string) => `Đã lưu ${code} phiên bản ${version}.`,
  components: {
    title: "Thành phần tài nguyên",
    empty: "Chưa có thành phần. Thêm tài nguyên từ thư viện.",
    resource: "Tài nguyên",
    chooseResource: "Chọn tài nguyên…",
    consumption: "Hao phí cơ sở (cho 1 đơn vị công tác)",
    wastePercent: "Hao hụt (%)",
    wasteHint: "Để trống nếu không có. 5 nghĩa là 5%.",
    notes: "Ghi chú",
    add: "Thêm thành phần",
    update: "Lưu thành phần",
    cancelEdit: "Hủy sửa",
    edit: "Sửa",
    up: "Lên",
    down: "Xuống",
    remove: "Xóa",
    refresh: "Cập nhật liên kết",
    needResources: "Thư viện chưa có tài nguyên. Thêm ở tab Tài nguyên trước.",
    deleteTitle: "Xóa thành phần?",
    deleteBody: (code: string) => `Xóa thành phần "${code}" khỏi bản nháp định mức này.`,
    line: (base: string, waste: string, effective: string, unit: string) =>
      `Hao phí ${base}${waste ? ` · hao hụt ${waste}%` : ""} → tính toán ${effective} ${unit}`,
    priced: (price: string, unit: string, amount: string) => `× ${price}/${unit} = ${amount}`,
    unpriced: "chưa tính được thành tiền",
    choosePrice: "Giá áp dụng",
    autoPrice: "— Tự chọn (khi chỉ có một giá dùng được) —",
    priceOption: (price: string, unit: string, status: string, source: string) =>
      `${price}/${unit} · ${status}${source ? ` · ${source}` : ""}`,
  },
  result: {
    title: "Kết quả tính",
    valid: "Hợp lệ",
    validWithWarnings: "Tính được, có cảnh báo",
    invalid: "Chưa tính được",
    material: "Chi phí vật liệu",
    labor: "Chi phí nhân công",
    machine: "Chi phí máy thi công",
    other: "Chi phí tài nguyên khác",
    unitPrice: (unit: string) => `Đơn giá tổng hợp (cho 1 ${unit})`,
    missing: "Chưa tính được",
    rounding:
      "Giữ đủ phần lẻ, không làm tròn. Khi dùng trong báo giá, quy tắc làm tròn của workbook được áp dụng.",
    dateNote: (date: string) => `Giá tài nguyên lấy theo hiệu lực ngày ${date}.`,
    formula:
      "Hao phí tính toán = hao phí cơ sở × (1 + hao hụt); thành tiền = hao phí tính toán × đơn giá; đơn giá tổng hợp = tổng thành tiền.",
    issuesTitle: "Lỗi và cảnh báo",
  },
  exportExcel: "Xuất bảng diễn giải ra Excel",
  exporting: "Đang ghi…",
  exported: (sheet: string) =>
    `Đã ghi bảng diễn giải vào sheet mới "${sheet}". Công thức Excel tính lại để bạn đối chiếu với cột Kết quả add-in.`,
  exportInvalid: "Kết quả chưa hợp lệ nên chưa xuất. Sửa các lỗi ở trên trước.",
  changedMeanwhile:
    "Dữ liệu định mức hoặc giá vừa thay đổi kể từ lúc tính nên chưa xuất. Kết quả đã được tính lại; hãy xem lại rồi xuất.",
} as const;
