/* global Office */

/**
 * Theo dõi thay đổi vùng chọn (gồm cả khi chuyển sheet) bằng Common API,
 * hỗ trợ rộng hơn sự kiện của ExcelApi. Trả về hàm hủy đăng ký.
 */
export function subscribeSelectionChanged(handler: () => void): () => void {
  const listener = () => handler();
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, listener);
  return () => {
    Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, {
      handler: listener,
    });
  };
}
