import * as React from "react";
import {
  Body1,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "./ConfirmDialog";
import { describeBlocker } from "../../application/blockerMessages";
import { AppendPlan, executeAppend, planAppend } from "../../application/quoteService";
import { defaultInsertPosition, preferredTable } from "../../application/quoteTableSelection";
import {
  InsertPosition,
  QuoteTableInfo,
  WorkbookGateway,
} from "../../application/workbookGateway";
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
import { useExclusive } from "../useExclusive";
import { useSelectionChanged } from "../useSelectionChanged";

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

const AddWorkItemPanel: React.FC<{
  gateway: WorkbookGateway;
  tablesVersion: number;
  onAppended: () => void;
}> = ({ gateway, tablesVersion, onAppended }) => {
  const styles = useStyles();
  const s = STRINGS.append;
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [draft, setDraft] = React.useState<WorkItemDraftInput>(EMPTY_DRAFT);
  const [errors, setErrors] = React.useState<DraftError[]>([]);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [position, setPosition] = React.useState<InsertPosition["kind"]>("end");
  const exclusive = useExclusive();
  const tableNameRef = React.useRef(tableName);
  tableNameRef.current = tableName;

  const loadTables = React.useCallback(async () => {
    try {
      const list = await gateway.listQuoteTables();
      const next = preferredTable(list, tableNameRef.current);
      setTables(list);
      setTableName(next);
      // Mỗi khi vùng chọn đổi: đang chọn ô trong bảng → chèn ngay dưới dòng đó; không thì cuối bảng.
      setPosition(defaultInsertPosition(list.find((t) => t.tableName === next)));
    } catch (error) {
      setTables([]);
      setPhase({ kind: "error", message: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    void loadTables();
  }, [loadTables, tablesVersion]);
  // Bảng có thể bị đổi tên/xóa khi pane mở; vùng chọn đổi thì chọn sẵn lại bảng chứa nó.
  useSelectionChanged(() => void loadTables());

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
      // Giữ Nhóm công tác và Đơn vị tính — thường lặp lại ở dòng kế tiếp.
      setDraft((d) => ({ ...EMPTY_DRAFT, group: d.group, unit: d.unit }));
      onAppended();
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
      const plan = await planAppend(gateway, tableName, { kind: position });
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

  // Cho người dùng thấy trước dòng mới sẽ nằm ở đâu (prompts/05: hiển thị rõ vị trí ghi).
  const selectedTable = tables?.find((t) => t.tableName === tableName);
  const positionHint: { kind: "hint" | "warning"; text: string } =
    position === "end"
      ? { kind: "hint", text: s.positionEndHint }
      : selectedTable?.selectedSheetRow
        ? { kind: "hint", text: s.positionBelowAt(selectedTable.selectedSheetRow) }
        : { kind: "warning", text: s.positionBelowHint };

  return (
    <section className={styles.root} aria-labelledby="cq-append-title">
      <Subtitle2 as="h2" id="cq-append-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.description}</Body1>

      {tables === null && <Spinner size="tiny" label={s.loadingTables} />}
      {tables !== null && tables.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>{s.noTables}</MessageBarBody>
        </MessageBar>
      )}

      {tables !== null && tables.length > 0 && (
        // <form> để Enter trong ô nhập gửi biểu mẫu (dùng được bằng bàn phím).
        <form
          className={styles.root}
          onSubmit={(event) => {
            event.preventDefault();
            void exclusive(submit);
          }}
        >
          <Field label={s.table}>
            <Select
              value={tableName}
              onChange={(_e, data) => {
                setTableName(data.value);
                setPosition(defaultInsertPosition(tables.find((t) => t.tableName === data.value)));
              }}
            >
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {s.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                  {t.headersMatch ? "" : s.headersChangedOption}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={s.position}
            hint={positionHint.kind === "hint" ? positionHint.text : undefined}
            validationState={positionHint.kind === "warning" ? "warning" : "none"}
            validationMessage={positionHint.kind === "warning" ? positionHint.text : undefined}
          >
            <RadioGroup
              value={position}
              onChange={(_e, data) => setPosition(data.value as InsertPosition["kind"])}
            >
              <Radio value="end" label={s.positionEnd} />
              <Radio value="belowSelection" label={s.positionBelow} />
            </RadioGroup>
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
            <Button type="submit" appearance="primary" disabled={phase.kind === "working" || !tableName}>
              {phase.kind === "working" ? s.working : s.submit}
            </Button>
            {phase.kind === "working" && <Spinner size="tiny" aria-label={s.working} />}
          </div>
        </form>
      )}

      <Button size="small" onClick={() => void loadTables()}>
        {s.reloadTables}
      </Button>

      {phase.kind === "blocked" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.blockedTitle}</MessageBarTitle>
            {phase.plan.inspection.blockers.map(describeBlocker).join(" ")}
          </MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "success" && (
        <MessageBar intent="success" layout="multiline" politeness="polite">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "warning" && (
        <MessageBar intent="warning" layout="multiline" politeness="polite">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
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
          onConfirm={() => void exclusive(() => execute(phase.plan, phase.row))}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}
    </section>
  );
};

export default AddWorkItemPanel;
