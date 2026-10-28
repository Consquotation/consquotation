/** Chuỗi giao diện cấp phép (ADR-0015). */

export const LICENSE_UI = {
  title: "Cấp phép",
  trial: (daysLeft: number, endsOn: string) =>
    `Đang dùng thử đủ tính năng: còn ${daysLeft} ngày (đến ${endsOn}).`,
  expired: (endedOn: string) =>
    `Đã hết 30 ngày dùng thử (từ ${endedOn}). Gửi yêu cầu cấp phép, hoặc nhập email và mã đã nhận để tiếp tục dùng.`,
  licensed: (email: string) => `Đã cấp phép vĩnh viễn cho ${email}.`,
  licensedCode: (code: string) => `Mã cấp phép: ${code}`,
  headerTrial: (daysLeft: number) => `Dùng thử: còn ${daysLeft} ngày`,
  headerLicensed: "Đã cấp phép",
  requestTitle: "Xin cấp phép",
  requestIntro: (owner: string) =>
    `Chọn nơi soạn thư: thư soạn sẵn gửi tới ${owner}, bạn chỉ cần bấm Gửi từ hộp thư của mình. Mã cấp phép sẽ được gửi lại cho đúng địa chỉ email gửi thư.`,
  composeGmail: "Soạn bằng Gmail",
  composeOutlook: "Soạn bằng Outlook.com",
  composeApp: "Mở ứng dụng thư",
  requestOpened:
    "Đã mở trang soạn thư. Nếu không thấy, bấm Sao chép nội dung rồi dán vào hộp thư bạn đang dùng, gửi tới địa chỉ ở trên.",
  requestText: "Nội dung yêu cầu",
  copy: "Sao chép nội dung",
  copied: "Đã sao chép.",
  copyFailed: "Không sao chép được; hãy chọn nội dung trong ô và sao chép thủ công.",
  activateTitle: "Kích hoạt",
  activateIntro:
    "Nhập đúng email đã gửi yêu cầu và mã 20 ký tự trong thư trả lời. Trên máy khác, nhập lại cùng email và mã một lần.",
  email: "Email",
  code: "Mã cấp phép (20 ký tự)",
  activate: "Kích hoạt",
  activating: "Đang kiểm tra…",
  activated: "Đã kích hoạt. Cảm ơn bạn!",
  errors: {
    invalidEmail: "Email không hợp lệ.",
    invalidCode:
      "Mã phải gồm đúng 20 ký tự chữ và số (không có 0, O, 1, I, L). Kiểm tra lại mã trong thư.",
    notFound:
      "Email và mã không khớp với danh sách cấp phép. Kiểm tra lại email (đúng địa chỉ đã gửi yêu cầu) và mã. Nếu vừa được cấp, chờ vài phút rồi thử lại.",
    unavailable:
      "Không tải được danh sách cấp phép (cần kết nối Internet). Kiểm tra mạng rồi thử lại.",
  },
  backupTitle: "Sao lưu thư viện",
  backupIntro:
    "Báo giá nằm trong file Excel nên vẫn mở, sửa, in bằng Excel bình thường. Thư viện của bạn vẫn sao lưu được ra file .json.",
  backupButton: "Tải bản sao lưu (.json)",
} as const;
