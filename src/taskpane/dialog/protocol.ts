/**
 * Giao thức tin nhắn giữa hộp thoại ConsQuotation và task pane làm cầu nối (ADR-0016).
 * Hộp thoại Office không gọi được Excel.run, nên mọi thao tác workbook đi qua task pane:
 * hộp thoại gửi lời gọi gateway, task pane gọi gateway thật rồi trả kết quả hoặc lỗi.
 */

import { TargetChangedError } from "../../application/workbookGateway";
import { RecordChangedError, RecordUnreadableError } from "../../application/quotationGateway";
import { ExcelErrorKind, ExcelOpError } from "../../domain/excel/errors";
import { HostInfo } from "../../office/environment";

export const GATEWAYS = ["workbook", "pricing", "quotation", "layout", "normExport"] as const;
export type GatewayName = (typeof GATEWAYS)[number];

export interface SerializedError {
  name: string;
  message: string;
  /** Mã lỗi Office.js (describeOfficeError dựa vào đây). */
  code?: string;
  /** ExcelOpError.kind. */
  kind?: string;
}

export type DialogToHost =
  | { t: "call"; id: number; gateway: GatewayName; method: string; args: unknown[] }
  | { t: "openUrl"; url: string };

export type HostToDialog =
  | { t: "result"; id: number; ok: true; value: unknown }
  | { t: "result"; id: number; ok: false; error: SerializedError }
  | { t: "selection" };

/**
 * Môi trường do task pane đo, chuyển cho hộp thoại qua localStorage (hai bên cùng nguồn, đã kiểm
 * chứng dùng chung) để URL hộp thoại (hiện trên thanh tiêu đề) ngắn gọn.
 */
export const HOST_SNAPSHOT_KEY = "consquotation.dialog.host";

export interface HostSnapshot {
  info: HostInfo;
  sets: Record<string, boolean>;
  partitionKey?: string;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const extra = error as Error & { code?: unknown; kind?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(typeof extra.code === "string" ? { code: extra.code } : {}),
      ...(typeof extra.kind === "string" ? { kind: extra.kind } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

/** Dựng lại lỗi phía hộp thoại, giữ đúng lớp mà giao diện kiểm bằng instanceof. */
export function deserializeError(e: SerializedError): Error {
  switch (e.name) {
    case "ExcelOpError":
      return new ExcelOpError(e.kind as ExcelErrorKind, e.message);
    case "TargetChangedError":
      return new TargetChangedError();
    case "RecordChangedError":
      return new RecordChangedError();
    case "RecordUnreadableError":
      return new RecordUnreadableError(e.message);
    default: {
      const error = new Error(e.message) as Error & { code?: string };
      error.name = e.name;
      if (e.code) {
        error.code = e.code;
      }
      return error;
    }
  }
}

export function encodeSnapshot(snapshot: HostSnapshot): string {
  return JSON.stringify(snapshot);
}

export function decodeSnapshot(raw: string | null): HostSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as HostSnapshot;
    return value && typeof value === "object" && value.info && value.sets ? value : null;
  } catch {
    return null;
  }
}
