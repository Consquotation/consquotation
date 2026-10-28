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
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import CatalogPanel from "./CatalogPanel";
import NormsPanel from "./NormsPanel";
import ExchangePanel from "./ExchangePanel";
import { TextField } from "./common";
import LibraryCheckPanel from "./LibraryCheckPanel";
import ResourcesPanel from "./ResourcesPanel";
import WorkItemsPanel from "./WorkItemsPanel";
import { useLibrary } from "./useLibrary";
import { BackupStatus, LibraryService } from "../../../application/libraryService";
import { WorkbookGateway } from "../../../application/workbookGateway";
import { NormExportGateway } from "../../../application/normExportGateway";
import { formatDateTime } from "../../../domain/library/dates";
import {
  DEFAULT_LIBRARY_NAME,
  LibrarySnapshot,
  WorkItem,
  isLibraryEmpty,
} from "../../../domain/library/types";
import { requestPersistence } from "../../../storage/storageProbe";
import { EXCHANGE_STRINGS } from "../../../shared/strings.exchange.vi";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";
import { LibrarySection } from "../../navigation";

/* global navigator */

type Section = LibrarySection;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  overview: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  nameRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  libraryName: { wordBreak: "break-word" },
  quick: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalXS },
  tabs: { flexWrap: "wrap" },
});

const LibraryView: React.FC<{
  service: LibraryService;
  gateway: WorkbookGateway;
  normExporter: NormExportGateway;
  onInsert: (item: WorkItem) => void;
  /** Phần mở sẵn khi task pane mở từ nút Ribbon (?section=…). */
  initialSection?: Section | null;
}> = ({ service, gateway, normExporter, onInsert, initialSection }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const { state, reload } = useLibrary(service);
  const [section, setSection] = React.useState<Section>(initialSection ?? "workItems");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [usedInWorkbook, setUsedInWorkbook] = React.useState(false);
  const persistenceRequested = React.useRef(false);
  const [backup, setBackup] = React.useState<BackupStatus | null>(null);
  const [libraryName, setLibraryName] = React.useState<string | null>(null);
  // Tăng để mở form thêm mới ở tab tương ứng (nút thao tác nhanh).
  const [newWorkItem, setNewWorkItem] = React.useState(0);
  const [newResource, setNewResource] = React.useState(0);

  const refreshBackup = React.useCallback(async () => {
    try {
      const [status, name] = await Promise.all([service.backupStatus(), service.libraryName()]);
      setBackup(status);
      setLibraryName(name);
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
          <LibraryOverview
            service={service}
            name={libraryName}
            library={state.library}
            lastChangedAt={backup?.lastChangedAt ?? null}
            onRenamed={(name) => {
              setLibraryName(name);
              void refreshBackup();
            }}
            onAddWorkItem={() => {
              setNotice(null);
              setSection("workItems");
              setNewWorkItem((n) => n + 1);
            }}
            onAddResource={() => {
              setNotice(null);
              setSection("resources");
              setNewResource((n) => n + 1);
            }}
            onExchange={() => {
              setNotice(null);
              setSection("exchange");
            }}
            styles={styles}
          />
          {notice && (
            <MessageBar intent="success" layout="multiline" politeness="polite">
              <MessageBarBody>{notice}</MessageBarBody>
            </MessageBar>
          )}

          <TabList
            className={styles.tabs}
            aria-label={s.sections.label}
            size="small"
            selectedValue={section}
            onTabSelect={(_e, data) => {
              setNotice(null);
              setSection(data.value as Section);
            }}
          >
            <Tab value="workItems">{s.sections.workItems}</Tab>
            <Tab value="resources">{s.sections.resources}</Tab>
            <Tab value="norms">{s.sections.norms}</Tab>
            <Tab value="catalog">{s.sections.catalog}</Tab>
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
              startNew={newWorkItem}
            />
          )}
          {section === "resources" && (
            <ResourcesPanel
              service={service}
              library={state.library}
              reload={reloadAfterWrite}
              notify={setNotice}
              startNew={newResource}
            />
          )}
          {section === "norms" && (
            <NormsPanel
              service={service}
              library={state.library}
              reload={reloadAfterWrite}
              notify={setNotice}
              exporter={normExporter}
            />
          )}
          {section === "catalog" && (
            <CatalogPanel service={service} library={state.library} reload={reloadAfterWrite} notify={setNotice} />
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

/** Tổng quan thư viện: tên (đổi được), số liệu, cập nhật gần nhất, nơi lưu và thao tác chính. */
const LibraryOverview: React.FC<{
  service: LibraryService;
  name: string | null;
  library: LibrarySnapshot;
  lastChangedAt: string | null;
  onRenamed: (name: string) => void;
  onAddWorkItem: () => void;
  onAddResource: () => void;
  onExchange: () => void;
  styles: ReturnType<typeof useStyles>;
}> = ({ service, name, library, lastChangedAt, onRenamed, onAddWorkItem, onAddResource, onExchange, styles }) => {
  const s = LIBRARY_STRINGS.overview;
  const [editing, setEditing] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const save = () =>
    exclusive(async () => {
      if (editing === null) {
        return;
      }
      setFailure(null);
      try {
        onRenamed(await service.setLibraryName(editing));
        setEditing(null);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });
  return (
    <section className={styles.overview} aria-labelledby="cq-library-name">
      {editing === null ? (
        <div className={styles.nameRow}>
          <Text weight="semibold" id="cq-library-name" className={styles.libraryName}>
            {name ?? DEFAULT_LIBRARY_NAME}
          </Text>
          <Button size="small" appearance="subtle" onClick={() => setEditing(name ?? DEFAULT_LIBRARY_NAME)}>
            {s.rename}
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className={styles.nameRow}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextField label={s.nameLabel} value={editing} onChange={setEditing} />
          <Button size="small" type="submit" appearance="primary">
            {s.saveName}
          </Button>
          <Button size="small" onClick={() => setEditing(null)}>
            {LIBRARY_STRINGS.actions.cancel}
          </Button>
        </form>
      )}
      {failure && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{failure}</MessageBarBody>
        </MessageBar>
      )}
      <Caption1>
        {s.stats(
          library.workItems.length,
          library.resources.length,
          library.resourcePrices.length,
          library.categories.length,
          library.suppliers.length
        )}
      </Caption1>
      <Caption1>{lastChangedAt ? s.lastChanged(formatDateTime(lastChangedAt)) : s.neverChanged}</Caption1>
      <Caption1>{s.storage}</Caption1>
      <div className={styles.quick}>
        <Button size="small" onClick={onAddWorkItem}>
          {s.addWorkItem}
        </Button>
        <Button size="small" onClick={onAddResource}>
          {s.addResource}
        </Button>
        <Button size="small" onClick={onExchange}>
          {s.exchange}
        </Button>
      </div>
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
