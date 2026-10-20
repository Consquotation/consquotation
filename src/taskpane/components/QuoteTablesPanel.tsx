import * as React from "react";
import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { QuoteTableInfo, WorkbookGateway } from "../../application/workbookGateway";
import { describeOfficeError } from "../../office/officeErrors";
import { STRINGS } from "../../shared/strings.vi";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; tables: QuoteTableInfo[] }
  | { kind: "error"; message: string };

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  itemText: { display: "flex", flexDirection: "column", minWidth: 0 },
});

/** Lối tắt tới các bảng báo giá có trong workbook; "Đi tới" chỉ chọn vùng, không ghi dữ liệu. */
const QuoteTablesPanel: React.FC<{ gateway: WorkbookGateway; version: number }> = ({ gateway, version }) => {
  const styles = useStyles();
  const s = STRINGS.quoteTables;
  const [state, setState] = React.useState<ListState>({ kind: "loading" });
  const [goError, setGoError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", tables: await gateway.listQuoteTables() });
    } catch (error) {
      setState({ kind: "error", message: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    void load();
  }, [load, version]);

  const goTo = async (tableName: string) => {
    setGoError(null);
    try {
      await gateway.selectQuoteTable(tableName);
    } catch (error) {
      setGoError(describeOfficeError(error));
      void load();
    }
  };

  return (
    <section className={styles.root} aria-labelledby="cq-tables-title">
      <div className={styles.heading}>
        <Subtitle2 as="h2" id="cq-tables-title">
          {s.title}
        </Subtitle2>
        <Button size="small" onClick={() => void load()}>
          {s.reload}
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
      {state.kind === "ready" && state.tables.length === 0 && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.empty}</MessageBarBody>
        </MessageBar>
      )}
      {state.kind === "ready" && state.tables.length > 0 && (
        <ul className={styles.list}>
          {state.tables.map((t) => (
            <li key={t.tableName} className={styles.item}>
              <div className={styles.itemText}>
                <Text weight="semibold">{t.tableName}</Text>
                <Caption1>
                  {s.row(t.sheetName, t.dataRowCount)}
                  {t.headersMatch ? "" : ` · ${s.headersChanged}`}
                </Caption1>
              </div>
              <Button size="small" aria-label={s.goLabel(t.tableName)} onClick={() => void goTo(t.tableName)}>
                {s.go}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {goError && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>{goError}</MessageBarBody>
        </MessageBar>
      )}
    </section>
  );
};

export default QuoteTablesPanel;
