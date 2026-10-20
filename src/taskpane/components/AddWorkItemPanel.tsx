import * as React from "react";
import {
  Body1,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "./ConfirmDialog";
import { describeBlocker } from "../../application/blockerMessages";
import { AppendPlan, executeAppend, planAppend } from "../../application/quoteService";
import { QuoteTableInfo, WorkbookGateway } from "../../application/workbookGateway";
import {
  DraftError,
  DraftField,
  EMPTY_DRAFT,
  WorkItemDraftInput,
  validateWorkItemDraft,
} from "../../domain/workItemDraft";
import { describeOfficeError } from "../../office/officeErrors";
import { qualifiedAddress } from "../../shared/a1";
import { STRINGS } from "../../shared/strings.vi";

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "confirm"; plan: AppendPlan; row: (string | number)[] }
  | { kind: "blocked"; plan: AppendPlan }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  actions: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
});

const FIELDS: { field: DraftField; label: string; wide?: boolean; numeric?: boolean }[] = [
  { field: "code", label: STRINGS.append.code },
  { field: "group", label: STRINGS.append.group },
  { field: "description", label: STRINGS.append.descriptionField, wide: true },
  { field: "unit", label: STRINGS.append.unit },
  { field: "quantity", label: STRINGS.append.quantity, numeric: true },
  { field: "unitPrice", label: STRINGS.append.unitPrice, numeric: true },
  { field: "notes", label: STRINGS.append.notes, wide: true },
];

const AddWorkItemPanel: React.FC<{ gateway: WorkbookGateway; tablesVersion: number }> = ({
  gateway,
  tablesVersion,
}) => {
  const styles = useStyles();
  const s = STRINGS.append;
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [draft, setDraft] = React.useState<WorkItemDraftInput>(EMPTY_DRAFT);
  const [errors, setErrors] = React.useState<DraftError[]>([]);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });

  const loadTables = React.useCallback(async () => {
    try {
      const list = await gateway.listQuoteTables();
      setTables(list);
      setTableName((current) =>
        list.some((t) => t.tableName === current)
          ? current
          : (list.find((t) => t.headersMatch) ?? list[0])?.tableName ?? ""
      );
    } catch (error) {
      setTables([]);
      setPhase({ kind: "error", message: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    void loadTables();
  }, [loadTables, tablesVersion]);

  const execute = async (plan: AppendPlan, row: (string | number)[]) => {
    setPhase({ kind: "working" });
    try {
      const result = await executeAppend(gateway, plan, [row], {
        shift: plan.status === "needsShiftConfirmation",
      });
      if (result.status === "changed") {
        setPhase({ kind: "warning", message: s.changed });
        return;
      }
      setPhase({ kind: "success", message: s.added(qualifiedAddress(result.rows.sheetName, result.rows.address)) });
      setDraft(EMPTY_DRAFT);
      void loadTables();
    } catch (error) {
      setPhase({ kind: "error", message: describeOfficeError(error) });
    }
  };

  const submit = async () => {
    const validation = validateWorkItemDraft(draft, tableName);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);
    setPhase({ kind: "working" });
    try {
      const plan = await planAppend(gateway, tableName);
      if (plan.status === "blocked") {
        setPhase({ kind: "blocked", plan });
      } else if (plan.status === "ready") {
        await execute(plan, validation.row);
      } else {
        setPhase({ kind: "confirm", plan, row: validation.row });
      }
    } catch (error) {
      setPhase({ kind: "error", message: describeOfficeError(error) });
    }
  };

  const errorFor = (field: DraftField) => errors.find((e) => e.field === field)?.message;

  return (
    <section className={styles.root} aria-labelledby="cq-append-title">
      <Subtitle2 as="h2" id="cq-append-title">
        {s.title}
      </Subtitle2>
      <Body1>{s.description}</Body1>

      {tables === null && <Spinner size="tiny" />}
      {tables !== null && tables.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>{s.noTables}</MessageBarBody>
        </MessageBar>
      )}

      {tables !== null && tables.length > 0 && (
        <>
          <Field label={s.table}>
            <Select value={tableName} onChange={(_e, data) => setTableName(data.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {s.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                  {t.headersMatch ? "" : s.headersChangedOption}
                </option>
              ))}
            </Select>
          </Field>

          <div className={styles.grid}>
            {FIELDS.map(({ field, label, numeric }) => (
              <Field
                key={field}
                label={label}
                required={field === "description"}
                validationMessage={errorFor(field)}
                hint={numeric ? s.numberHint : undefined}
              >
                <Input
                  value={draft[field]}
                  inputMode={numeric ? "decimal" : undefined}
                  onChange={(_e, data) => setDraft((d) => ({ ...d, [field]: data.value }))}
                />
              </Field>
            ))}
          </div>

          <div className={styles.actions}>
            <Button appearance="primary" onClick={() => void submit()} disabled={phase.kind === "working" || !tableName}>
              {phase.kind === "working" ? s.working : s.submit}
            </Button>
            {phase.kind === "working" && <Spinner size="tiny" aria-label={s.working} />}
          </div>
        </>
      )}

      <Button size="small" onClick={() => void loadTables()}>
        {s.reloadTables}
      </Button>

      {phase.kind === "blocked" && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{s.blockedTitle}</MessageBarTitle>
            {phase.plan.inspection.blockers.map(describeBlocker).join(" ")}
          </MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "success" && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "warning" && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "error" && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{s.failed}</MessageBarTitle>
            {phase.message}
          </MessageBarBody>
        </MessageBar>
      )}

      {phase.kind === "confirm" && (
        <ConfirmDialog
          open
          title={s.confirmShiftTitle}
          body={
            <p>
              {s.confirmShiftBody(
                phase.plan.inspection.cellsBelow.count,
                phase.plan.inspection.cellsBelow.sample.join(", ")
              )}
            </p>
          }
          confirmLabel={s.confirmShift}
          cancelLabel={STRINGS.create.cancel}
          onConfirm={() => void execute(phase.plan, phase.row)}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}
    </section>
  );
};

export default AddWorkItemPanel;
