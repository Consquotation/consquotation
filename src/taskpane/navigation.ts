/* global URLSearchParams */

/**
 * Màn hình của task pane (prompts/05_RIBBON_TASKPANE_UX.md).
 * Chỉ có các màn hình đã có implementation.
 */
export type View =
  "overview" | "quote" | "items" | "pricing" | "print" | "library" | "settings" | "help";

/** Các tab hiển thị trên TabList; "help" mở từ Ribbon hoặc nút Trợ giúp, không phải tab. */
export const TAB_VIEWS: readonly View[] = [
  "overview",
  "quote",
  "items",
  "pricing",
  "print",
  "library",
  "settings",
];

const ALL_VIEWS: readonly View[] = [...TAB_VIEWS, "help"];

/**
 * Đọc màn hình ban đầu từ query string do nút Ribbon truyền vào
 * (ví dụ taskpane.html?view=quote). Giá trị lạ hoặc thiếu → Tổng quan.
 */
export function parseInitialView(search: string): View {
  const value = new URLSearchParams(search).get("view");
  return ALL_VIEWS.find((view) => view === value) ?? "overview";
}

/** Các phần của Thư viện (tab con trong LibraryView). */
export type LibrarySection = "workItems" | "resources" | "norms" | "catalog" | "check" | "exchange";

const LIBRARY_SECTIONS: readonly LibrarySection[] = [
  "workItems",
  "resources",
  "norms",
  "catalog",
  "check",
  "exchange",
];

/**
 * Tiêu đề phần cần cuộn tới khi mở từ Ribbon (ví dụ ?view=quote&focus=cq-info-title).
 * Chỉ nhận id dạng cq-…-title; thiếu hoặc lạ → null (dùng mặc định của màn hình).
 */
export function parseInitialFocus(search: string): string | null {
  const value = new URLSearchParams(search).get("focus");
  return value && /^cq-[a-z]+(-[a-z]+)*-title$/.test(value) ? value : null;
}

/** Phần thư viện mở sẵn (?view=library&section=norms); thiếu hoặc lạ → null. */
export function parseLibrarySection(search: string): LibrarySection | null {
  const value = new URLSearchParams(search).get("section");
  return LIBRARY_SECTIONS.find((section) => section === value) ?? null;
}
