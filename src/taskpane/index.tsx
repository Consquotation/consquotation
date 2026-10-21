import * as React from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./components/App";
import UnsupportedScreen, { UnsupportedReason } from "./components/UnsupportedScreen";
import { checkRuntimeSupport } from "../office/capabilities";
import { officeIsSetSupported } from "../office/environment";

/* global document, Office, performance, window */

declare global {
  interface Window {
    /** Đặt bởi compat-gate.js khi phát hiện IE11/EdgeHTML (ADR-0001). */
    __CQ_UNSUPPORTED_WEBVIEW__?: boolean;
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
    render(reason ? <UnsupportedScreen reason={reason} /> : <App />);
  });
}
