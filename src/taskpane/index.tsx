import * as React from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./components/App";
import UnsupportedScreen, { UnsupportedReason } from "./components/UnsupportedScreen";
import { checkRuntimeSupport } from "../office/capabilities";
import { officeIsSetSupported } from "../office/environment";

/* global document, Office, performance, window */

declare const __CQ_BUILD_MODE__: string;

declare global {
  interface Window {
    /** Đặt bởi compat-gate.js khi phát hiện IE11/EdgeHTML (ADR-0001). */
    __CQ_UNSUPPORTED_WEBVIEW__?: boolean;
    /**
     * Chỉ bản phát triển: lớp src/office/core/ để kịch bản kiểm thử tích hợp
     * (tests/integration/excel-core.scenarios.js) gọi trực tiếp qua DevTools.
     */
    __CQ_DEV_EXCEL_CORE__?: typeof import("../office/core");
    /** Chỉ bản phát triển: lớp thật của quy trình báo giá cho tests/integration/quotation.scenarios.js. */
    __CQ_DEV_QUOTATION__?: typeof import("./devQuotationHarness");
  }
}

function render(node: React.ReactNode): void {
  const container = document.getElementById("container");
  if (!container) {
    return;
  }
  createRoot(container).render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>);
}

function resolveUnsupportedReason(host: Office.HostType | null): UnsupportedReason | null {
  if (host !== Office.HostType.Excel) {
    return { kind: "wrongHost" };
  }
  const support = checkRuntimeSupport(officeIsSetSupported);
  return support.supported ? null : { kind: "missingRequirement", requirement: support.missing };
}

// compat-gate.js đã hiện thông báo cho webview cũ; không render đè lên.
if (!window.__CQ_UNSUPPORTED_WEBVIEW__) {
  Office.onReady((info) => {
    // Mốc đo hiệu năng (prompts/17): xem bằng performance.getEntriesByType("mark") trong DevTools.
    performance.mark("cq-office-ready");
    const reason = resolveUnsupportedReason(info.host);
    // webpack thay __CQ_BUILD_MODE__ lúc build: bản production không có nhánh này.
    if (
      !reason &&
      typeof __CQ_BUILD_MODE__ !== "undefined" &&
      __CQ_BUILD_MODE__ === "development"
    ) {
      void import("../office/core").then((core) => {
        window.__CQ_DEV_EXCEL_CORE__ = core;
      });
      void import("./devQuotationHarness").then((harness) => {
        window.__CQ_DEV_QUOTATION__ = harness;
      });
    }
    render(reason ? <UnsupportedScreen reason={reason} /> : <App />);
  });
}
