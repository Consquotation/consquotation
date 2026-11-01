/* global Office */

import { IsSetSupported } from "./capabilities";

export interface HostInfo {
  host: string;
  platform: string;
  version: string;
}

/**
 * Môi trường thay thế khi giao diện chạy trong hộp thoại Office (ADR-0016). Hộp thoại không đọc được
 * Office.context (chỉ messageParent và isSetSupported), nên task pane chụp sẵn thông tin môi trường và
 * làm hộ các việc cần Office: mở trình duyệt, báo vùng chọn thay đổi.
 */
export interface DialogHost {
  info: HostInfo;
  /** "ExcelApi@1.8" → có hỗ trợ không, đo ở task pane. */
  sets: Record<string, boolean>;
  partitionKey?: string;
  openBrowserWindow: (url: string) => void;
  subscribeSelection: (handler: () => void) => () => void;
}

let dialogHost: DialogHost | null = null;

/** Gọi một lần khi khởi động trong hộp thoại, trước khi render. */
export function setDialogHost(host: DialogHost): void {
  dialogHost = host;
}

export function getDialogHost(): DialogHost | null {
  return dialogHost;
}

/** Đọc thông tin Excel đang chạy add-in. Chỉ gọi sau Office.onReady. */
export function readHostInfo(): HostInfo {
  if (dialogHost) {
    return dialogHost.info;
  }
  const diagnostics = Office.context.diagnostics;
  return {
    host: String(diagnostics?.host ?? "không rõ"),
    platform: String(diagnostics?.platform ?? "không rõ"),
    version: diagnostics?.version ?? "không rõ",
  };
}

export const officeIsSetSupported: IsSetSupported = (name, version) =>
  dialogHost
    ? (dialogHost.sets[`${name}@${version}`] ?? false)
    : Office.context.requirements.isSetSupported(name, version);

/** Khóa phân vùng lưu trữ do Office cấp; undefined ở môi trường không phân vùng (Excel trên Windows). */
export function readPartitionKey(): string | undefined {
  if (dialogHost) {
    return dialogHost.partitionKey;
  }
  return Office.context.partitionKey || undefined;
}

/** Mở trang https bằng trình duyệt mặc định; false nếu Office không hỗ trợ (dùng cách khác). */
export function openBrowserWindow(url: string): boolean {
  if (dialogHost) {
    dialogHost.openBrowserWindow(url);
    return true;
  }
  if (typeof Office !== "undefined" && Office.context?.ui?.openBrowserWindow) {
    Office.context.ui.openBrowserWindow(url);
    return true;
  }
  return false;
}
