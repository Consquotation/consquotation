import * as React from "react";
import {
  Body1,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { hintLabel } from "./hintLabel";
import { preferredTable } from "../../application/quoteTableSelection";
import {
  QuoteInfoRead,
  QuoteTableInfo,
  TargetChangedError,
  WorkbookGateway,
} from "../../application/workbookGateway";
import { todayIso } from "../../domain/library/dates";
import {
  INFO_FIELDS,
  InfoKey,
  infoDisplayValue,
  planInfoWrites,
  summarizeInfo,
} from "../../domain/quoteInfo";
import { describeOfficeError, describeWriteError } from "../../office/officeErrors";
import { STRINGS } from "../../shared/strings.vi";
import { WORKFLOW_STRINGS } from "../../shared/strings.workflow.vi";
import { useExclusive } from "../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    // Ô có gợi ý/lỗi cao hơn không kéo giãn các ô cùng hàng.
    alignItems: "start",
  },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
});

type Values = Record<InfoKey, string>;
type Message = { intent: "success" | "warning" | "error" | "info"; text: string } | null;

function valuesOf(read: QuoteInfoRead): Values {
  return Object.fromEntries(
    INFO_FIELDS.map((field) => {
      const cell = read.cells.find((c) => c.key === field.key)!;
      return [field.key, cell.found ? infoDisplayValue(field, cell) : ""];
    })
  ) as Values;
}

/** Bước 4 của quy trình (prompts/07): nhập thông tin báo giá; đọc/ghi trực tiếp khối thông tin trên sheet. */
const QuoteInfoPanel: React.FC<{ gateway: WorkbookGateway; tablesVersion: number }> = ({
  gateway,
  tablesVersion,
}) => {
  const styles = useStyles();
  const s = WORKFLOW_STRINGS.info;
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [read, setRead] = React.useState<QuoteInfoRead | null>(null);
  const [current, setCurrent] = React.useState<Values | null>(null);
  const [input, setInput] = React.useState<Values | null>(null);
  const [errors, setErrors] = React.useState<{ key: InfoKey; message: string }[]>([]);
  const [message, setMessage] = React.useState<Message>(null);
  const [busy, setBusy] = React.useState(false);
  const exclusive = useExclusive();
  const tableRef = React.useRef(tableName);
  tableRef.current = tableName;

  const loadTables = React.useCallback(async () => {
    try {
      const list = await gateway.listQuoteTables();
      setTables(list);
      setTableName(preferredTable(list, tableRef.current));
    } catch (error) {
      setTables([]);
      setMessage({ intent: "error", text: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    void loadTables();
  }, [loadTables, tablesVersion]);

  /**
   * Đọc lại từ sheet. `edited` (khi có): các mục người dùng đã sửa trong form — giữ nguyên;
   * mục còn lại lấy giá trị mới trên sheet, để lần Lưu sau không ghi đè thay đổi của người khác.
   */
  const loadInfo = React.useCallback(
    async (edited?: Partial<Values>) => {
      if (!tableRef.current) {
        return;
      }
      const info = await gateway.readQuoteInfo(tableRef.current);
      const values = valuesOf(info);
      setRead(info);
      setCurrent(values);
      setInput({ ...values, ...(edited ?? {}) });
    },
    [gateway]
  );

  React.useEffect(() => {
    setMessage(null);
    setErrors([]);
    setRead(null);
    loadInfo().catch((error) => setMessage({ intent: "error", text: describeOfficeError(error) }));
  }, [tableName, loadInfo]);

  const save = () =>
    exclusive(async () => {
      if (!read || !input || !current) {
        return;
      }
      const plan = planInfoWrites(input, current);
      setErrors(plan.errors);
      if (plan.errors.length > 0) {
        setMessage({ intent: "error", text: s.errors });
        return;
      }
      if (plan.writes.length === 0) {
        setMessage({ intent: "info", text: s.noChange });
        return;
      }
      setBusy(true);
      try {
        await gateway.writeQuoteInfo(tableName, plan.writes, read.fingerprint);
        await loadInfo();
        setMessage({ intent: "success", text: s.saved(plan.writes.length) });
      } catch (error) {
        if (error instanceof TargetChangedError) {
          const edited = Object.fromEntries(
            INFO_FIELDS.filter((f) => input[f.key] !== current[f.key]).map((f) => [
              f.key,
              input[f.key],
            ])
          ) as Partial<Values>;
          await loadInfo(edited);
          setMessage({ intent: "warning", text: s.changed });
        } else {
          setMessage({ intent: "error", text: describeWriteError(error) });
        }
      } finally {
        setBusy(false);
      }
    });

  const summary = read ? summarizeInfo(read.cells, todayIso()) : null;
  const errorOf = (key: InfoKey) => errors.find((e) => e.key === key)?.message;

  return (
    <section className={styles.root} aria-labelledby="cq-info-title">
      <Subtitle2 as="h2" id="cq-info-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      {tables === null && <Spinner size="tiny" />}
      {tables !== null && tables.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>{s.noTables}</MessageBarBody>
        </MessageBar>
      )}
      {tables !== null && tables.length > 0 && (
        <form
          noValidate
          className={styles.root}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={s.table}>
            <Select value={tableName} onChange={(_e, d) => setTableName(d.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {STRINGS.append.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                </option>
              ))}
            </Select>
          </Field>
          {read?.sheetProtected && (
            <MessageBar intent="warning">
              <MessageBarBody>{s.protected}</MessageBarBody>
            </MessageBar>
          )}
          {summary?.expired && (
            <MessageBar intent="warning">
              <MessageBarBody>{s.expired(summary.expired)}</MessageBarBody>
            </MessageBar>
          )}
          {read && input ? (
            <div className={styles.grid}>
              {INFO_FIELDS.map((field) => {
                const found = read.cells.find((c) => c.key === field.key)?.found ?? false;
                // Mục thêm ở bản 1.11.0 không có trên sheet tạo trước đó: chỉ gợi ý, không cảnh báo.
                const optionalMissing = !found && field.addedLater;
                return (
                  <Field
                    key={field.key}
                    label={hintLabel(
                      field.label.replace(/:$/, ""),
                      optionalMissing
                        ? s.addedLater(field.label)
                        : field.type === "date" && found
                          ? s.dateHint
                          : undefined
                    )}
                    validationMessage={
                      errorOf(field.key) ?? (found || optionalMissing ? undefined : s.notFound)
                    }
                    validationState={
                      errorOf(field.key) ? "error" : found || optionalMissing ? "none" : "warning"
                    }
                  >
                    <Input
                      value={input[field.key]}
                      disabled={!found || read.sheetProtected}
                      inputMode={field.type === "date" ? "numeric" : undefined}
                      placeholder={field.type === "date" ? "dd/mm/yyyy" : undefined}
                      onChange={(_e, d) =>
                        setInput((v) => (v ? { ...v, [field.key]: d.value } : v))
                      }
                    />
                  </Field>
                );
              })}
            </div>
          ) : (
            <Spinner size="tiny" />
          )}
          <div className={styles.row}>
            <Button
              type="submit"
              appearance="primary"
              disabled={busy || !read || read.sheetProtected}
            >
              {s.save}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                loadInfo().then(
                  () => setMessage(null),
                  (error) => setMessage({ intent: "error", text: describeOfficeError(error) })
                )
              }
            >
              {s.reload}
            </Button>
            {busy && <Spinner size="tiny" />}
          </div>
        </form>
      )}
      {message && (
        <MessageBar
          intent={message.intent}
          layout="multiline"
          politeness={message.intent === "error" ? "assertive" : "polite"}
        >
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}
    </section>
  );
};

export default QuoteInfoPanel;
