/* global Office */

import { getDialogHost } from "./environment";

/**
 * Theo dõi thay đổi vùng chọn (gồm cả khi chuyển sheet) bằng Common API,
 * hỗ trợ rộng hơn sự kiện của ExcelApi. Trả về hàm hủy đăng ký.
 */
export function subscribeSelectionChanged(handler: () => void): () => void {
  // Trong hộp thoại (ADR-0016): task pane theo dõi vùng chọn và báo sang.
  const dialogHost = getDialogHost();
  if (dialogHost) {
    return dialogHost.subscribeSelection(handler);
  }
  const listener = () => handler();
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, listener);
  return () => {
    Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, {
      handler: listener,
    });
  };
}
