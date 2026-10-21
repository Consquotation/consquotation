import { Fit, Orientation, Paper } from "../domain/printLayout";

/** Chuỗi giao diện tiếng Việt cho mẫu in, ghi chú/điều khoản (prompts/11). */
export const PRINT_STRINGS = {
  tab: "In ấn",
  table: "Bảng báo giá",
  noTables: "Chưa có bảng báo giá trong workbook.",

  terms: {
    title: "Ghi chú và điều khoản",
    intro:
      "Chọn mục cần có và tự nhập nội dung — add-in không soạn sẵn điều khoản nào. Khu vực được ghi ngay dưới bảng báo giá (hoặc dưới bảng tổng hợp), nhãn ở cột đầu, nội dung ở cột Nội dung công việc, tự xuống dòng. Mục để trống không được ghi.",
    existing: (address: string) =>
      `Đang có khu vực ghi chú tại ${address} (nội dung bên dưới đọc từ sheet).`,
    none: "Bảng này chưa có khu vực ghi chú/điều khoản.",
    apply: "Ghi khu vực ghi chú",
    remove: "Xóa khu vực ghi chú",
    confirmTitle: "Ghi khu vực ghi chú và điều khoản?",
    confirmBody: (address: string, n: number) =>
      `Ghi ${n} mục tại ${address}. Vùng này đã được kiểm tra là trống (hoặc là khu vực cũ của add-in).`,
    removeTitle: "Xóa khu vực ghi chú và điều khoản?",
    removeBody:
      "Xóa nội dung khu vực ghi chú/điều khoản của bảng này. Không hoàn tác được bằng Ctrl+Z.",
    written: "Đã ghi khu vực ghi chú và điều khoản.",
    removed: "Đã xóa khu vực ghi chú và điều khoản.",
    nothing: "Chưa có mục nào có nội dung.",
    changedOnSheet:
      "Khu vực ghi chú trên sheet vừa được sửa sau khi panel tải. Add-in chưa ghi gì và đã tải lại nội dung mới nhất — hãy xem lại rồi bấm Ghi.",
    blocked: {
      tableMissing: "Không tìm thấy bảng báo giá.",
      protected: "Sheet đang được bảo vệ.",
      occupied: (sample: string) =>
        `Vùng cần cho khu vực ghi chú đang có dữ liệu (${sample}). Add-in không ghi đè — hãy di chuyển dữ liệu đó rồi thử lại.`,
    },
  },

  print: {
    title: "Thiết lập trang in",
    intro:
      "Add-in chỉ đặt các thiết lập mà Excel cho phép qua add-in. Xem trước, in và xuất PDF dùng chức năng có sẵn của Excel.",
    unsupported:
      "Excel này chưa cho add-in đặt trang in (cần ExcelApi 1.9). Hãy làm trong Excel theo hướng dẫn bên dưới.",
    area: (area: string, sheet: string) => `Vùng báo giá sẽ in: ${area} trên sheet "${sheet}".`,
    current: "Thiết lập hiện có trên sheet",
    none: "chưa đặt",
    currentArea: "Vùng in",
    currentTitles: "Dòng lặp lại mỗi trang",
    currentOrientation: "Hướng giấy",
    currentPaper: "Khổ giấy",
    currentFit: "Co giãn",
    currentFooter: "Chân trang",
    fitText: (wide: number | null, tall: number | null, scale: number | null) =>
      scale
        ? `${scale}%`
        : wide
          ? `Vừa ${wide} trang ngang${tall ? `, ${tall} trang dọc` : ""}`
          : "—",
    orientation: "Hướng giấy",
    orientations: { portrait: "Dọc", landscape: "Ngang" } as Record<Orientation, string>,
    /** Giá trị Excel trả về (tiếng Anh) → tiếng Việt. */
    orientationValues: { Portrait: "Dọc", Landscape: "Ngang" } as Record<string, string>,
    paper: "Khổ giấy",
    papers: { a4: "A4", a3: "A3", letter: "Letter" } as Record<Paper, string>,
    fit: "Co giãn",
    fits: {
      width: "Vừa chiều ngang 1 trang (khuyên dùng cho bảng dài)",
      page: "Thu cả báo giá vào 1 trang",
      none: "Không co giãn (100%)",
    } as Record<Fit, string>,
    repeatHeader: "Lặp dòng tiêu đề bảng trên mỗi trang",
    pageNumbers: 'Đánh số trang ở chân trang ("Trang x / y")',
    center: "Căn giữa theo chiều ngang",
    wrap: "Xuống dòng cho cột Nội dung công việc và Ghi chú (tránh bị cắt chữ khi in)",
    apply: "Áp dụng thiết lập in",
    confirmTitle: "Áp dụng thiết lập trang in?",
    confirmBody: (area: string, old: string | null) =>
      `Đặt vùng in ${area}${old && old !== area ? ` (thay vùng in hiện có ${old})` : ""} cùng các thiết lập đã chọn cho sheet này.`,
    applied: (area: string) =>
      `Đã đặt thiết lập in, vùng in ${area}. Xem trước bằng File › Print (Ctrl+P).`,
    guideTitle: "Xem trước, in và xuất PDF trong Excel",
    guide: [
      "Xem trước và in: File › Print (Ctrl+P). Kiểm tra ngắt trang ở khung xem trước bên phải.",
      "Xuất PDF: File › Export › Create PDF/XPS, hoặc File › Save As và chọn loại PDF.",
      "Chỉnh ngắt trang: View › Page Break Preview, kéo đường ngắt màu xanh.",
      "Khi co giãn để vừa trang, Excel có thể ngắt chữ khác màn hình làm dòng cuối của ô bị cắt: kiểm tra bản xem trước và kéo cao dòng đó nếu cần.",
      "Tự đặt vùng in: chọn vùng › Page Layout › Print Area › Set Print Area.",
      "Lặp tiêu đề: Page Layout › Print Titles › Rows to repeat at top.",
      "Hướng, khổ giấy, co giãn: Page Layout › Orientation / Size / Scale to Fit.",
    ],
  },

  failed: "Thao tác thất bại",
  cancel: "Hủy",
  confirm: "Đồng ý",
};
