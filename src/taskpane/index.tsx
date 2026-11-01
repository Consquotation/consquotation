import * as React from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./components/App";
import DialogLauncher from "./components/DialogLauncher";
import UnsupportedScreen, { UnsupportedReason } from "./components/UnsupportedScreen";
import { isDialogMode, startDialogClient, supportsAppDialog } from "./dialog/appDialog";
import { LayoutGateway } from "../application/layoutGateway";
import { NormExportGateway } from "../application/normExportGateway";
import { PricingGateway } from "../application/pricingGateway";
import { QuotationGateway } from "../application/quotationGateway";
import { WorkbookGateway } from "../application/workbookGateway";
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

/** Task pane ở chế độ cửa sổ nổi; chuyển về giao diện đầy đủ nếu người dùng chọn (không mở được cửa sổ). */
const PaneRoot: React.FC = () => {
  const [usePane, setUsePane] = React.useState(false);
  return usePane ? <App /> : <DialogLauncher onUsePane={() => setUsePane(true)} />;
};

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
    // Cửa sổ nổi (ADR-0016): giao diện đầy đủ; mọi thao tác workbook gọi qua task pane.
    if (isDialogMode(window.location.search)) {
      const client = startDialogClient();
      render(
        <App
          inDialog
          gateway={client.gateway<WorkbookGateway>("workbook")}
          pricing={client.gateway<PricingGateway>("pricing")}
          layout={client.gateway<LayoutGateway>("layout")}
          quotationGateway={client.gateway<QuotationGateway>("quotation")}
          normExporter={client.gateway<NormExportGateway>("normExport")}
        />
      );
      return;
    }
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
    if (reason) {
      render(<UnsupportedScreen reason={reason} />);
      return;
    }
    // Excel không mở được cửa sổ nổi hai chiều (DialogApi 1.2), hoặc chưa kiểm chứng: giao diện trong task pane.
    render(supportsAppDialog() ? <PaneRoot /> : <App />);
  });
}
