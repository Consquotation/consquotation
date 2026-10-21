import { ResourceType } from "../domain/library/types";
import { Validity } from "../domain/library/dates";

/** Chuỗi giao diện tiếng Việt cho "Thư viện của tôi" (prompts/08). */
export const LIBRARY_STRINGS = {
  title: "Thư viện của tôi",
  intro:
    "Thư viện do chính bạn tạo và quản lý. ConsQuotation không kèm sẵn định mức hay đơn giá nào. Dữ liệu lưu trên máy này, trong bộ nhớ của add-in.",
  loading: "Đang mở thư viện…",
  loadFailed: "Không mở được thư viện",
  retry: "Thử lại",
  sections: {
    label: "Các phần của thư viện",
    workItems: "Công tác",
    resources: "Tài nguyên",
    check: "Kiểm tra",
  },
  emptyButUsed:
    "Thư viện trên máy này đang trống, nhưng workbook này từng dùng thư viện. Có thể cache Office đã bị xóa hoặc bạn đang dùng máy/tài khoản khác. Hãy khôi phục từ bản sao lưu (nếu có) trước khi nhập lại.",
  search: "Tìm theo mã, tên, nhóm, đơn vị (không cần gõ dấu)",
  allGroups: "Tất cả nhóm",
  group: "Nhóm",
  count: (shown: number, total: number) =>
    shown === total ? `${total} mục` : `${shown} / ${total} mục`,
  showMore: "Xem thêm",
  noResults: "Không có mục nào khớp tìm kiếm.",
  actions: {
    add: "Thêm",
    edit: "Sửa",
    copy: "Sao chép",
    delete: "Xóa",
    insert: "Chèn vào báo giá",
    save: "Lưu",
    saveWorkItem: "Lưu công tác",
    saveResource: "Lưu tài nguyên",
    savePrice: "Lưu giá",
    cancel: "Hủy",
    close: "Đóng",
  },
  saved: (label: string) => `Đã lưu "${label}".`,
  copied: (code: string) => `Đã sao chép thành "${code}".`,
  deleted: (label: string) => `Đã xóa "${label}".`,
  saveFailed: "Lưu thất bại",

  workItems: {
    empty: "Thư viện chưa có công tác nào. Bấm Thêm công tác để bắt đầu.",
    add: "Thêm công tác",
    newTitle: "Công tác mới",
    editTitle: (code: string) => `Sửa công tác ${code}`,
    fields: {
      code: "Mã công tác",
      name: "Tên công tác",
      group: "Nhóm công tác",
      unit: "Đơn vị tính",
      description: "Mô tả",
      unitPrice: "Đơn giá",
      currency: "Tiền tệ",
      source: "Nguồn giá",
      effectiveFrom: "Hiệu lực từ ngày",
      effectiveTo: "Hiệu lực đến ngày",
      notes: "Ghi chú",
    },
    priceHint: "Để trống nếu chưa có giá (không phải 0). Dùng . hoặc , làm dấu thập phân.",
    noPrice: "Chưa có giá",
    deleteTitle: "Xóa công tác?",
    deleteBody: (code: string, norms: number) =>
      `Xóa công tác "${code}"${norms > 0 ? ` cùng ${norms} dòng định mức` : ""} khỏi thư viện. Các báo giá đã chèn công tác này không bị thay đổi. Thao tác không hoàn tác được.`,
  },

  norms: {
    title: "Định mức (hao phí cho 1 đơn vị công tác)",
    empty: "Chưa có định mức. Định mức là tùy chọn — chỉ thêm nếu bạn có dữ liệu.",
    needResources: "Cần thêm tài nguyên ở phần Tài nguyên trước khi khai báo định mức.",
    resource: "Tài nguyên",
    chooseResource: "Chọn tài nguyên…",
    quantity: "Hao phí",
    add: "Thêm định mức",
    saveFirst: "Lưu công tác trước, sau đó mở lại để khai báo định mức.",
    missingResource: "(tài nguyên không còn tồn tại)",
    deleteTitle: "Xóa định mức?",
    deleteBody: "Xóa dòng định mức này khỏi công tác. Thao tác không hoàn tác được.",
  },

  resources: {
    empty:
      "Thư viện chưa có tài nguyên nào. Tài nguyên (vật liệu, nhân công, máy…) dùng cho định mức và giá nguồn.",
    add: "Thêm tài nguyên",
    newTitle: "Tài nguyên mới",
    editTitle: (code: string) => `Sửa tài nguyên ${code}`,
    fields: {
      code: "Mã tài nguyên",
      name: "Tên tài nguyên",
      type: "Loại",
      unit: "Đơn vị tính",
      notes: "Ghi chú",
    },
    types: {
      material: "Vật liệu",
      labor: "Nhân công",
      machine: "Máy thi công",
      other: "Khác",
    } as Record<ResourceType, string>,
    priceCount: (n: number) => (n === 0 ? "chưa có giá" : `${n} giá`),
    deleteTitle: "Xóa tài nguyên?",
    deleteBody: (code: string, prices: number) =>
      `Xóa tài nguyên "${code}"${prices > 0 ? ` cùng ${prices} giá` : ""} khỏi thư viện. Thao tác không hoàn tác được.`,
    inUse: (n: number) =>
      `Không thể xóa: tài nguyên đang được dùng trong ${n} định mức. Hãy xóa các định mức đó trước.`,
  },

  prices: {
    title: "Giá nguồn",
    empty: "Chưa có giá. Thêm giá kèm nguồn và ngày hiệu lực để dễ truy vết.",
    saveFirst: "Lưu tài nguyên trước, sau đó mở lại để thêm giá.",
    add: "Thêm giá",
    fields: {
      price: "Đơn giá",
      unit: "Đơn vị tính của giá",
      currency: "Tiền tệ",
      effectiveFrom: "Hiệu lực từ ngày",
      effectiveTo: "Hiệu lực đến ngày",
      source: "Nguồn",
      status: "Trạng thái",
      notes: "Ghi chú",
    },
    status: { active: "Đang dùng", inactive: "Ngưng dùng" },
    noAutoPick:
      "ConsQuotation không tự chọn giá mới nhất là giá đúng. Khi có nhiều giá, bạn tự quyết định giá nào áp dụng.",
    deleteTitle: "Xóa giá?",
    deleteBody: "Xóa giá này khỏi thư viện. Thao tác không hoàn tác được.",
  },

  validity: {
    noDates: "Không ghi hiệu lực",
    notYetEffective: "Chưa hiệu lực",
    active: "Còn hiệu lực",
    expired: "Hết hạn",
  } as Record<Validity, string>,

  check: {
    title: "Kiểm tra thư viện",
    description:
      "Tìm mã trùng, dữ liệu thiếu, liên kết hỏng, giá hết hạn và nhiều giá chồng thời gian. Add-in chỉ báo, không tự sửa.",
    run: "Kiểm tra lại",
    ok: "Không phát hiện vấn đề nào.",
    errors: (n: number) => `${n} lỗi`,
    warnings: (n: number) => `${n} cảnh báo`,
    error: "Lỗi",
    warning: "Cảnh báo",
  },

  insert: {
    prefilled: (code: string) =>
      `Đã lấy công tác "${code}" từ thư viện. Kiểm tra, nhập Khối lượng rồi bấm Thêm vào bảng. Dòng báo giá là bản sao — sửa thư viện sau này không làm đổi báo giá.`,
    missingPrice: "Công tác chưa có đơn giá trong thư viện — ô Đơn giá sẽ để trống.",
    expired: (date: string) =>
      `Đơn giá đã hết hiệu lực sau ngày ${date}. Hãy kiểm tra lại trước khi dùng.`,
    notYetEffective: (date: string) => `Đơn giá chỉ có hiệu lực từ ngày ${date}.`,
    noQuoteTable: "Chưa có bảng báo giá trong workbook. Hãy tạo bảng báo giá trước.",
  },

  storage: {
    title: "Thư viện của tôi — nơi lưu",
    where:
      "Lưu trong bộ nhớ cục bộ (IndexedDB) của add-in trên máy này, theo tài khoản Office và địa chỉ add-in. Không gửi lên máy chủ nào.",
    counts: (w: number, r: number, p: number, n: number) =>
      `${w} công tác · ${r} tài nguyên · ${p} giá · ${n} định mức`,
    lastBackup: (at: string) => `Lần sao lưu/xuất gần nhất: ${at}.`,
    noBackup: "Chưa sao lưu lần nào (Thư viện › Nhập/Xuất).",
    risk: "Dữ liệu mất khi xóa cache Office; không tự đồng bộ giữa các máy hoặc giữa Excel desktop và Excel trên web.",
  },
} as const;
