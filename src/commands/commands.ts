/* global Office */

/*
 * FunctionFile của các lệnh Ribbon (manifest: Commands.Url).
 * Hiện cả 4 nút Ribbon (Mở ConsQuotation, Tạo bảng báo giá, Thư viện của tôi, Trợ giúp) đều là
 * ShowTaskpane vào cùng task pane (TaskpaneId CQ.MainTaskpane), không cần hàm JavaScript.
 * Chỉ đăng ký thêm lệnh tại đây khi đã có implementation (prompts/05_RIBBON_TASKPANE_UX.md).
 */
Office.onReady(() => {
  // Chưa có lệnh dạng hàm.
});
