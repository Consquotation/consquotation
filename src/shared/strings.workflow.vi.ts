/** Chuỗi giao diện tiếng Việt cho quy trình báo giá và thông tin báo giá (prompts/07). */
export const WORKFLOW_STRINGS = {
  info: {
    title: "Thông tin báo giá",
    intro:
      "Các mục trong khối thông tin phía trên bảng báo giá. Tất cả đều tùy chọn. Add-in đọc trực tiếp từ sheet mỗi lần mở — bạn vẫn có thể gõ thẳng trên sheet.",
    table: "Bảng báo giá",
    dateHint: "dd/mm/yyyy — ghi thành ngày của Excel",
    notFound: "Không tìm thấy nhãn này phía trên bảng (có thể đã bị xóa hoặc sửa).",
    save: "Lưu thông tin",
    reload: "Tải lại từ sheet",
    saved: (n: number) => `Đã ghi ${n} mục thông tin.`,
    noChange: "Không có thay đổi để ghi.",
    changed:
      "Thông tin trên sheet vừa thay đổi kể từ lúc tải. Add-in chưa ghi gì: các mục bạn đã sửa được giữ, các mục khác đã lấy giá trị mới trên sheet. Kiểm tra lại rồi bấm Lưu.",
    protected:
      "Sheet đang được bảo vệ — không ghi được thông tin. Bỏ bảo vệ (Review › Unprotect Sheet) rồi bấm Tải lại từ sheet.",
    expired: (date: string) => `Báo giá đã hết hiệu lực từ ${date}.`,
    errors: "Hãy sửa các lỗi được đánh dấu.",
    noTables: "Chưa có bảng báo giá. Hãy tạo bảng báo giá trước.",
  },

  flow: {
    title: "Quy trình báo giá",
    intro:
      "Tình trạng từng bước, đọc trực tiếp từ workbook mỗi lần kiểm tra (không dùng kết quả cũ).",
    table: "Bảng báo giá",
    refresh: "Kiểm tra lại",
    checkedAt: (time: string) =>
      `Kiểm tra lúc ${time}. Nếu bạn sửa sheet sau đó, hãy bấm Kiểm tra lại.`,
    states: { done: "Xong", todo: "Chưa làm", attention: "Cần xem", optional: "Tùy chọn" },
    steps: {
      template: "1–3. Mẫu báo giá và vị trí ghi",
      info: "4. Thông tin báo giá",
      items: "5. Công tác",
      prices: "6. Khối lượng và đơn giá",
      check: "7–8. Tính toán và kiểm tra",
      summary: "Tổng hợp (chiết khấu, phụ phí, thuế)",
      finish: "9. Lưu, in, xuất PDF",
    },
    details: {
      noTable: "Chưa có bảng báo giá trong workbook.",
      table: (name: string, sheet: string) =>
        `Đang dùng ${name} (sheet "${sheet}"). Add-in kiểm tra và hỏi trước khi ghi vào vùng có dữ liệu.`,
      headersChanged: "Bảng đã bị đổi tên cột mẫu — add-in không ghi vào bảng này.",
      info: (filled: number, total: number) => `Đã điền ${filled}/${total} mục (không bắt buộc).`,
      infoMissingLabels: (n: number) => `${n} nhãn không còn trên sheet.`,
      items: (n: number) => (n === 0 ? "Chưa có dòng công tác nào." : `${n} dòng công tác.`),
      prices: (missingQty: number, missingPrice: number) =>
        missingQty + missingPrice === 0
          ? "Mọi dòng đã có khối lượng và đơn giá."
          : `${missingQty} dòng thiếu khối lượng, ${missingPrice} dòng thiếu đơn giá.`,
      check: (errors: number, warnings: number) =>
        errors + warnings === 0
          ? "Không phát hiện vấn đề."
          : `${errors} lỗi, ${warnings} cảnh báo.`,
      summaryNone: "Không có (không bắt buộc).",
      summaryTotal: (total: string) => `Tổng cộng sau điều chỉnh: ${total}.`,
      summaryError: (error: string) => `Tổng cộng đang lỗi ${error}.`,
      finish:
        "Ghi chú/điều khoản và thiết lập trang in ở tab In ấn. Lưu bằng Excel (Ctrl+S); in hoặc xuất PDF bằng File › Print / File › Export. ConsQuotation không tự gửi báo giá cho ai.",
    },
    actions: {
      create: "Tạo bảng báo giá",
      info: "Nhập thông tin",
      items: "Thêm công tác",
      check: "Mở Kiểm tra báo giá",
      summary: "Thiết lập tổng hợp",
      print: "Mở In ấn",
      goTo: "Đi tới bảng",
    },
    noStatus:
      "Không có trạng thái nháp/đã kiểm tra/đã phát hành: workbook là nguồn sự thật, mỗi lần kiểm tra đều đọc lại dữ liệu hiện tại.",
  },
};
