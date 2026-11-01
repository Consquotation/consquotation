/**
 * Phía hộp thoại của cầu nối (ADR-0016): gateway đại diện chuyển mọi lời gọi lên task pane.
 */

import { DialogToHost, GatewayName, HostToDialog, deserializeError } from "./protocol";

/* global clearTimeout, setTimeout */

export interface Transport {
  send(message: string): void;
  onMessage(handler: (message: string) => void): void;
}

/** Thao tác Excel dài nhất (ghi bảng lớn) vẫn xong trong vài chục giây; quá mức này coi như mất cầu nối. */
const CALL_TIMEOUT_MS = 120_000;

export const LOST_BRIDGE_MESSAGE =
  "Mất kết nối với thanh ConsQuotation bên phải Excel. Thanh đó phải mở trong lúc dùng cửa sổ này; hãy mở lại ConsQuotation từ ribbon.";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RemoteClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly selectionHandlers = new Set<() => void>();

  constructor(
    private readonly transport: Transport,
    private readonly timeoutMs = CALL_TIMEOUT_MS
  ) {
    transport.onMessage((message) => this.receive(message));
  }

  /** Đối tượng có cùng các phương thức với gateway thật; mỗi phương thức trả Promise. */
  gateway<T extends object>(name: GatewayName): T {
    return new Proxy(
      {},
      {
        get: (_target, prop) =>
          // "then": để đối tượng không bị coi là Promise khi được await hay trả về từ hàm async.
          typeof prop === "string" && prop !== "then"
            ? (...args: unknown[]) => this.call(name, prop, args)
            : undefined,
      }
    ) as T;
  }

  call(gateway: GatewayName, method: string, args: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(LOST_BRIDGE_MESSAGE));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.post({ t: "call", id, gateway, method, args });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  openUrl(url: string): void {
    this.post({ t: "openUrl", url });
  }

  onSelection(handler: () => void): () => void {
    this.selectionHandlers.add(handler);
    return () => this.selectionHandlers.delete(handler);
  }

  private post(message: DialogToHost): void {
    this.transport.send(JSON.stringify(message));
  }

  private receive(raw: string): void {
    let message: HostToDialog;
    try {
      message = JSON.parse(raw) as HostToDialog;
    } catch {
      return;
    }
    if (message.t === "selection") {
      this.selectionHandlers.forEach((handler) => handler());
      return;
    }
    if (message.t !== "result") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.value);
    } else {
      pending.reject(deserializeError(message.error));
    }
  }
}
