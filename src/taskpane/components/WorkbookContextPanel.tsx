import * as React from "react";
import {
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import InfoList from "./InfoList";
import { WorkbookContext, WorkbookGateway } from "../../application/workbookGateway";
import { describeOfficeError } from "../../office/officeErrors";
import { subscribeSelectionChanged } from "../../office/selectionEvents";
import { STRINGS } from "../../shared/strings.vi";

/* global clearTimeout, setTimeout */

type ContextState =
  | { kind: "loading" }
  | { kind: "ready"; context: WorkbookContext }
  | { kind: "error"; message: string };

const REFRESH_DEBOUNCE_MS = 300;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between" },
});

/** Đọc lại workbook mỗi khi vùng chọn/sheet đổi; không giữ thông tin cũ như thể luôn đúng (prompts/14). */
function useWorkbookContext(gateway: WorkbookGateway) {
  const [state, setState] = React.useState<ContextState>({ kind: "loading" });

  const refresh = React.useCallback(async () => {
    try {
      setState({ kind: "ready", context: await gateway.readContext() });
    } catch (error) {
      setState({ kind: "error", message: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void refresh();
    const unsubscribe = subscribeSelectionChanged(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [refresh]);

  return { state, refresh };
}

const WorkbookContextPanel: React.FC<{ gateway: WorkbookGateway }> = ({ gateway }) => {
  const styles = useStyles();
  const s = STRINGS.context;
  const { state, refresh } = useWorkbookContext(gateway);

  return (
    <section className={styles.root} aria-labelledby="cq-context-title">
      <div className={styles.heading}>
        <Subtitle2 as="h2" id="cq-context-title" tabIndex={-1}>
          {s.title}
        </Subtitle2>
        <Button size="small" onClick={() => void refresh()}>
          {s.refresh}
        </Button>
      </div>

      {state.kind === "loading" && <Spinner size="tiny" label={s.loading} />}

      {state.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.failed}</MessageBarTitle>
            {state.message}
          </MessageBarBody>
        </MessageBar>
      )}

      {state.kind === "ready" && (
        <>
          <InfoList
            items={[
              { label: s.workbook, value: state.context.workbookName ?? s.unsaved },
              { label: s.sheet, value: state.context.sheetName },
              { label: s.selection, value: state.context.selectionAddress || s.none },
            ]}
          />
          {state.context.sheetProtected && (
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>{s.protectedSheet}</MessageBarBody>
            </MessageBar>
          )}
        </>
      )}
    </section>
  );
};

export default WorkbookContextPanel;
