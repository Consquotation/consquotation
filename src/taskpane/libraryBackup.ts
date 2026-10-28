/**
 * Tải bản sao lưu thư viện (.json). Dùng ở Thư viện › Nhập/Xuất và ở màn hình cấp phép khi hết hạn
 * dùng thử (ADR-0015: không giữ dữ liệu của người dùng làm con tin).
 */

import { LibraryService } from "../application/libraryService";
import { backupFileName, toBackupJson } from "../domain/library/exchange/backup";
import { APP_VERSION } from "../shared/buildInfo";

/* global Blob, URL, document, setTimeout */

/** Tải file qua thẻ <a download> (đã kiểm chứng trên Excel Windows/WebView2: lưu vào Downloads). */
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Thu hồi sau khi trình duyệt đã bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Đọc lại thư viện từ bộ nhớ, tải file .json và ghi mốc sao lưu; trả về tên file. */
export async function downloadLibraryBackup(service: LibraryService): Promise<string> {
  const current = await service.load();
  const now = new Date();
  const fileName = backupFileName(now, "json");
  downloadText(
    fileName,
    toBackupJson(current, {
      exportedAt: now.toISOString(),
      appVersion: APP_VERSION,
      libraryName: await service.libraryName(),
    }),
    "application/json"
  );
  await service.recordBackup(now);
  return fileName;
}
