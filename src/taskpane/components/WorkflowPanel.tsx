import * as React from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { PricingGateway } from "../../application/pricingGateway";
import { preferredTable } from "../../application/quoteTableSelection";
import { QuoteTableInfo, WorkbookGateway } from "../../application/workbookGateway";
import { todayIso } from "../../domain/library/dates";
import { QuoteCheckResult, checkQuote } from "../../domain/pricing/quoteCheck";
import { InfoSummary, summarizeInfo } from "../../domain/quoteInfo";
import { QuoteFacts, StepKey, StepState, quoteFacts, workflowSteps } from "../../domain/workflow";
import { describeOfficeError } from "../../office/officeErrors";
import { STRINGS } from "../../shared/strings.vi";
import { WORKFLOW_STRINGS } from "../../shared/strings.workflow.vi";
import { View } from "../navigation";
import { formatMoney } from "./library/common";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    alignItems: "flex-start",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  text: { flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: tokens.spacingHorizontalS },
});

const BADGE: Record<StepState, "success" | "informative" | "warning" | "subtle"> = {
  done: "success",
  todo: "informative",
  attention: "warning",
  optional: "subtle",
};

interface Status {
  table: QuoteTableInfo | null;
  info: InfoSummary | null;
  facts: QuoteFacts | null;
  check: QuoteCheckResult | null;
  checkedAt: string;
}

/** Hướng dẫn quy trình báo giá (prompts/07) với tình trạng đọc trực tiếp từ workbook. */
const WorkflowPanel: React.FC<{
  gateway: WorkbookGateway;
  pricing: PricingGateway;
  tablesVersion: number;
  onNavigate: (view: View, focusId: string) => void;
}> = ({ gateway, pricing, tablesVersion, onNavigate }) => {
  const styles = useStyles();
  const s = WORKFLOW_STRINGS.flow;
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [status, setStatus] = React.useState<Status | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const tableRef = React.useRef(tableName);
  tableRef.current = tableName;

  const refresh = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await gateway.listQuoteTables();
      setTables(list);
      const name = preferredTable(list, tableRef.current);
      setTableName(name);
      const table = list.find((t) => t.tableName === name) ?? null;
      let info: InfoSummary | null = null;
      let facts: QuoteFacts | null = null;
      let check: QuoteCheckResult | null = null;
      if (table && table.headersMatch) {
        const [infoRead, snapshot] = await Promise.all([gateway.readQuoteInfo(name), pricing.readQuoteSnapshot(name)]);
        info = summarizeInfo(infoRead.cells, todayIso());
        facts = quoteFacts(snapshot);
        check = checkQuote(snapshot);
      }
      setStatus({ table, info, facts, check, checkedAt: new Date().toLocaleTimeString("vi-VN") });
    } catch (e) {
      setError(describeOfficeError(e));
    } finally {
      setBusy(false);
    }
  }, [gateway, pricing]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, tablesVersion, tableName]);

  const steps = status
    ? workflowSteps({
        hasTable: status.table !== null,
        headersMatch: status.table?.headersMatch ?? false,
        info: status.info,
        facts: status.facts,
        check: status.check,
      })
    : [];

  const detail = (key: StepKey): string => {
    const d = s.details;
    if (!status) {
      return "";
    }
    const { table, info, facts, check } = status;
    switch (key) {
      case "template":
        return !table ? d.noTable : table.headersMatch ? d.table(table.tableName, table.sheetName) : d.headersChanged;
      case "info":
        return info
          ? [
              d.info(info.filled, info.total),
              info.missingLabels.length > 0 ? d.infoMissingLabels(info.missingLabels.length) : "",
              info.expired ? WORKFLOW_STRINGS.info.expired(info.expired) : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "";
      case "items":
        return facts ? d.items(facts.itemRows) : "";
      case "prices":
        return facts ? d.prices(facts.missingQuantity, facts.missingPrice) : "";
      case "check":
        return check
          ? d.check(
              check.issues.filter((i) => i.severity === "error").length,
              check.issues.filter((i) => i.severity === "warning").length
            )
          : "";
      case "summary":
        return !facts || facts.summary.kind === "none"
          ? d.summaryNone
          : facts.summary.kind === "error"
            ? d.summaryError(facts.summary.error)
            : d.summaryTotal(formatMoney(facts.summary.value, ""));
      case "finish":
        return d.finish;
    }
  };

  const action = (key: StepKey): { label: string; run: () => void } | null => {
    const a = s.actions;
    switch (key) {
      case "template":
        return status?.table
          ? { label: a.goTo, run: () => void gateway.selectQuoteTable(status.table!.tableName).catch(() => undefined) }
          : { label: a.create, run: () => onNavigate("quote", "cq-create-title") };
      case "info":
        return status?.table ? { label: a.info, run: () => onNavigate("quote", "cq-info-title") } : null;
      case "items":
      case "prices":
        return status?.table ? { label: a.items, run: () => onNavigate("quote", "cq-append-title") } : null;
      case "check":
        return status?.table ? { label: a.check, run: () => onNavigate("pricing", "cq-check-title") } : null;
      case "summary":
        return status?.table ? { label: a.summary, run: () => onNavigate("pricing", "cq-summary-title") } : null;
      case "finish":
        return status?.table ? { label: a.print, run: () => onNavigate("print", "cq-terms-title") } : null;
    }
  };

  return (
    <section className={styles.root} aria-labelledby="cq-flow-title">
      <Subtitle2 as="h2" id="cq-flow-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      <div className={styles.row}>
        {tables !== null && tables.length > 1 && (
          <Field label={s.table}>
            <Select value={tableName} onChange={(_e, d) => setTableName(d.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {STRINGS.append.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button disabled={busy} onClick={() => void refresh()}>
          {s.refresh}
        </Button>
        {busy && <Spinner size="tiny" />}
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {status && (
        <>
          <ol className={styles.list} aria-label={s.title}>
            {steps.map((step) => {
              const act = action(step.key);
              return (
                <li key={step.key} className={styles.item}>
                  <Badge appearance="tint" color={BADGE[step.state]}>
                    {s.states[step.state]}
                  </Badge>
                  <div className={styles.text}>
                    <Body1>
                      <strong>{s.steps[step.key]}</strong>
                    </Body1>
                    <Caption1>{detail(step.key)}</Caption1>
                  </div>
                  {act && (
                    <Button size="small" onClick={act.run}>
                      {act.label}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
          <Caption1>{s.checkedAt(status.checkedAt)}</Caption1>
          <Caption1>{s.noStatus}</Caption1>
        </>
      )}
    </section>
  );
};

export default WorkflowPanel;
