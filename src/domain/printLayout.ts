/**
 * Thiết lập trang in cho báo giá (prompts/11). Ưu tiên tính năng in/xuất PDF có sẵn của Excel;
 * add-in chỉ đặt các thiết lập mà Office.js hỗ trợ (PageLayout, ExcelApi 1.9) và đã kiểm thử.
 * Không có API xem trước bản in hay xuất PDF: người dùng dùng File › Print / Export của Excel.
 */

export type Orientation = "portrait" | "landscape";
export type Paper = "a4" | "a3" | "letter";
/** width: vừa 1 trang theo chiều ngang (nhiều trang dọc); page: cả báo giá trong 1 trang; none: 100%. */
export type Fit = "width" | "page" | "none";

export interface PrintOptions {
  orientation: Orientation;
  paper: Paper;
  fit: Fit;
  /** Lặp dòng tiêu đề bảng trên mỗi trang. */
  repeatHeader: boolean;
  /** Chân trang "Trang x / y". */
  pageNumbers: boolean;
  centerHorizontally: boolean;
  /** Xuống dòng cho cột Nội dung công việc và Ghi chú (tránh bị cắt chữ khi in). */
  wrapLongText: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  orientation: "portrait",
  paper: "a4",
  fit: "width",
  repeatHeader: true,
  pageNumbers: true,
  centerHorizontally: true,
  wrapLongText: true,
};

export const PAGE_NUMBER_FOOTER = "Trang &P / &N";

export interface Rect {
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
}

/** Hình chữ nhật nhỏ nhất bao các khối (mẫu, bảng, tổng hợp, ghi chú). */
export function boundingRect(rects: readonly Rect[]): Rect {
  const top = Math.min(...rects.map((r) => r.rowIndex));
  const left = Math.min(...rects.map((r) => r.columnIndex));
  const bottom = Math.max(...rects.map((r) => r.rowIndex + r.rowCount));
  const right = Math.max(...rects.map((r) => r.columnIndex + r.columnCount));
  return { rowIndex: top, columnIndex: left, rowCount: bottom - top, columnCount: right - left };
}

/**
 * Dòng đầu của báo giá: dòng tiêu đề "BẢNG BÁO GIÁ" nếu còn ở phía trên, nếu không thì
 * dòng nhãn thông tin đầu tiên tìm thấy, nếu không nữa thì dòng tiêu đề bảng.
 */
export function quoteTopRow(
  headerRow: number,
  titleRow: number | null,
  firstInfoRow: number | null
): number {
  if (titleRow !== null && titleRow < headerRow) {
    return titleRow;
  }
  if (firstInfoRow !== null && firstInfoRow < headerRow) {
    return firstInfoRow;
  }
  return headerRow;
}

export function zoomFor(fit: Fit): {
  scale?: number;
  horizontalFitToPages?: number;
  verticalFitToPages?: number;
} {
  switch (fit) {
    case "width":
      // verticalFitToPages = 0: tự động (đã kiểm chứng: Excel đọc lại là FitToPagesTall = False).
      return { horizontalFitToPages: 1, verticalFitToPages: 0 };
    case "page":
      return { horizontalFitToPages: 1, verticalFitToPages: 1 };
    case "none":
      return { scale: 100 };
  }
}
