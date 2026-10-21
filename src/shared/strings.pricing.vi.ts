import { AdjustmentKind, AdjustmentMethod } from "../domain/pricing/adjustments";
import { PriceMethod } from "../domain/pricing/quoteCheck";
import { RoundingLevel, RoundingMode } from "../domain/pricing/rounding";

/** Chuỗi giao diện tiếng Việt cho tính đơn giá và thành tiền (prompts/10). */
export const PRICING_STRINGS = {
  tab: "Tính giá",

  method: {
    label: "Cách xác định đơn giá",
    library: "Đơn giá trong thư viện",
    libraryNone: "Đơn giá trong thư viện (chưa có)",
    composition: (n: number) => `Phân tích từ định mức (${n} tài nguyên)`,
  },

  composition: {
    title: "Chọn giá tài nguyên",
    intro:
      'Đơn giá = Σ (hao phí × đơn giá nguồn). Add-in ghi chi tiết vào sheet "Phân tích đơn giá" bằng công thức Excel để truy vết; dòng báo giá nhận kết quả dạng giá trị.',
    noPrice: "— Chưa chọn (nhập sau trên sheet phân tích) —",
    priceOption: (price: string, unit: string, status: string, validity: string, source: string) =>
      `${price}/${unit} · ${status} · ${validity}${source ? ` · ${source}` : ""}`,
    unitMismatch: " · khác đơn vị — không dùng được",
    onlyValid: "Chọn sẵn vì là giá duy nhất đang dùng, còn hiệu lực và đúng đơn vị — kiểm tra lại.",
    mustChoose: "Có nhiều giá — hãy tự chọn giá áp dụng (add-in không tự chọn giá mới nhất).",
    noOptions: "Tài nguyên chưa có giá nào trong thư viện.",
    missingResource: "(tài nguyên không còn tồn tại)",
    quantity: (q: string, unit: string) => `Hao phí ${q} ${unit}`,
    lineAmount: (amount: string) => `= ${amount}`,
    preview: (value: string, currency: string, rule: string) =>
      `Tạm tính: ${value}${currency ? ` ${currency}` : ""} (${rule}). Giá trị ghi vào báo giá do Excel tính trên sheet phân tích.`,
    previewMissing: "Chưa tính được: còn tài nguyên chưa chọn giá.",
    exists: (code: string, price: string) =>
      `Mã "${code}" đã có phân tích trên sheet (đơn giá ${price}). Add-in sẽ dùng phân tích có sẵn; lựa chọn giá bên dưới không được áp dụng. Muốn phân tích lại: xóa các dòng của mã này trên sheet "Phân tích đơn giá".`,
    existsMissing: "chưa đủ số liệu",
    unitPriceLocked: "Lấy từ sheet phân tích",
    analysisSheet: (sheet: string) => `Chi tiết phân tích ở sheet "${sheet}".`,
    addedMissing:
      "Phân tích còn thiếu đơn giá nguồn nên Đơn giá trong báo giá để trống. Nhập đơn giá nguồn trên sheet phân tích, rồi dùng Tính giá › Kiểm tra báo giá để cập nhật.",
    addedError: (error: string) =>
      `Đơn giá phân tích đang lỗi (${error}) nên Đơn giá trong báo giá để trống. Kiểm tra sheet phân tích.`,
    existsUsed: (code: string) =>
      `Mã "${code}" vừa có phân tích trên sheet (được thêm ở nơi khác) nên add-in đã dùng phân tích có sẵn thay cho lựa chọn giá của bạn.`,
    analysisWrittenButChanged:
      "Đã ghi phân tích nhưng bảng báo giá vừa thay đổi nên chưa thêm dòng. Hãy bấm Thêm lần nữa — phân tích có sẵn sẽ được dùng lại.",
  },

  rounding: {
    title: "Quy tắc làm tròn (workbook này)",
    intro:
      "Mặc định không làm tròn. Làm tròn bằng hàm Excel trong công thức, áp dụng cho cả workbook và lưu trong file.",
    levels: {
      unitPrice: "Đơn giá phân tích (sheet Phân tích đơn giá)",
      amount: "Thành tiền từng dòng báo giá",
      adjustment: "Khoản chiết khấu/phụ phí/thuế",
    } as Record<RoundingLevel, string>,
    levelHint: {
      unitPrice: "Đơn giá nhập trực tiếp hoặc lấy từ thư viện không bị làm tròn.",
      amount:
        "Thành tiền = làm tròn(Khối lượng × Đơn giá). Tổng là tổng các Thành tiền đã làm tròn.",
      adjustment: "Mỗi khoản được làm tròn trước khi cộng dồn.",
    } as Record<RoundingLevel, string>,
    mode: "Kiểu làm tròn",
    modes: {
      none: "Không làm tròn",
      round: "Gần nhất — 0,5 làm tròn ra xa số 0 (ROUND)",
      roundUp: "Luôn ra xa số 0 (ROUNDUP)",
      roundDown: "Luôn về phía số 0 (ROUNDDOWN)",
    } as Record<RoundingMode, string>,
    digits: "Độ chính xác",
    digitOptions: [
      [-6, "Hàng triệu"],
      [-3, "Hàng nghìn"],
      [-2, "Hàng trăm"],
      [-1, "Hàng chục"],
      [0, "Hàng đơn vị (0 chữ số thập phân)"],
      [1, "1 chữ số thập phân"],
      [2, "2 chữ số thập phân"],
      [3, "3 chữ số thập phân"],
      [4, "4 chữ số thập phân"],
    ] as [number, string][],
    apply: "Áp dụng quy tắc làm tròn",
    confirmTitle: "Áp dụng quy tắc làm tròn?",
    confirmBody:
      "Add-in cập nhật công thức Thành tiền của mọi bảng báo giá, đơn giá công tác trên sheet phân tích và các khoản tổng hợp theo quy tắc mới. Ô có công thức bị sửa tay được giữ nguyên. Đơn giá đã ghi trong báo giá (dạng giá trị) không tự đổi — dùng Kiểm tra báo giá để cập nhật.",
    applied: (updated: number, kept: number) =>
      `Đã áp dụng: cập nhật ${updated} ô công thức${kept > 0 ? `; giữ nguyên ${kept} ô có công thức bị sửa tay` : ""}. Hãy chạy Kiểm tra báo giá nếu có đơn giá phân tích.`,
    current: (text: string) => `Hiện tại: ${text}.`,
  },

  summary: {
    title: "Tổng hợp: chiết khấu, phụ phí, thuế",
    intro:
      "Các khoản áp dụng theo thứ tự từ trên xuống, tính bằng công thức Excel trong bảng ngay dưới bảng báo giá. Add-in không có khoản hay tỷ lệ mặc định nào — bạn tự nhập theo hợp đồng/quy định áp dụng.",
    table: "Bảng báo giá",
    none: "Bảng này chưa có phần tổng hợp. Thêm khoản mục rồi bấm Áp dụng.",
    existing: (address: string) =>
      `Đang có bảng tổng hợp tại ${address}. Sửa bên dưới rồi bấm Áp dụng để ghi lại (giá trị bạn sửa trực tiếp trên sheet đã được đọc vào đây).`,
    invalidRows: (n: number) =>
      `${n} dòng trên sheet có Loại/Cách tính/Giá trị không hợp lệ và sẽ bị bỏ khi ghi lại.`,
    add: "Thêm khoản mục",
    name: "Khoản mục",
    namePlaceholder: "Ví dụ: Chiết khấu thương mại, Thuế GTGT",
    kind: "Loại",
    kinds: { deduct: "Giảm trừ (−)", add: "Cộng thêm (+)" } as Record<AdjustmentKind, string>,
    methodLabel: "Cách tính",
    methods: {
      percentOfRunning: "% trên lũy kế (giá trị sau các khoản phía trên)",
      percentOfBase: "% trên giá trị báo giá (trước mọi khoản)",
      fixed: "Số tiền cố định",
    } as Record<AdjustmentMethod, string>,
    value: "Giá trị",
    valueHintPercent: "Tỷ lệ % (ví dụ 8 nghĩa là 8%). Để trống nếu chưa có — tổng sẽ báo thiếu.",
    valueHintFixed: "Số tiền. Để trống nếu chưa có — tổng sẽ báo thiếu.",
    moveUp: "Lên",
    moveDown: "Xuống",
    remove: "Bỏ",
    apply: "Áp dụng",
    removeTable: "Xóa bảng tổng hợp",
    confirmTitle: "Ghi bảng tổng hợp?",
    confirmBody: (address: string, n: number) =>
      `Ghi bảng tổng hợp ${n} khoản mục tại ${address}. Vùng này đã được kiểm tra là trống (hoặc là bảng tổng hợp cũ của add-in).`,
    removeTitle: "Xóa bảng tổng hợp?",
    removeBody:
      "Xóa bảng tổng hợp (chiết khấu/phụ phí/thuế) của bảng báo giá này. Thao tác không hoàn tác được bằng Ctrl+Z.",
    written: "Đã ghi bảng tổng hợp.",
    removed: "Đã xóa bảng tổng hợp.",
    blocked: {
      tableMissing:
        "Không tìm thấy bảng báo giá (có thể vừa bị xóa hoặc đổi tên). Bấm Tải lại danh sách.",
      headersChanged: "Bảng báo giá đã bị đổi tên cột mẫu.",
      noTotals:
        "Bảng báo giá không bật dòng tổng (Table Design › Total Row) nên không có giá trị để tổng hợp.",
      protected: "Sheet đang được bảo vệ. Bỏ bảo vệ (Review › Unprotect Sheet) rồi thử lại.",
      occupied: (sample: string) =>
        `Vùng cần cho bảng tổng hợp (dưới dòng tổng của bảng báo giá) đang có dữ liệu ở ${sample}. Add-in không ghi đè — hãy di chuyển dữ liệu đó rồi thử lại.`,
    },
    errors: "Hãy sửa các lỗi được đánh dấu.",
    changedOnSheet:
      "Bảng tổng hợp trên sheet vừa được sửa sau khi panel tải. Add-in chưa ghi gì và đã tải lại giá trị mới nhất — hãy xem lại rồi bấm Áp dụng.",
  },

  check: {
    title: "Kiểm tra báo giá",
    intro:
      "Đọc trực tiếp bảng báo giá trên sheet: lỗi công thức, thiếu hoặc sai dữ liệu, đơn giá bằng 0, công thức bị sửa tay, đơn giá lệch sheet phân tích, phần tổng hợp. Add-in chỉ báo; mọi sửa đổi đều cần bạn xác nhận.",
    run: "Kiểm tra",
    table: "Bảng báo giá",
    ok: (rows: number) => `Không phát hiện vấn đề nào (${rows} dòng công tác).`,
    counts: (errors: number, warnings: number, rows: number) =>
      `${rows} dòng công tác: ${errors} lỗi, ${warnings} cảnh báo.`,
    error: "Lỗi",
    warning: "Cảnh báo",
    goTo: "Đi tới",
    hint: (text: string) => `Cách sửa: ${text}`,
    checkedAt: (time: string) =>
      `Kết quả lúc ${time}. Nếu bạn sửa sheet sau đó, hãy bấm Kiểm tra lại — add-in không dùng kết quả cũ để ghi.`,
    circularNote:
      "Tham chiếu vòng: Excel tự cảnh báo trên thanh trạng thái; add-in không đọc được trạng thái này.",
    fixAll: (n: number) => `Cập nhật ${n} đơn giá theo sheet phân tích`,
    fixTitle: "Cập nhật đơn giá theo phân tích?",
    fixBody: (n: number) =>
      `Ghi ${n} đơn giá từ sheet "Phân tích đơn giá" vào bảng báo giá (thay giá trị hiện có). Thao tác không hoàn tác được bằng Ctrl+Z.`,
    fixed: (n: number) => `Đã cập nhật ${n} đơn giá. Kiểm tra lại để xác nhận.`,
    changed: "Bảng báo giá vừa thay đổi kể từ lúc kiểm tra; chưa ghi gì. Hãy kiểm tra lại.",
    methodsTitle: "Phương pháp và nguồn đơn giá",
    methods: {
      direct: "Nhập trực tiếp",
      library: "Thư viện",
      composition: "Phân tích định mức",
      formula: "Công thức tự nhập",
      missing: "Chưa có đơn giá",
    } as Record<PriceMethod, string>,
    noTables: "Chưa có bảng báo giá trong workbook.",
  },

  failed: "Thao tác thất bại",
  cancel: "Hủy",
  confirm: "Đồng ý",
};
