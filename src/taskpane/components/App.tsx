import * as React from "react";
import {
  Body1,
  MessageBar,
  MessageBarBody,
  Tab,
  TabList,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import AddWorkItemPanel from "./AddWorkItemPanel";
import CreateQuotePanel from "./CreateQuotePanel";
import EnvironmentPanel from "./EnvironmentPanel";
import StorageProbePanel from "./StorageProbePanel";
import WorkbookContextPanel from "./WorkbookContextPanel";
import { WorkbookGateway } from "../../application/workbookGateway";
import { ExcelWorkbookGateway } from "../../office/excelWorkbookGateway";
import { STRINGS } from "../../shared/strings.vi";

type TabKey = "overview" | "quote" | "diagnostics";

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
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXS,
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXL,
  },
});

const App: React.FC<{ gateway?: WorkbookGateway }> = ({ gateway: injected }) => {
  const styles = useStyles();
  const gateway = React.useMemo(() => injected ?? new ExcelWorkbookGateway(), [injected]);
  const [tab, setTab] = React.useState<TabKey>("overview");
  // Tăng sau mỗi lần tạo bảng để danh sách bảng ở "Thêm công tác" tự tải lại.
  const [tablesVersion, setTablesVersion] = React.useState(0);

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Title3 as="h1">{STRINGS.appName}</Title3>
        <Body1>{STRINGS.appTagline}</Body1>
      </header>

      <TabList selectedValue={tab} onTabSelect={(_e, data) => setTab(data.value as TabKey)}>
        <Tab value="overview">{STRINGS.tabs.overview}</Tab>
        <Tab value="quote">{STRINGS.tabs.quote}</Tab>
        <Tab value="diagnostics">{STRINGS.tabs.diagnostics}</Tab>
      </TabList>

      {tab === "overview" && (
        <div className={styles.panel} role="tabpanel">
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>{STRINGS.overview.phaseNotice}</MessageBarBody>
          </MessageBar>
          <WorkbookContextPanel gateway={gateway} />
        </div>
      )}

      {tab === "quote" && (
        <div className={styles.panel} role="tabpanel">
          <WorkbookContextPanel gateway={gateway} />
          <CreateQuotePanel gateway={gateway} onCreated={() => setTablesVersion((v) => v + 1)} />
          <AddWorkItemPanel gateway={gateway} tablesVersion={tablesVersion} />
        </div>
      )}

      {tab === "diagnostics" && (
        <div className={styles.panel} role="tabpanel">
          <EnvironmentPanel />
          <StorageProbePanel />
        </div>
      )}
    </main>
  );
};

export default App;
