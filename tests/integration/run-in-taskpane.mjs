// Chạy một kịch bản (thân hàm async) bên trong task pane đang mở qua DevTools Protocol của WebView2.
//
// Dùng:  node tests/integration/run-in-taskpane.mjs <kịch-bản.js> [cổng=9229]
// Điều kiện: đã chạy `npm start` (bản phát triển bật cổng gỡ lỗi 9229), task pane ConsQuotation
// đang mở và đã tải xong. Chỉ kết nối localhost; không gửi dữ liệu ra ngoài máy.
// Mã thoát: 0 khi mọi tình huống đạt, 1 khi có tình huống lỗi hoặc không chạy được.

/* global console, fetch, process, WebSocket */

import { readFileSync } from "node:fs";

const [, , scriptPath, portArg] = process.argv;
if (!scriptPath) {
  console.error("Dùng: node tests/integration/run-in-taskpane.mjs <kịch-bản.js> [cổng]");
  process.exit(1);
}
const port = Number(portArg ?? 9229);
const body = readFileSync(scriptPath, "utf8");

const pages = await fetch(`http://localhost:${port}/json`).then((r) => r.json());
const page = pages.find((p) => p.type === "page" && /taskpane\.html/.test(p.url));
if (!page) {
  console.error(
    `Không thấy task pane trên cổng ${port}. Mở ConsQuotation trong Excel (bản npm start) rồi chạy lại.`
  );
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const send = (method, params) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

ws.onopen = async () => {
  const response = await send("Runtime.evaluate", {
    expression: `(async () => {\n${body}\n})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  ws.close();
  const result = response.result;
  if (result?.exceptionDetails) {
    console.error(
      "Lỗi khi chạy kịch bản:",
      result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
    );
    process.exit(1);
  }
  const value = result?.result?.value;
  console.log(JSON.stringify(value, null, 2));
  const failed = !value || value.fatal || value.failed > 0 || value.cleanedUp === false;
  process.exit(failed ? 1 : 0);
};
ws.onerror = (error) => {
  console.error("Không kết nối được DevTools:", error.message ?? error);
  process.exit(1);
};
