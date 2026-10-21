import * as React from "react";
import { Button, Divider, Field, MessageBar, MessageBarBody, Select, makeStyles, tokens } from "@fluentui/react-components";
import QuoteCheckPanel from "./QuoteCheckPanel";
import RoundingPanel from "./RoundingPanel";
import SummaryPanel from "./SummaryPanel";
import { PricingGateway } from "../../../application/pricingGateway";
import { preferredTable } from "../../../application/quoteTableSelection";
import { QuoteTableInfo, WorkbookGateway } from "../../../application/workbookGateway";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRICING_STRINGS } from "../../../shared/strings.pricing.vi";
import { STRINGS } from "../../../shared/strings.vi";
import { LibrarySnapshot } from "../../../domain/library/types";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXL },
  row: { display: "flex", alignItems: "flex-end", gap: tokens.spacingHorizontalS },
});

/** Tab "Tính giá" (prompts/10): kiểm tra báo giá, tổng hợp (chiết khấu/thuế), quy tắc làm tròn. */
const PricingView: React.FC<{
  gateway: WorkbookGateway;
  pricing: PricingGateway;
  tablesVersion: number;
  loadLibrary?: () => Promise<LibrarySnapshot>;
}> = ({ gateway, pricing, tablesVersion, loadLibrary }) => {
  const styles = useStyles();
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
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
          <MessageBarBody>{PRICING_STRINGS.check.noTables}</MessageBarBody>
        </MessageBar>
      )}
      {tables !== null && tables.length > 0 && (
        <div className={styles.row}>
          <Field label={PRICING_STRINGS.check.table}>
            <Select value={tableName} onChange={(_e, d) => setTableName(d.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {STRINGS.append.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                  {t.headersMatch ? "" : STRINGS.append.headersChangedOption}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="small" onClick={() => void load()}>
            {STRINGS.append.reloadTables}
          </Button>
        </div>
      )}
      {tableName && <QuoteCheckPanel pricing={pricing} tableName={tableName} loadLibrary={loadLibrary} />}
      {tableName && <Divider />}
      {tableName && <SummaryPanel pricing={pricing} tableName={tableName} />}
      <Divider />
      <RoundingPanel pricing={pricing} />
    </div>
  );
};

export default PricingView;
