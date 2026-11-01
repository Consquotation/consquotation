/**
 * Phía task pane của cầu nối (ADR-0016): nhận lời gọi từ hộp thoại, gọi gateway thật, trả kết quả.
 */

import { DialogToHost, GATEWAYS, GatewayName, HostToDialog, serializeError } from "./protocol";

export type GatewayMap = Record<GatewayName, object>;

export interface HostHandlers {
  gateways: GatewayMap;
  reply: (message: string) => void;
  openUrl: (url: string) => void;
}

/** Chỉ cho gọi phương thức của chính gateway (không gọi constructor hay thuộc tính khác). */
function resolveMethod(gateway: object, method: string): ((...args: unknown[]) => unknown) | null {
  if (method === "constructor" || method.startsWith("_")) {
    return null;
  }
  const fn = (gateway as Record<string, unknown>)[method];
  return typeof fn === "function" ? (fn as (...args: unknown[]) => unknown) : null;
}

export async function handleDialogMessage(raw: string, handlers: HostHandlers): Promise<void> {
  let message: DialogToHost;
  try {
    message = JSON.parse(raw) as DialogToHost;
  } catch {
    return;
  }
  if (message.t === "openUrl") {
    if (typeof message.url === "string" && message.url.startsWith("https:")) {
      handlers.openUrl(message.url);
    }
    return;
  }
  if (message.t !== "call") {
    return;
  }
  const send = (reply: HostToDialog) => handlers.reply(JSON.stringify(reply));
  const gateway = GATEWAYS.includes(message.gateway) ? handlers.gateways[message.gateway] : null;
  const fn = gateway ? resolveMethod(gateway, message.method) : null;
  if (!gateway || !fn) {
    send({
      t: "result",
      id: message.id,
      ok: false,
      error: { name: "Error", message: `Không có thao tác ${message.gateway}.${message.method}.` },
    });
    return;
  }
  try {
    const value = await fn.apply(gateway, Array.isArray(message.args) ? message.args : []);
    send({ t: "result", id: message.id, ok: true, value });
  } catch (error) {
    send({ t: "result", id: message.id, ok: false, error: serializeError(error) });
  }
}

/** Thông báo vùng chọn thay đổi cho hộp thoại (hộp thoại không nghe được sự kiện của Office). */
export function selectionMessage(): string {
  return JSON.stringify({ t: "selection" } satisfies HostToDialog);
}
