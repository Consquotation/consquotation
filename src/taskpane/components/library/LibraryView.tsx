import * as React from "react";
import {
  Body1,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import LibraryCheckPanel from "./LibraryCheckPanel";
import ResourcesPanel from "./ResourcesPanel";
import WorkItemsPanel from "./WorkItemsPanel";
import { useLibrary } from "./useLibrary";
import { LibraryService } from "../../../application/libraryService";
import { WorkbookGateway } from "../../../application/workbookGateway";
import { WorkItem, isLibraryEmpty } from "../../../domain/library/types";
import { requestPersistence } from "../../../storage/storageProbe";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

/* global navigator */

type Section = "workItems" | "resources" | "check";

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

  React.useEffect(() => {
    gateway.wasLibraryUsed().then(setUsedInWorkbook, () => setUsedInWorkbook(false));
  }, [gateway]);

  const reloadAfterWrite = React.useCallback(async () => {
    await reload();
    // Xin lưu trữ bền vững sau lần ghi đầu (ADR-0003). WebView2 thường từ chối — backup vẫn bắt buộc.
    if (!persistenceRequested.current) {
      persistenceRequested.current = true;
      void requestPersistence(typeof navigator === "undefined" ? undefined : navigator.storage);
    }
  }, [reload]);

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
          <MessageBar intent="warning" layout="multiline">
            <MessageBarBody>{s.backupWarning}</MessageBarBody>
          </MessageBar>
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
        </>
      )}
    </section>
  );
};

export default LibraryView;
