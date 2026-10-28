/* global Office */

/*
 * FunctionFile của các lệnh Ribbon (manifest: Commands.Url).
 * Hiện mọi nút Ribbon đều là ShowTaskpane vào cùng task pane (TaskpaneId CQ.MainTaskpane), mở thẳng
 * màn hình/phần tương ứng qua query string (navigation.ts), không cần hàm JavaScript.
 * Chỉ đăng ký thêm lệnh tại đây khi đã có implementation (prompts/05_RIBBON_TASKPANE_UX.md).
 */
Office.onReady(() => {
  // Chưa có lệnh dạng hàm.
});
