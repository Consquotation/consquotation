import * as React from "react";
import { subscribeSelectionChanged } from "../office/selectionEvents";

/* global clearTimeout, setTimeout */

const DEBOUNCE_MS = 300;

/**
 * Gọi `callback` (đã gom nhịp 300 ms) mỗi khi vùng chọn hoặc sheet trong Excel thay đổi.
 * Dùng để đọc lại workbook thay vì tin vào dữ liệu cũ (prompts/06: sheet/bảng có thể bị
 * đổi tên hoặc xóa trong lúc task pane mở; prompts/14: không giữ selection cũ).
 */
export function useSelectionChanged(callback: () => void): void {
  const latest = React.useRef(callback);
  latest.current = callback;

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeSelectionChanged(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => latest.current(), DEBOUNCE_MS);
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);
}
