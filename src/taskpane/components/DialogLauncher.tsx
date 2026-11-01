import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { readHostInfo } from "../../office/environment";
import { APP_VERSION, BUILD_MODE } from "../../shared/buildInfo";
import { DIALOG_STRINGS as d } from "../../shared/strings.dialog.vi";
import { STRINGS } from "../../shared/strings.vi";
import { OpenedDialog, openAppDialog } from "../dialog/appDialog";

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    padding: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    boxSizing: "border-box",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

type Status = { kind: "opening" | "open" | "closed" } | { kind: "failed"; detail: string };

/**
 * Task pane ở chế độ cửa sổ nổi (ADR-0016): tự mở hộp thoại ConsQuotation và làm cầu nối cho nó.
 * `onUsePane`: chuyển sang giao diện đầy đủ trong task pane khi không mở được cửa sổ.
 */
const DialogLauncher: React.FC<{ onUsePane: () => void }> = ({ onUsePane }) => {
  const styles = useStyles();
  const [status, setStatus] = React.useState<Status>({ kind: "opening" });
  const dialog = React.useRef<OpenedDialog | null>(null);

  const open = React.useCallback(async () => {
    dialog.current?.close();
    dialog.current = null;
    setStatus({ kind: "opening" });
    try {
      dialog.current = await openAppDialog(() => {
        dialog.current = null;
        setStatus({ kind: "closed" });
      });
      setStatus({ kind: "open" });
    } catch (error) {
      setStatus({ kind: "failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  React.useEffect(() => {
    void open();
    return () => dialog.current?.close();
  }, [open]);

  const s = STRINGS;
  return (
    <main className={styles.root}>
      <Title3 as="h1">{s.appName}</Title3>
      <Caption1>
        {s.readyStatus(readHostInfo().platform, APP_VERSION, BUILD_MODE === "development")}
      </Caption1>
      <MessageBar layout="multiline" intent={status.kind === "failed" ? "error" : "info"}>
        <MessageBarBody>
          {status.kind === "failed" ? d.failed(status.detail) : d[status.kind]}
        </MessageBarBody>
      </MessageBar>
      <div className={styles.actions}>
        {status.kind !== "opening" && (
          <Button appearance="primary" onClick={() => void open()}>
            {d.reopen}
          </Button>
        )}
        {status.kind === "failed" && <Button onClick={onUsePane}>{d.usePane}</Button>}
      </div>
      <Body1>{d.keepPane}</Body1>
      <Caption1>{d.ribbonNote}</Caption1>
    </main>
  );
};

export default DialogLauncher;
