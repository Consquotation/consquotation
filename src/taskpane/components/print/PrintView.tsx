import * as React from "react";
import { Button, Divider, Field, MessageBar, MessageBarBody, Select, makeStyles, tokens } from "@fluentui/react-components";
import PrintSetupPanel from "./PrintSetupPanel";
import TermsPanel from "./TermsPanel";
import { LayoutGateway } from "../../../application/layoutGateway";
import { preferredTable } from "../../../application/quoteTableSelection";
import { QuoteTableInfo, WorkbookGateway } from "../../../application/workbookGateway";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRINT_STRINGS } from "../../../shared/strings.print.vi";
import { STRINGS } from "../../../shared/strings.vi";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXL },
  row: { display: "flex", alignItems: "flex-end", gap: tokens.spacingHorizontalS },
});

/** Tab "In ấn" (prompts/11): khu vực ghi chú/điều khoản và thiết lập trang in. */
const PrintView: React.FC<{ gateway: WorkbookGateway; layout: LayoutGateway; tablesVersion: number }> = ({
  gateway,
  layout,
  tablesVersion,
}) => {
  const styles = useStyles();
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Ghi điều khoản làm đổi vùng báo giá → thiết lập in đọc lại.
  const [version, setVersion] = React.useState(0);
  const current = React.useRef(tableName);
  current.current = tableName;

  const load = React.useCallback(async () => {
    try {
      const list = await gateway.listQuoteTables();
      setTables(list);
      setTableName(preferredTable(list, current.current));
      setError(null);
    } catch (e) {
      setTables([]);
      setError(describeOfficeError(e));
    }
  }, [gateway]);

  React.useEffect(() => {
    void load();
  }, [load, tablesVersion]);

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {tables !== null && tables.length === 0 && !error && (
        <MessageBar intent="info">
          <MessageBarBody>{PRINT_STRINGS.noTables}</MessageBarBody>
        </MessageBar>
      )}
      {tables !== null && tables.length > 0 && (
        <div className={styles.row}>
          <Field label={PRINT_STRINGS.table}>
            <Select value={tableName} onChange={(_e, d) => setTableName(d.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {STRINGS.append.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="small" onClick={() => void load()}>
            {STRINGS.append.reloadTables}
          </Button>
        </div>
      )}
      {tableName && (
        <TermsPanel layout={layout} tableName={tableName} onChanged={() => setVersion((v) => v + 1)} />
      )}
      {tableName && <Divider />}
      {tableName && <PrintSetupPanel layout={layout} tableName={tableName} version={version} />}
    </div>
  );
};

export default PrintView;
