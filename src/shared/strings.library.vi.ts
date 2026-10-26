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
    catalog: "Danh mục",
    check: "Kiểm tra",
  },
  emptyButUsed:
    "Thư viện trên máy này đang trống, nhưng workbook này từng dùng thư viện. Có thể cache Office đã bị xóa hoặc bạn đang dùng máy/tài khoản khác. Hãy khôi phục từ bản sao lưu (nếu có) trước khi nhập lại.",
  search: "Tìm theo mã, tên, nhóm, đơn vị, nhà cung cấp (không cần gõ dấu)",
  allGroups: "Tất cả nhóm",
  noGroup: "Chưa phân nhóm",
  group: "Nhóm",
  supplier: "Nhà cung cấp",
  allSuppliers: "Tất cả",
  noSupplier: "Không có nhà cung cấp",
  type: "Loại",
  allTypes: "Tất cả loại",
  sort: "Sắp xếp",
  sortBy: { code: "Theo mã", name: "Theo tên", price: "Theo đơn giá" },
  refs: {
    noneCategory: "— Chưa phân nhóm —",
    newCategory: "+ Nhóm mới…",
    newCategoryName: "Tên nhóm mới",
    noneSupplier: "— Không có —",
    newSupplier: "+ Nhà cung cấp mới…",
    newSupplierName: "Tên nhà cung cấp mới",
  },
  sameName: (codes: string) =>
    `Đã có bản ghi cùng tên: ${codes}. Kiểm tra có bị nhập trùng không (vẫn lưu được).`,
  actionFailed: "Thao tác thất bại",
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
      group: "Nhóm",
      unit: "Đơn vị tính",
      description: "Mô tả",
      unitPrice: "Đơn giá",
      currency: "Tiền tệ",
      supplier: "Nhà cung cấp",
      source: "Nguồn giá",
      effectiveFrom: "Hiệu lực từ ngày",
      effectiveTo: "Hiệu lực đến ngày",
      notes: "Ghi chú",
    },
    priceHint: "Để trống nếu chưa có giá (không phải 0). Dùng . hoặc , làm dấu thập phân.",
    noPrice: "Chưa có giá",
    deleteTitle: "Xóa công tác?",
    deleteBody: (code: string, name: string, norms: number) =>
      `Xóa công tác "${code}: ${name}"${norms > 0 ? ` cùng ${norms} dòng định mức` : ""} khỏi thư viện. Các báo giá đã chèn công tác này không bị thay đổi. Thao tác không hoàn tác được.`,
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
      category: "Nhóm",
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
    currentPrice: (price: string) => `giá hiện hành ${price}`,
    manyActive: (n: number) => `${n} giá đang dùng còn hiệu lực, tự chọn khi dùng`,
    noActive: "chưa có giá còn hiệu lực",
    deleteTitle: "Xóa tài nguyên?",
    deleteBody: (code: string, name: string, prices: number) =>
      `Xóa tài nguyên "${code}: ${name}"${prices > 0 ? ` cùng ${prices} giá` : ""} khỏi thư viện. Thao tác không hoàn tác được.`,
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
      supplier: "Nhà cung cấp",
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

  overview: {
    nameLabel: "Tên thư viện",
    rename: "Đổi tên",
    saveName: "Lưu tên",
    stats: (w: number, r: number, p: number, c: number, s: number) =>
      `${w} công tác · ${r} tài nguyên · ${p} giá · ${c} nhóm · ${s} nhà cung cấp`,
    lastChanged: (at: string) => `Cập nhật gần nhất: ${at}`,
    neverChanged: "Chưa có thay đổi nào",
    storage:
      "Lưu trên máy này (bộ nhớ IndexedDB của add-in), không đồng bộ giữa các máy. Hãy sao lưu định kỳ.",
    addWorkItem: "Thêm công tác",
    addResource: "Thêm tài nguyên",
    exchange: "Nhập / Xuất / Sao lưu",
  },

  categories: {
    title: "Nhóm",
    intro:
      "Nhóm dùng chung cho công tác và tài nguyên (ví dụ do bạn tự đặt: vật liệu, cây xanh, vận chuyển). Không có nhóm mặc định.",
    add: "Thêm nhóm",
    empty: "Chưa có nhóm nào.",
    name: "Tên nhóm",
    notes: "Ghi chú",
    newTitle: "Nhóm mới",
    editTitle: (name: string) => `Sửa nhóm "${name}"`,
    usage: (w: number, r: number) => `${w} công tác · ${r} tài nguyên`,
    unassigned: (w: number, r: number) => `Chưa phân nhóm: ${w} công tác · ${r} tài nguyên`,
    deleteTitle: "Xóa nhóm?",
    deleteUnused: (name: string) =>
      `Xóa nhóm "${name}". Nhóm đang không có công tác hay tài nguyên nào.`,
    deleteUsed: (name: string, w: number, r: number) =>
      `Nhóm "${name}" đang có ${w} công tác và ${r} tài nguyên. Các bản ghi này KHÔNG bị xóa; hãy chọn nơi chuyển chúng tới.`,
    moveTo: "Chuyển công tác/tài nguyên sang",
    unassign: "Bỏ phân nhóm",
    deleteConfirm: "Xóa nhóm",
  },

  suppliers: {
    title: "Nhà cung cấp",
    intro:
      "Thông tin cơ bản để ghi nguồn giá. Thông tin liên hệ chỉ lưu trên máy này và trong file sao lưu của bạn.",
    add: "Thêm nhà cung cấp",
    empty: "Chưa có nhà cung cấp nào.",
    name: "Tên nhà cung cấp",
    contactInfo: "Liên hệ (điện thoại, email, địa chỉ…)",
    notes: "Ghi chú",
    newTitle: "Nhà cung cấp mới",
    editTitle: (name: string) => `Sửa nhà cung cấp "${name}"`,
    usage: (w: number, p: number) => `${w} công tác · ${p} giá`,
    deleteTitle: "Xóa nhà cung cấp?",
    deleteBody: (name: string, w: number, p: number) =>
      `Xóa nhà cung cấp "${name}".${w + p > 0 ? ` ${w} công tác và ${p} giá đang ghi nhà cung cấp này sẽ chỉ bị bỏ liên kết (giá và nguồn giá giữ nguyên).` : ""} Thao tác không hoàn tác được.`,
  },

  storage: {
    title: "Thư viện của tôi — nơi lưu",
    where:
      "Lưu trong bộ nhớ cục bộ (IndexedDB) của add-in trên máy này, theo tài khoản Office và địa chỉ add-in. Không gửi lên máy chủ nào.",
    counts: (w: number, r: number, p: number, n: number, c: number, s: number) =>
      `${w} công tác · ${r} tài nguyên · ${p} giá · ${n} định mức · ${c} nhóm · ${s} nhà cung cấp`,
    lastBackup: (at: string) => `Lần sao lưu/xuất gần nhất: ${at}.`,
    noBackup: "Chưa sao lưu lần nào (Thư viện › Nhập/Xuất).",
    risk: "Dữ liệu mất khi xóa cache Office; không tự đồng bộ giữa các máy hoặc giữa Excel desktop và Excel trên web.",
  },
} as const;
