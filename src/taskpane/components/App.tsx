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
import { LayoutGateway } from "../../application/layoutGateway";
import { ExcelLayoutGateway } from "../../office/excelLayoutGateway";
import { compositionLines } from "../../domain/pricing/composition";
import { ExcelPricingGateway } from "../../office/excelPricingGateway";
import { PricingGateway } from "../../application/pricingGateway";
import { LibraryService } from "../../application/libraryService";
import { WorkbookGateway } from "../../application/workbookGateway";
import { todayIso } from "../../domain/library/dates";
import { draftFromWorkItem } from "../../domain/library/toQuote";
import { WorkItem } from "../../domain/library/types";
import { readHostInfo, readPartitionKey } from "../../office/environment";
import { APP_VERSION, BUILD_MODE } from "../../shared/buildInfo";
import { ExcelWorkbookGateway } from "../../office/excelWorkbookGateway";
import {
  IndexedDbLibraryRepository,
  libraryDatabaseName,
} from "../../storage/indexedDbLibraryRepository";
import { STRINGS } from "../../shared/strings.vi";
import { randomId } from "../../shared/uuid";
import { View, parseInitialView } from "../navigation";

/* global clearTimeout, document, indexedDB, performance, setTimeout, window */

function createLibraryService(): LibraryService {
  const repo = new IndexedDbLibraryRepository(indexedDB, libraryDatabaseName(readPartitionKey()));
  return new LibraryService(repo, { now: () => new Date(), newId: randomId });
}

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
});

/** Tiêu đề nhận focus khi chuyển tới màn hình/phần tương ứng (bàn phím, trình đọc màn hình). */
const FOCUS_TARGET: Record<View, string> = {
  overview: "cq-context-title",
  quote: "cq-create-title",
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
  const styles = useStyles();
  const hostPlatform = React.useMemo(() => readHostInfo().platform, []);
  const gateway = React.useMemo(() => injected ?? new ExcelWorkbookGateway(), [injected]);
  const pricing = React.useMemo(
    () => injectedPricing ?? new ExcelPricingGateway(),
    [injectedPricing]
  );
  const layout = React.useMemo(() => injectedLayout ?? new ExcelLayoutGateway(), [injectedLayout]);
  const libraryService = React.useMemo(
    () => injectedLibrary ?? createLibraryService(),
    [injectedLibrary]
  );
  const loadLibrary = React.useCallback(() => libraryService.load(), [libraryService]);
  // Công tác vừa chọn "Chèn vào báo giá" ở thư viện; form Thêm công tác dùng một lần rồi xóa.
  const [prefill, setPrefill] = React.useState<LibraryPrefill | null>(null);
  // Màn hình ban đầu do nút Ribbon chọn (taskpane.html?view=…); mở thường thì không chuyển focus.
  const [nav, setNav] = React.useState<Navigation>(() => ({
    view: parseInitialView(window.location.search),
    focusId: null,
  }));
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
    const { draft, warnings } = draftFromWorkItem(item, today);
    // Công tác có định mức: cho phép chọn "Phân tích từ định mức" (prompts/10). Đọc lại thư viện
    // để có giá tài nguyên mới nhất đã lưu.
    let composition: LibraryPrefill["composition"];
    try {
      const library = await libraryService.load();
      const lines = compositionLines(item, library, today);
      composition = lines.length > 0 ? { item, lines } : undefined;
    } catch {
      composition = undefined;
    }
    setPrefill({ nonce: Date.now(), code: item.code, draft, warnings, composition });
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
        </div>
        {nav.view !== "help" && <Button onClick={() => go("help")}>{s.header.help}</Button>}
      </header>

      {nav.view === "help" ? (
        <HelpView onBack={() => go(lastTab)} />
      ) : (
        <>
          <TabList
            aria-label={s.tabs.label}
            selectedValue={nav.view}
            onTabSelect={(_e, data) => go(data.value as View, null)}
          >
            <Tab value="overview">{s.tabs.overview}</Tab>
            <Tab value="quote">{s.tabs.quote}</Tab>
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
                prefill={prefill}
                onPrefillConsumed={() => setPrefill(null)}
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
                onInsert={(item) => void insertFromLibrary(item)}
              />
            </div>
          )}

          {nav.view === "settings" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.settings}>
              <VersionPanel />
              <LibraryStoragePanel service={libraryService} />
              <EnvironmentPanel />
              <StorageProbePanel />
              <DiagnosticsPanel />
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default App;
