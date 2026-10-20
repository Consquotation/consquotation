import * as React from "react";

/**
 * Trả về hàm `exclusive(task)`: chỉ chạy `task` khi không có tác vụ nào khác đang chạy.
 * Chặn bấm đúp/Enter lặp tạo bảng hoặc thêm dòng trùng ngoài ý muốn (prompts/06: chạy lặp
 * không tạo trùng). Dùng ref nên có hiệu lực ngay, không chờ React render lại nút bị vô hiệu hóa.
 */
export function useExclusive(): (task: () => Promise<void>) => Promise<void> {
  const busy = React.useRef(false);
  return React.useCallback(async (task: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  }, []);
}
