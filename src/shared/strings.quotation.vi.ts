/** Chuỗi giao diện tab "Công tác": quản lý báo giá theo dòng (giai đoạn 17, ADR-0014). */

export const QUOTATION_UI = {
  tab: "Công tác",
  title: "Công tác trong báo giá",
  intro:
    "Mỗi dòng có trạng thái tính toán, đơn giá theo vật liệu, nhân công, máy, khác và nguồn gốc (thư viện, định mức, giá). Số liệu đọc lại từ sheet mỗi lần tải.",
  table: "Bảng báo giá",
  noTables: "Workbook chưa có bảng báo giá. Tạo bảng ở tab Báo giá.",
  reload: "Tải lại",
  loading: "Đang đọc bảng báo giá…",
  state: {
    noRecord: "Chưa có hồ sơ",
    draft: "Nháp",
    completed: "Đã hoàn tất",
    modifiedAfterCompletion: "Đã sửa sau khi hoàn tất",
    unreadable: "Hồ sơ không đọc được",
  },
  stateHint: {
    noRecord: "Bấm Tính lại và lưu để tạo hồ sơ (lưu trong workbook, đi cùng file).",
    draft: "Đang soạn. Sửa trên sheet hoặc qua add-in, rồi bấm Tính lại và lưu.",
    completed: "Nội dung đang khớp với lúc hoàn tất.",
    modifiedAfterCompletion:
      "Bảng đã bị sửa sau khi hoàn tất. Kiểm tra lại rồi hoàn tất lại, hoặc Tính lại và lưu để về nháp.",
    unreadable: "",
  },
  completedAt: (at: string) => `Hoàn tất lúc ${at}.`,
  recalc: "Tính lại và lưu",
  recalcHint:
    "Gán Mã dòng cho dòng chưa có, ghi đơn giá thành phần cho dòng phân tích, lưu kết quả tính vào hồ sơ trong workbook.",
  pending: (ids: number, breakdown: number, removed: number) =>
    [
      ids > 0 ? `gán Mã dòng cho ${ids} dòng` : "",
      breakdown > 0 ? `ghi đơn giá thành phần ${breakdown} dòng` : "",
      removed > 0 ? `bỏ ${removed} mục hồ sơ của dòng đã xóa` : "",
    ]
      .filter(Boolean)
      .join(", "),
  pendingLead: "Lần lưu tới sẽ: ",
  complete: "Đánh dấu hoàn tất",
  reopen: "Mở lại để sửa",
  completeBlocked: "Chưa hoàn tất được:",
  completed: "Đã đánh dấu báo giá hoàn tất.",
  reopened: "Báo giá đã về trạng thái nháp.",
  changed:
    "Bảng báo giá hoặc hồ sơ vừa thay đổi so với lúc bạn xem. Add-in không ghi gì; đã tải lại để bạn xem lại.",
  recalcDone: (s: {
    assigned: number;
    copied: number;
    removed: number;
    breakdownWritten: number;
    completionCleared: boolean;
  }) =>
    [
      "Đã lưu kết quả tính vào hồ sơ.",
      s.assigned > 0 ? `Gán mã ${s.assigned} dòng.` : "",
      s.copied > 0 ? `${s.copied} dòng sao chép nhận mã mới.` : "",
      s.removed > 0 ? `Bỏ ${s.removed} mục của dòng đã xóa.` : "",
      s.breakdownWritten > 0 ? `Ghi đơn giá thành phần ${s.breakdownWritten} dòng.` : "",
      s.completionCleared ? "Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : "",
    ]
      .filter(Boolean)
      .join(" "),
  columns: {
    title: "Bảng chưa có cột quản lý theo dòng",
    body: (missing: string[]) =>
      `Bảng tạo trước bản 1.11.0 thiếu các cột: ${missing.join(", ")}. Không có cột Mã dòng thì không theo dõi được từng dòng khi bạn chèn, xóa, sắp xếp hay sao chép.`,
    add: "Bổ sung cột quản lý theo dòng",
    confirmTitle: "Thêm cột vào bảng báo giá?",
    confirmBody: (missing: string[]) =>
      `Add-in thêm ${missing.length} cột vào bên phải bảng: ${missing.join(", ")}. Cột Mã dòng được ẩn nếu cột đó của sheet không có dữ liệu khác. Dữ liệu hiện có không đổi.`,
    blockedRight: (count: number, sample: string) =>
      `Có ${count} ô có dữ liệu ngay bên phải bảng (${sample}); thêm cột sẽ đẩy chúng lệch hàng. Hãy dời các ô đó rồi thử lại.`,
    protected: "Sheet đang được bảo vệ; bỏ bảo vệ sheet rồi thử lại.",
    added: (headers: string[]) => `Đã thêm cột: ${headers.join(", ")}.`,
  },
  summary: {
    title: "Tổng hợp",
    counts: (valid: number, warnings: number, invalid: number) =>
      `${valid} hợp lệ · ${warnings} có cảnh báo · ${invalid} lỗi`,
    total: "Tổng thành tiền (ô tổng của bảng)",
    totalError: (error: string) => `Ô tổng đang lỗi ${error}`,
    computed: "Tổng các dòng tính được (add-in cộng)",
    mismatch: "Hai số tổng khác nhau: có dòng chưa tính được, hoặc ô tổng bị sửa.",
    groups: "Theo nhóm công tác",
    noGroup: "(Chưa ghi nhóm)",
    groupLine: (lines: number, uncomputed: number) =>
      uncomputed > 0 ? `${lines} dòng, ${uncomputed} chưa tính được` : `${lines} dòng`,
    rounding: "Quy tắc làm tròn",
    tableIssues: "Vấn đề của dòng tổng và bảng tổng hợp",
  },
  filter: {
    label: "Hiện",
    all: "Tất cả",
    invalid: "Lỗi",
    warnings: "Có cảnh báo",
    search: "Tìm theo mã, nội dung, nhóm (không cần gõ dấu)",
  },
  lineStatus: { valid: "Hợp lệ", validWithWarnings: "Có cảnh báo", invalid: "Lỗi" },
  method: { manual: "Nhập trực tiếp", library: "Từ thư viện", norm: "Phân tích định mức" },
  empty: "Bảng chưa có dòng công tác nào.",
  noneMatch: "Không có dòng nào khớp bộ lọc.",
  rowLabel: (sheetRow: number) => `Dòng ${sheetRow}`,
  money: "Khối lượng × Đơn giá = Thành tiền",
  breakdown: "Đơn giá vật liệu / nhân công / máy / khác",
  missing: "(trống)",
  details: "Chi tiết",
  hideDetails: "Thu gọn",
  goTo: "Đi tới dòng",
  issues: "Lỗi và cảnh báo",
  noIssues: "Không có vấn đề.",
  source: "Nguồn",
  sourceNorm: (code: string, version: string) => `định mức ${code} v${version}`,
  noRecordItem: "Dòng chưa có trong hồ sơ.",
  components: "Thành phần hao phí (snapshot trong hồ sơ)",
  componentLine: (applied: string, unit: string, price: string, amount: string) =>
    `${applied} ${unit} × ${price} = ${amount}`,
  componentSnapshot: (base: string, waste: string, price: string) =>
    `Lúc chèn: hao phí cơ sở ${base}${waste ? `, hao hụt ${waste}%` : ""}, giá ${price}`,
  changedSinceLast: "Khác lần tính đã lưu trước đó (dữ liệu trên sheet đã đổi).",
  update: "Cập nhật theo thư viện",
  updateTitle: "Cập nhật theo thư viện?",
  updateLibrary: (oldPrice: string, newPrice: string) =>
    `Ghi đơn giá ${newPrice} (thay ${oldPrice}) vào ô Đơn giá của dòng này.`,
  updateNorm: (lines: string[]) =>
    `Ghi giá mới lên sheet phân tích: ${lines.join("; ")}. Khối phân tích dùng chung cho mọi dòng cùng mã công tác; đơn giá của các dòng đó cũng được cập nhật.`,
  updated: (s: {
    analysisCells: number;
    unitPriceCells: number;
    affectedLines: number;
    completionCleared: boolean;
  }) =>
    `Đã cập nhật ${s.analysisCells} giá nguồn trên sheet phân tích và ${s.unitPriceCells} ô đơn giá (${s.affectedLines} dòng dùng chung khối phân tích).${s.completionCleared ? " Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : ""}`,
  updatedLibrary: (completionCleared: boolean) =>
    `Đã cập nhật đơn giá theo thư viện.${completionCleared ? " Nội dung đã khác lúc hoàn tất nên báo giá về nháp." : ""}`,
  confirm: "Cập nhật",
  cancel: "Hủy",
  libraryUnavailable: "Không đọc được thư viện trên máy này; phần so với thư viện bị bỏ qua.",
  registerFailed: (reason: string) =>
    `Dòng đã được ghi vào bảng, nhưng chưa lưu được vào hồ sơ báo giá (${reason}). Mở tab Công tác và bấm Tính lại và lưu.`,
} as const;
