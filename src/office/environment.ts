/* global Office */

import { IsSetSupported } from "./capabilities";

export interface HostInfo {
  host: string;
  platform: string;
  version: string;
}

/** Đọc thông tin Excel đang chạy add-in. Chỉ gọi sau Office.onReady. */
export function readHostInfo(): HostInfo {
  const diagnostics = Office.context.diagnostics;
  return {
    host: String(diagnostics?.host ?? "không rõ"),
    platform: String(diagnostics?.platform ?? "không rõ"),
    version: diagnostics?.version ?? "không rõ",
  };
}

export const officeIsSetSupported: IsSetSupported = (name, version) =>
  Office.context.requirements.isSetSupported(name, version);

/** Khóa phân vùng lưu trữ do Office cấp; undefined ở môi trường không phân vùng (Excel trên Windows). */
export function readPartitionKey(): string | undefined {
  return Office.context.partitionKey || undefined;
}
