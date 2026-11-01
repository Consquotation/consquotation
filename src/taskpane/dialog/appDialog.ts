/**
 * Mở giao diện ConsQuotation trong hộp thoại nổi của Office, task pane làm cầu nối (ADR-0016).
 */

import { FEATURE_REQUIREMENTS, RUNTIME_BASELINE } from "../../office/capabilities";
import { ExcelLayoutGateway } from "../../office/excelLayoutGateway";
import { ExcelNormExportGateway } from "../../office/excelNormExportGateway";
import { ExcelPricingGateway } from "../../office/excelPricingGateway";
import { ExcelQuotationGateway } from "../../office/excelQuotationGateway";
import { ExcelWorkbookGateway } from "../../office/excelWorkbookGateway";
import {
  officeIsSetSupported,
  readHostInfo,
  readPartitionKey,
  setDialogHost,
} from "../../office/environment";
import { subscribeSelectionChanged } from "../../office/selectionEvents";
import { GatewayMap, handleDialogMessage, selectionMessage } from "./hostBridge";
import { HOST_SNAPSHOT_KEY, HostSnapshot, decodeSnapshot, encodeSnapshot } from "./protocol";
import { RemoteClient } from "./remoteClient";

/* global localStorage, Office, URLSearchParams, window */

/** Tham số task pane chuyển tiếp cho hộp thoại: màn hình, phần cần tới, phần thư viện. */
const FORWARDED_PARAMS = ["view", "focus", "section"] as const;

export function isDialogMode(search: string): boolean {
  return new URLSearchParams(search).get("dialog") === "1";
}

/**
 * Chỉ dùng hộp thoại trên Excel cho Windows có DialogApi 1.2 (nhắn hai chiều). Excel trên web và
 * Mac chưa kiểm chứng việc hộp thoại dùng chung thư viện (IndexedDB) với task pane, nên giữ task pane.
 */
export function supportsAppDialog(): boolean {
  return (
    readHostInfo().platform === "PC" &&
    Office.context.requirements.isSetSupported("DialogApi", "1.2")
  );
}

function hostSnapshot(): HostSnapshot {
  const sets: Record<string, boolean> = {};
  for (const set of [RUNTIME_BASELINE, ...Object.values(FEATURE_REQUIREMENTS)]) {
    sets[`${set.name}@${set.version}`] = officeIsSetSupported(set.name, set.version);
  }
  return { info: readHostInfo(), sets, partitionKey: readPartitionKey() };
}

export function dialogUrl(paneSearch: string, origin: string): string {
  const pane = new URLSearchParams(paneSearch);
  const params = new URLSearchParams({ dialog: "1" });
  for (const key of FORWARDED_PARAMS) {
    const value = pane.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  return `${origin}/taskpane.html?${params.toString()}`;
}

export interface OpenedDialog {
  close(): void;
}

/**
 * Mở hộp thoại (rộng 50%, cao 85% màn hình; người dùng kéo được). `onClosed` chạy khi người dùng đóng
 * hộp thoại hoặc hộp thoại lỗi. Từ chối nếu Office không mở được (ví dụ đang có hộp thoại khác).
 */
export function openAppDialog(onClosed: () => void): Promise<OpenedDialog> {
  const gateways: GatewayMap = {
    workbook: new ExcelWorkbookGateway(),
    pricing: new ExcelPricingGateway(),
    quotation: new ExcelQuotationGateway(),
    layout: new ExcelLayoutGateway(),
    normExport: new ExcelNormExportGateway(),
  };
  try {
    localStorage.setItem(HOST_SNAPSHOT_KEY, encodeSnapshot(hostSnapshot()));
  } catch {
    // Không ghi được: hộp thoại dùng môi trường mặc định (Excel trên Windows).
  }
  const url = dialogUrl(window.location.search, window.location.origin);
  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(url, { width: 50, height: 85 }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(`${result.error.message} (${result.error.code})`));
        return;
      }
      const dialog = result.value;
      const unsubscribe = subscribeSelectionChanged(() => dialog.messageChild(selectionMessage()));
      const finish = () => {
        unsubscribe();
        onClosed();
      };
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        if ("message" in arg) {
          void handleDialogMessage(arg.message, {
            gateways,
            reply: (message) => dialog.messageChild(message),
            openUrl: (target) => Office.context.ui.openBrowserWindow(target),
          });
        }
      });
      // 12006: người dùng đóng hộp thoại; các mã khác: hộp thoại lỗi. Cả hai đều coi là đã đóng.
      dialog.addEventHandler(Office.EventType.DialogEventReceived, finish);
      resolve({
        close: () => {
          dialog.close();
          finish();
        },
      });
    });
  });
}

/** Khởi động phía hộp thoại: cầu nối tin nhắn và môi trường thay thế. Gọi sau Office.onReady. */
export function startDialogClient(): RemoteClient {
  const client = new RemoteClient({
    send: (message) => Office.context.ui.messageParent(message),
    onMessage: (handler) =>
      Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg) => {
        if ("message" in arg) {
          handler(arg.message);
        }
      }),
  });
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(HOST_SNAPSHOT_KEY);
  } catch {
    stored = null;
  }
  const snapshot = decodeSnapshot(stored) ?? {
    info: { host: "Excel", platform: "PC", version: "không rõ" },
    sets: {},
  };
  setDialogHost({
    ...snapshot,
    openBrowserWindow: (url) => client.openUrl(url),
    subscribeSelection: (handler) => client.onSelection(handler),
  });
  return client;
}
