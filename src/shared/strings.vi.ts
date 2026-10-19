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
      "Bản đang phát triển: các tính năng lập báo giá và thư viện cá nhân sẽ được bổ sung ở các giai đoạn tiếp theo.",
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
} as const;
