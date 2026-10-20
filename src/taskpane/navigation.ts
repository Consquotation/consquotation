/* global URLSearchParams */

/**
 * Màn hình của task pane (prompts/05_RIBBON_TASKPANE_UX.md).
 * Chỉ có các màn hình đã có implementation; "Thư viện của tôi" sẽ thêm khi có tính năng.
 */
export type View = "overview" | "quote" | "settings" | "help";

/** Các tab hiển thị trên TabList; "help" mở từ Ribbon hoặc nút Trợ giúp, không phải tab. */
export const TAB_VIEWS: readonly View[] = ["overview", "quote", "settings"];

const ALL_VIEWS: readonly View[] = [...TAB_VIEWS, "help"];

/**
 * Đọc màn hình ban đầu từ query string do nút Ribbon truyền vào
 * (ví dụ taskpane.html?view=quote). Giá trị lạ hoặc thiếu → Tổng quan.
 */
export function parseInitialView(search: string): View {
  const value = new URLSearchParams(search).get("view");
  return ALL_VIEWS.find((view) => view === value) ?? "overview";
}
