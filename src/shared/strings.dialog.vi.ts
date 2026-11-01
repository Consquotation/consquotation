/** Chuỗi giao diện của chế độ cửa sổ nổi (ADR-0016). */
export const DIALOG_STRINGS = {
  opening: "Đang mở cửa sổ ConsQuotation…",
  open: "ConsQuotation đang mở trong cửa sổ riêng. Bạn kéo cửa sổ tới chỗ tiện và chỉnh kích thước tùy ý.",
  closed: "Cửa sổ ConsQuotation đã đóng.",
  failed: (detail: string) => `Không mở được cửa sổ ConsQuotation: ${detail}`,
  reopen: "Mở cửa sổ ConsQuotation",
  keepPane:
    "Giữ thanh này mở trong lúc dùng cửa sổ: cửa sổ đọc và ghi workbook thông qua thanh này. Bạn có thể kéo thanh hẹp lại. Đóng thanh thì cửa sổ cũng đóng.",
  ribbonNote:
    "Bấm một nút khác trên ribbon ConsQuotation sẽ mở lại cửa sổ ở phần tương ứng; nội dung đang nhập dở chưa lưu sẽ mất.",
  usePane: "Dùng giao diện ngay trong thanh này",
};
