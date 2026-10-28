import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Divider,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ImportSection from "./ImportSection";
import { LibraryService } from "../../../application/libraryService";
import { WorkbookGateway } from "../../../application/workbookGateway";
import { exportSheets } from "../../../domain/library/exchange/backup";
import { EMPTY_LIBRARY, LibrarySnapshot } from "../../../domain/library/types";
import { APP_VERSION } from "../../../shared/buildInfo";
import { EXCHANGE_STRINGS } from "../../../shared/strings.exchange.vi";
import { buildXlsx } from "../../../shared/xlsx";
import { toBase64 } from "../../../shared/zip";
import { useExclusive } from "../../useExclusive";
import { downloadLibraryBackup } from "../../libraryBackup";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalL },
  section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  action: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    rowGap: tokens.spacingVerticalXXS,
  },
});

type Notice = { intent: "success" | "error"; text: string } | null;

const ExchangePanel: React.FC<{
  service: LibraryService;
  gateway: WorkbookGateway;
  library: LibrarySnapshot;
  onLibraryChanged: () => Promise<void>;
}> = ({ service, gateway, library, onLibraryChanged }) => {
  const styles = useStyles();
  const s = EXCHANGE_STRINGS.backup;
  const [notice, setNotice] = React.useState<Notice>(null);
  const exclusive = useExclusive();

  const run = (task: () => Promise<string>) =>
    exclusive(async () => {
      setNotice(null);
      try {
        setNotice({ intent: "success", text: await task() });
      } catch (e) {
        setNotice({
          intent: "error",
          text: `${s.failed}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });

  const meta = async (now: Date) => ({
    exportedAt: now.toISOString(),
    appVersion: APP_VERSION,
    libraryName: await service.libraryName(),
  });

  const backupJson = () =>
    run(async () => {
      // Đọc lại từ bộ nhớ để file sao lưu chắc chắn khớp dữ liệu đã lưu.
      const fileName = await downloadLibraryBackup(service);
      await onLibraryChanged();
      return s.jsonDone(fileName);
    });

  const exportWorkbook = (empty: boolean) =>
    run(async () => {
      const now = new Date();
      const data = empty ? EMPTY_LIBRARY : await service.load();
      await gateway.openNewWorkbook(toBase64(buildXlsx(exportSheets(data, await meta(now)))));
      if (!empty) {
        await service.recordBackup(now);
        await onLibraryChanged();
      }
      return empty ? s.templateDone : s.workbookDone;
    });

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-labelledby="cq-backup-title">
        <Subtitle2 as="h2" id="cq-backup-title" tabIndex={-1}>
          {s.title}
        </Subtitle2>
        <Body1>{s.description}</Body1>
        {notice && (
          <MessageBar
            intent={notice.intent}
            layout="multiline"
            politeness={notice.intent === "error" ? "assertive" : "polite"}
          >
            <MessageBarBody>{notice.text}</MessageBarBody>
          </MessageBar>
        )}
        <div className={styles.action}>
          <Button appearance="primary" onClick={() => void backupJson()}>
            {s.json}
          </Button>
          <Caption1>{s.jsonHint}</Caption1>
        </div>
        <div className={styles.action}>
          <Button onClick={() => void exportWorkbook(false)}>{s.workbook}</Button>
          <Caption1>{s.workbookHint}</Caption1>
        </div>
        <div className={styles.action}>
          <Button onClick={() => void exportWorkbook(true)}>{s.template}</Button>
          <Caption1>{s.templateHint}</Caption1>
        </div>
      </section>
      <Divider />
      <ImportSection
        service={service}
        gateway={gateway}
        library={library}
        onImported={onLibraryChanged}
      />
    </div>
  );
};

export default ExchangePanel;
