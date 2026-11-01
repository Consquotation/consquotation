import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Tab,
  TabList,
  Title3,
  makeStaticStyles,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import AddWorkItemPanel, { LibraryPrefill } from "./AddWorkItemPanel";
import CreateQuotePanel from "./CreateQuotePanel";
import DiagnosticsPanel from "./DiagnosticsPanel";
import EnvironmentPanel from "./EnvironmentPanel";
import HelpView from "./HelpView";
import QuoteTablesPanel from "./QuoteTablesPanel";
import StorageProbePanel from "./StorageProbePanel";
import VersionPanel from "./VersionPanel";
import WorkbookContextPanel from "./WorkbookContextPanel";
import LibraryStoragePanel from "./library/LibraryStoragePanel";
import LibraryView from "./library/LibraryView";
import PricingView from "./pricing/PricingView";
import QuoteInfoPanel from "./QuoteInfoPanel";
import WorkflowPanel from "./WorkflowPanel";
import PrintView from "./print/PrintView";
import QuotationItemsView from "./quotation/QuotationItemsView";
import LicensePanel from "./license/LicensePanel";
import { LicenseService } from "../../application/licenseService";
import { browserLicenseStorage } from "../licenseStorage";
import { downloadLibraryBackup } from "../libraryBackup";
import { LICENSE_UI } from "../../shared/strings.license.vi";
import { EXCHANGE_STRINGS } from "../../shared/strings.exchange.vi";
import { QuotationService } from "../../application/quotationService";
import { ExcelQuotationGateway } from "../../office/excelQuotationGateway";
import { LayoutGateway } from "../../application/layoutGateway";
import { ExcelLayoutGateway } from "../../office/excelLayoutGateway";
import { ExcelNormExportGateway } from "../../office/excelNormExportGateway";
import { compositionLines } from "../../domain/pricing/composition";
import { ExcelPricingGateway } from "../../office/excelPricingGateway";
import { PricingGateway } from "../../application/pricingGateway";
import { LibraryService } from "../../application/libraryService";
import { WorkbookGateway } from "../../application/workbookGateway";
import { todayIso } from "../../domain/library/dates";
import { draftFromWorkItem } from "../../domain/library/toQuote";
import { nameLookup } from "../../domain/library/search";
import { LibrarySnapshot, WorkItem } from "../../domain/library/types";
import { readHostInfo, readPartitionKey } from "../../office/environment";
import { APP_VERSION, BUILD_MODE } from "../../shared/buildInfo";
import { ExcelWorkbookGateway } from "../../office/excelWorkbookGateway";
import {
  IndexedDbLibraryRepository,
  libraryDatabaseName,
} from "../../storage/indexedDbLibraryRepository";
import { STRINGS } from "../../shared/strings.vi";
import { randomId } from "../../shared/uuid";
import { View, parseInitialFocus, parseInitialView, parseLibrarySection } from "../navigation";

/* global clearTimeout, document, fetch, indexedDB, performance, setTimeout, window */

declare const __CQ_BUILD_MODE__: string;

/**
 * Khu vực Kiểm thử Excel: chỉ bản phát triển. webpack thay __CQ_BUILD_MODE__ lúc build nên ở bản
 * production nhánh này bị loại và module kiểm thử không được đóng gói.
 */
const ExcelLabSection =
  typeof __CQ_BUILD_MODE__ !== "undefined" && __CQ_BUILD_MODE__ === "development"
    ? React.lazy(() => import("./ExcelLabSection"))
    : null;

function createLibraryService(): LibraryService {
  const repo = new IndexedDbLibraryRepository(indexedDB, libraryDatabaseName(readPartitionKey()));
  return new LibraryService(repo, { now: () => new Date(), newId: randomId });
}

/**
 * Ô chọn của Fluent rộng theo lựa chọn dài nhất (tên sheet, tên bảng, mô tả kiểu làm tròn…). Trong
 * task pane hẹp (320px) điều đó làm cả trang tràn ngang. Cho trường và ô chọn co lại theo khung;
 * lựa chọn dài bị cắt bớt khi hiển thị nhưng vẫn đọc đủ trong danh sách thả xuống.
 * Ô nhập cũng vậy: bề rộng tự nhiên (~20 ký tự) lớn hơn cột lưới 2–3 cột nên đè sang ô bên cạnh.
 */
const useNarrowPaneStyles = makeStaticStyles({
  ".fui-Field": { minWidth: 0 },
  ".fui-Select": { minWidth: 0, maxWidth: "100%" },
  ".fui-Select__select": { minWidth: 0, textOverflow: "ellipsis" },
  ".fui-Input": { minWidth: 0, maxWidth: "100%" },
  ".fui-Input__input": { minWidth: 0 },
});

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    padding: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalL,
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalS,
  },
  titles: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  ready: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  readyDot: {
    width: "8px",
    height: "8px",
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteGreenForeground1,
  },
  panel: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXL },
  shortcuts: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  // Task pane hẹp (~320 px): tab xuống dòng thay vì bắt cuộn ngang.
  tabs: { flexWrap: "wrap" },
});

/** Tiêu đề nhận focus khi chuyển tới màn hình/phần tương ứng (bàn phím, trình đọc màn hình). */
const FOCUS_TARGET: Record<View, string> = {
  overview: "cq-context-title",
  quote: "cq-create-title",
  items: "cq-items-title",
  pricing: "cq-check-title",
  print: "cq-terms-title",
  library: "cq-library-title",
  settings: "cq-version-title",
  help: "cq-help-title",
};

interface Navigation {
  view: View;
  /** null: giữ focus tại chỗ (ví dụ đang dùng phím mũi tên trên TabList). */
  focusId: string | null;
}

const App: React.FC<{
  gateway?: WorkbookGateway;
  pricing?: PricingGateway;
  layout?: LayoutGateway;
  libraryService?: LibraryService;
}> = ({
  gateway: injected,
  pricing: injectedPricing,
  layout: injectedLayout,
  libraryService: injectedLibrary,
}) => {
  useNarrowPaneStyles();
  const styles = useStyles();
  const hostPlatform = React.useMemo(() => readHostInfo().platform, []);
  const gateway = React.useMemo(() => injected ?? new ExcelWorkbookGateway(), [injected]);
  const pricing = React.useMemo(
    () => injectedPricing ?? new ExcelPricingGateway(),
    [injectedPricing]
  );
  const layout = React.useMemo(() => injectedLayout ?? new ExcelLayoutGateway(), [injectedLayout]);
  const normExporter = React.useMemo(() => new ExcelNormExportGateway(), []);
  const libraryService = React.useMemo(
    () => injectedLibrary ?? createLibraryService(),
    [injectedLibrary]
  );
  const loadLibrary = React.useCallback(() => libraryService.load(), [libraryService]);
  // Cấp phép (ADR-0015): dùng thử 30 ngày, kích hoạt bằng email + mã đối chiếu với licenses.json.
  const licenseService = React.useMemo(
    () =>
      new LicenseService(
        browserLicenseStorage,
        async () => {
          const response = await fetch("licenses.json", { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        },
        () => new Date()
      ),
    []
  );
  const [license, setLicense] = React.useState(() => licenseService.state());
  // Hồ sơ báo giá trong workbook (ADR-0014); thư viện dùng để phát hiện giá đã đổi so với snapshot.
  const quotation = React.useMemo(
    () =>
      new QuotationService(pricing, new ExcelQuotationGateway(), {
        now: () => new Date(),
        newId: randomId,
        loadLibrary,
      }),
    [pricing, loadLibrary]
  );
  // Công tác vừa chọn "Chèn vào báo giá" ở thư viện; form Thêm công tác dùng một lần rồi xóa.
  const [prefill, setPrefill] = React.useState<LibraryPrefill | null>(null);
  // Màn hình ban đầu do nút Ribbon chọn (taskpane.html?view=…); mở thường thì không chuyển focus,
  // trừ khi nút chỉ định phần cần tới (&focus=…).
  const [nav, setNav] = React.useState<Navigation>(() => ({
    view: parseInitialView(window.location.search),
    focusId: parseInitialFocus(window.location.search),
  }));
  const initialLibrarySection = React.useMemo(
    () => parseLibrarySection(window.location.search),
    []
  );
  const [lastTab, setLastTab] = React.useState<View>(() =>
    nav.view === "help" ? "overview" : nav.view
  );
  // Tăng sau mỗi lần tạo/thêm để các danh sách bảng tự tải lại.
  const [tablesVersion, setTablesVersion] = React.useState(0);
  const bumpTables = React.useCallback(() => setTablesVersion((v) => v + 1), []);

  const go = (view: View, focusId: string | null = FOCUS_TARGET[view]) => {
    if (view !== "help") {
      setLastTab(view);
    }
    setNav({ view, focusId });
  };

  React.useEffect(() => {
    // Mốc đo: lần render đầu của task pane đã xong (prompts/17).
    performance.mark("cq-app-rendered");
  }, []);

  React.useEffect(() => {
    if (!nav.focusId) {
      return;
    }
    // Một số phần chỉ hiện sau khi tải dữ liệu (ví dụ tab Tính giá chờ danh sách bảng):
    // thử lại trong thời gian ngắn thay vì bỏ qua.
    const focusId = nav.focusId;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryFocus = () => {
      const target = document.getElementById(focusId);
      if (target) {
        target.scrollIntoView({ block: "start" });
        target.focus();
      } else if (attempts++ < 30) {
        timer = setTimeout(tryFocus, 100);
      }
    };
    tryFocus();
    return () => clearTimeout(timer);
  }, [nav]);

  const insertFromLibrary = async (item: WorkItem) => {
    const today = todayIso();
    // Đọc lại thư viện: tên nhóm/nhà cung cấp hiện tại (chép vào dòng báo giá) và giá tài nguyên mới
    // nhất cho "Phân tích từ định mức" (prompts/10).
    let library: LibrarySnapshot | undefined;
    try {
      library = await libraryService.load();
    } catch {
      library = undefined;
    }
    const { draft, warnings } = draftFromWorkItem(
      item,
      today,
      library ? nameLookup(library) : undefined
    );
    const lines = library ? compositionLines(item, library, today) : [];
    const composition: LibraryPrefill["composition"] =
      lines.length > 0 ? { item, lines } : undefined;
    setPrefill({ nonce: Date.now(), code: item.code, item, draft, warnings, composition });
    go("quote", "cq-append-title");
  };

  const s = STRINGS;
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <Title3 as="h1">{s.appName}</Title3>
          <Body1>{s.appTagline}</Body1>
          {/* App chỉ render sau Office.onReady và kiểm tra mức API, nên dòng này phản ánh đúng trạng thái. */}
          <Caption1 role="status" className={styles.ready}>
            <span className={styles.readyDot} aria-hidden="true" />
            {s.readyStatus(hostPlatform, APP_VERSION, BUILD_MODE === "development")}
          </Caption1>
          {license.kind !== "expired" && (
            <Caption1>
              {license.kind === "trial"
                ? LICENSE_UI.headerTrial(license.daysLeft)
                : LICENSE_UI.headerLicensed}
            </Caption1>
          )}
        </div>
        {nav.view !== "help" && license.kind !== "expired" && (
          <Button onClick={() => go("help")}>{s.header.help}</Button>
        )}
      </header>

      {license.kind === "expired" ? (
        // Hết dùng thử, chưa cấp phép: khóa thao tác ghi; vẫn xin cấp phép, kích hoạt, sao lưu thư viện.
        <div className={styles.panel}>
          <LicensePanel
            service={licenseService}
            state={license}
            onChange={setLicense}
            onBackup={async () =>
              EXCHANGE_STRINGS.backup.jsonDone(await downloadLibraryBackup(libraryService))
            }
            allowMailApp={hostPlatform === "OfficeOnline"}
          />
        </div>
      ) : nav.view === "help" ? (
        <HelpView onBack={() => go(lastTab)} />
      ) : (
        <>
          <TabList
            className={styles.tabs}
            aria-label={s.tabs.label}
            selectedValue={nav.view}
            onTabSelect={(_e, data) => go(data.value as View, null)}
          >
            <Tab value="overview">{s.tabs.overview}</Tab>
            <Tab value="quote">{s.tabs.quote}</Tab>
            <Tab value="items">{s.tabs.items}</Tab>
            <Tab value="pricing">{s.tabs.pricing}</Tab>
            <Tab value="print">{s.tabs.print}</Tab>
            <Tab value="library">{s.tabs.library}</Tab>
            <Tab value="settings">{s.tabs.settings}</Tab>
          </TabList>

          {nav.view === "overview" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.overview}>
              <WorkbookContextPanel gateway={gateway} />
              <WorkflowPanel
                gateway={gateway}
                pricing={pricing}
                tablesVersion={tablesVersion}
                onNavigate={(view, focusId) => go(view, focusId)}
              />
              <section aria-labelledby="cq-shortcuts-title">
                <Subtitle2 as="h2" id="cq-shortcuts-title">
                  {s.shortcuts.title}
                </Subtitle2>
                <div className={styles.shortcuts}>
                  <Button appearance="primary" onClick={() => go("quote", "cq-create-title")}>
                    {s.shortcuts.createQuote}
                  </Button>
                  <Button onClick={() => go("quote", "cq-append-title")}>
                    {s.shortcuts.addWorkItem}
                  </Button>
                  <Button onClick={() => go("library")}>{s.shortcuts.library}</Button>
                  <Button onClick={() => go("pricing")}>{s.shortcuts.checkQuote}</Button>
                  <Button onClick={() => go("help")}>{s.shortcuts.help}</Button>
                </div>
              </section>
              <QuoteTablesPanel gateway={gateway} version={tablesVersion} />
              <MessageBar intent="info" layout="multiline">
                <MessageBarBody>{s.overview.phaseNotice}</MessageBarBody>
              </MessageBar>
            </div>
          )}

          {nav.view === "quote" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.quote}>
              <WorkbookContextPanel gateway={gateway} />
              <CreateQuotePanel gateway={gateway} onCreated={bumpTables} />
              <QuoteInfoPanel gateway={gateway} tablesVersion={tablesVersion} />
              <AddWorkItemPanel
                gateway={gateway}
                pricing={pricing}
                tablesVersion={tablesVersion}
                onAppended={bumpTables}
                quotation={quotation}
                prefill={prefill}
                onPrefillConsumed={() => setPrefill(null)}
              />
            </div>
          )}

          {nav.view === "items" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.items}>
              <QuotationItemsView
                gateway={gateway}
                pricing={pricing}
                service={quotation}
                tablesVersion={tablesVersion}
              />
            </div>
          )}

          {nav.view === "pricing" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.pricing}>
              <PricingView
                gateway={gateway}
                pricing={pricing}
                tablesVersion={tablesVersion}
                loadLibrary={loadLibrary}
              />
            </div>
          )}

          {nav.view === "print" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.print}>
              <PrintView gateway={gateway} layout={layout} tablesVersion={tablesVersion} />
            </div>
          )}

          {nav.view === "library" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.library}>
              <LibraryView
                service={libraryService}
                gateway={gateway}
                normExporter={normExporter}
                onInsert={(item) => void insertFromLibrary(item)}
                initialSection={initialLibrarySection}
              />
            </div>
          )}

          {nav.view === "settings" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.settings}>
              <LicensePanel
                service={licenseService}
                state={license}
                onChange={setLicense}
                allowMailApp={hostPlatform === "OfficeOnline"}
              />
              <VersionPanel />
              <LibraryStoragePanel service={libraryService} />
              <EnvironmentPanel />
              <StorageProbePanel />
              <DiagnosticsPanel />
              {ExcelLabSection && (
                <React.Suspense fallback={null}>
                  <ExcelLabSection />
                </React.Suspense>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default App;
