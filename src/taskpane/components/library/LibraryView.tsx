import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ExchangePanel from "./ExchangePanel";
import LibraryCheckPanel from "./LibraryCheckPanel";
import ResourcesPanel from "./ResourcesPanel";
import WorkItemsPanel from "./WorkItemsPanel";
import { useLibrary } from "./useLibrary";
import { BackupStatus, LibraryService } from "../../../application/libraryService";
import { WorkbookGateway } from "../../../application/workbookGateway";
import { formatDateTime } from "../../../domain/library/dates";
import { WorkItem, isLibraryEmpty } from "../../../domain/library/types";
import { requestPersistence } from "../../../storage/storageProbe";
import { EXCHANGE_STRINGS } from "../../../shared/strings.exchange.vi";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

/* global navigator */

type Section = "workItems" | "resources" | "check" | "exchange";



const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
});

const LibraryView: React.FC<{
  service: LibraryService;
  gateway: WorkbookGateway;
  onInsert: (item: WorkItem) => void;
}> = ({ service, gateway, onInsert }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const { state, reload } = useLibrary(service);
  const [section, setSection] = React.useState<Section>("workItems");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [usedInWorkbook, setUsedInWorkbook] = React.useState(false);
  const persistenceRequested = React.useRef(false);
  const [backup, setBackup] = React.useState<BackupStatus | null>(null);

  const refreshBackup = React.useCallback(async () => {
    try {
      setBackup(await service.backupStatus());
    } catch {
      setBackup(null);
    }
  }, [service]);

  React.useEffect(() => {
    void refreshBackup();
  }, [refreshBackup]);

  React.useEffect(() => {
    gateway.wasLibraryUsed().then(setUsedInWorkbook, () => setUsedInWorkbook(false));
  }, [gateway]);

  const reloadAfterWrite = React.useCallback(async () => {
    await reload();
    await refreshBackup();
    // Xin lưu trữ bền vững sau lần ghi đầu (ADR-0003). WebView2 thường từ chối — backup vẫn bắt buộc.
    if (!persistenceRequested.current) {
      persistenceRequested.current = true;
      void requestPersistence(typeof navigator === "undefined" ? undefined : navigator.storage);
    }
  }, [reload, refreshBackup]);

  return (
    <section className={styles.root} aria-labelledby="cq-library-title">
      <Subtitle2 as="h2" id="cq-library-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>

      {state.kind === "loading" && <Spinner size="tiny" label={s.loading} />}
      {state.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.loadFailed}</MessageBarTitle>
            {state.message}
          </MessageBarBody>
          <Button size="small" onClick={() => void reload()}>
            {s.retry}
          </Button>
        </MessageBar>
      )}

      {state.kind === "ready" && (
        <>
          {usedInWorkbook && isLibraryEmpty(state.library) && (
            <MessageBar intent="warning" layout="multiline" politeness="polite">
              <MessageBarBody>{s.emptyButUsed}</MessageBarBody>
            </MessageBar>
          )}
          {backup && !isLibraryEmpty(state.library) && (
            <BackupReminder
              status={backup}
              onBackup={section === "exchange" ? undefined : () => setSection("exchange")}
            />
          )}
          {notice && (
            <MessageBar intent="success" layout="multiline" politeness="polite">
              <MessageBarBody>{notice}</MessageBarBody>
            </MessageBar>
          )}

          <TabList
            aria-label={s.sections.label}
            size="small"
            selectedValue={section}
            onTabSelect={(_e, data) => {
              setNotice(null);
              setSection(data.value as Section);
            }}
          >
            <Tab value="workItems">
              {s.sections.workItems} ({state.library.workItems.length})
            </Tab>
            <Tab value="resources">
              {s.sections.resources} ({state.library.resources.length})
            </Tab>
            <Tab value="check">{s.sections.check}</Tab>
            <Tab value="exchange">{EXCHANGE_STRINGS.sectionTab}</Tab>
          </TabList>

          {section === "workItems" && (
            <WorkItemsPanel
              service={service}
              library={state.library}
              reload={reloadAfterWrite}
              onInsert={onInsert}
              notify={setNotice}
            />
          )}
          {section === "resources" && (
            <ResourcesPanel service={service} library={state.library} reload={reloadAfterWrite} notify={setNotice} />
          )}
          {section === "check" && <LibraryCheckPanel library={state.library} />}
          {section === "exchange" && (
            <ExchangePanel
              service={service}
              gateway={gateway}
              library={state.library}
              onLibraryChanged={reloadAfterWrite}
            />
          )}
        </>
      )}
    </section>
  );
};

/** Nhắc sao lưu (ADR-0003): chưa sao lưu lần nào, hoặc thư viện đã đổi sau lần sao lưu gần nhất. */
const BackupReminder: React.FC<{ status: BackupStatus; onBackup?: () => void }> = ({ status, onBackup }) => {
  const s = EXCHANGE_STRINGS.status;
  const { lastBackupAt, lastChangedAt } = status;
  const stale = lastBackupAt !== null && lastChangedAt !== null && lastChangedAt > lastBackupAt;
  if (lastBackupAt !== null && !stale) {
    return <Caption1>{s.ok(formatDateTime(lastBackupAt))}</Caption1>;
  }
  return (
    <MessageBar intent="warning" layout="multiline">
      <MessageBarBody>{lastBackupAt === null ? s.never : s.stale(formatDateTime(lastBackupAt))}</MessageBarBody>
      {onBackup && (
        <MessageBarActions>
          <Button size="small" onClick={onBackup}>
            {s.backupNow}
          </Button>
        </MessageBarActions>
      )}
    </MessageBar>
  );
};

export default LibraryView;
