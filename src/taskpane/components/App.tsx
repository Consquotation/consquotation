import * as React from "react";
import {
  Body1,
  Button,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Tab,
  TabList,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import AddWorkItemPanel from "./AddWorkItemPanel";
import CreateQuotePanel from "./CreateQuotePanel";
import EnvironmentPanel from "./EnvironmentPanel";
import HelpView from "./HelpView";
import QuoteTablesPanel from "./QuoteTablesPanel";
import StorageProbePanel from "./StorageProbePanel";
import VersionPanel from "./VersionPanel";
import WorkbookContextPanel from "./WorkbookContextPanel";
import { WorkbookGateway } from "../../application/workbookGateway";
import { ExcelWorkbookGateway } from "../../office/excelWorkbookGateway";
import { STRINGS } from "../../shared/strings.vi";
import { View, parseInitialView } from "../navigation";

/* global document, window */

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
  panel: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXL },
  shortcuts: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

/** Tiêu đề nhận focus khi chuyển tới màn hình/phần tương ứng (bàn phím, trình đọc màn hình). */
const FOCUS_TARGET: Record<View, string> = {
  overview: "cq-context-title",
  quote: "cq-create-title",
  settings: "cq-version-title",
  help: "cq-help-title",
};

interface Navigation {
  view: View;
  /** null: giữ focus tại chỗ (ví dụ đang dùng phím mũi tên trên TabList). */
  focusId: string | null;
}

const App: React.FC<{ gateway?: WorkbookGateway }> = ({ gateway: injected }) => {
  const styles = useStyles();
  const gateway = React.useMemo(() => injected ?? new ExcelWorkbookGateway(), [injected]);
  // Màn hình ban đầu do nút Ribbon chọn (taskpane.html?view=…); mở thường thì không chuyển focus.
  const [nav, setNav] = React.useState<Navigation>(() => ({
    view: parseInitialView(window.location.search),
    focusId: null,
  }));
  const [lastTab, setLastTab] = React.useState<View>(() => (nav.view === "help" ? "overview" : nav.view));
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
    if (!nav.focusId) {
      return;
    }
    const target = document.getElementById(nav.focusId);
    target?.scrollIntoView({ block: "start" });
    target?.focus();
  }, [nav]);

  const s = STRINGS;
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <Title3 as="h1">{s.appName}</Title3>
          <Body1>{s.appTagline}</Body1>
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
            <Tab value="settings">{s.tabs.settings}</Tab>
          </TabList>

          {nav.view === "overview" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.overview}>
              <WorkbookContextPanel gateway={gateway} />
              <section aria-labelledby="cq-shortcuts-title">
                <Subtitle2 as="h2" id="cq-shortcuts-title">
                  {s.shortcuts.title}
                </Subtitle2>
                <div className={styles.shortcuts}>
                  <Button appearance="primary" onClick={() => go("quote", "cq-create-title")}>
                    {s.shortcuts.createQuote}
                  </Button>
                  <Button onClick={() => go("quote", "cq-append-title")}>{s.shortcuts.addWorkItem}</Button>
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
              <AddWorkItemPanel gateway={gateway} tablesVersion={tablesVersion} onAppended={bumpTables} />
            </div>
          )}

          {nav.view === "settings" && (
            <div className={styles.panel} role="tabpanel" aria-label={s.tabs.settings}>
              <VersionPanel />
              <EnvironmentPanel />
              <StorageProbePanel />
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default App;
