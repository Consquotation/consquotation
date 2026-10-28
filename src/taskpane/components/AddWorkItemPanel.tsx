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
import { hintLabel } from "./hintLabel";
import ConfirmDialog from "./ConfirmDialog";
import { describeBlocker } from "../../application/blockerMessages";
import { AppendPlan, executeAppend, planAppend } from "../../application/quoteService";
import { defaultInsertPosition, preferredTable } from "../../application/quoteTableSelection";
import { InsertPosition, QuoteTableInfo, WorkbookGateway } from "../../application/workbookGateway";
import {
  DraftError,
  DraftField,
  EMPTY_DRAFT,
  WorkItemDraftInput,
  validateWorkItemDraft,
} from "../../domain/workItemDraft";
import { describeOfficeError, describeWriteError } from "../../office/officeErrors";
import { qualifiedAddress } from "../../shared/a1";
import { STRINGS } from "../../shared/strings.vi";
import { LIBRARY_STRINGS } from "../../shared/strings.library.vi";
import { InsertWarning } from "../../domain/library/toQuote";
import { formatIsoDate } from "../../domain/library/dates";
import { useExclusive } from "../useExclusive";
import CompositionPicker from "./pricing/CompositionPicker";
import { AnalysisPrice, PricingGateway } from "../../application/pricingGateway";
import {
  CompositionLine,
  PriceSelection,
  buildComposition,
  compositionNote,
  defaultSelection,
} from "../../domain/pricing/composition";
import { DEFAULT_ROUNDING, RoundingConfig } from "../../domain/pricing/rounding";
import { WorkItem } from "../../domain/library/types";
import { QUOTE_COLUMNS } from "../../domain/quoteTemplate";
import { PRICING_STRINGS } from "../../shared/strings.pricing.vi";
import { useSelectionChanged } from "../useSelectionChanged";
import { QuotationService } from "../../application/quotationService";
import { COST_TYPES } from "../../domain/quotation/lines";
import {
  compositionBreakdown,
  libraryItem,
  manualItem,
  normItem,
} from "../../domain/quotation/fromInsert";
import { CostType, QuotationItemRecord } from "../../domain/quotation/model";
import { BREAKDOWN_COLUMNS, LINE_ID_HEADER, extensionHeader } from "../../domain/quoteTemplate";
import { QUOTATION_UI } from "../../shared/strings.quotation.vi";
import { randomId } from "../../shared/uuid";

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "confirm"; plan: AppendPlan; row: (string | number)[]; composition: boolean }
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
    // Ô có gợi ý/lỗi cao hơn không kéo giãn các ô cùng hàng.
    alignItems: "start",
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

/** Dữ liệu điền sẵn từ "Thư viện của tôi" (prompts/08); `nonce` đổi mỗi lần bấm Chèn. */
export interface LibraryPrefill {
  nonce: number;
  code: string;
  /** Công tác trong thư viện (để chụp nguồn và giá vào hồ sơ báo giá). */
  item: WorkItem;
  draft: WorkItemDraftInput;
  warnings: InsertWarning[];
  /** Có khi công tác có định mức trong thư viện: cho phép phân tích đơn giá (prompts/10). */
  composition?: { item: WorkItem; lines: CompositionLine[] };
}

type PriceMethodChoice = "library" | "composition";

const UNIT_PRICE_INDEX = QUOTE_COLUMNS.findIndex((c) => c.key === "unitPrice");
const NOTES_INDEX = QUOTE_COLUMNS.findIndex((c) => c.key === "notes");

function describeInsertWarning(warning: InsertWarning): string {
  switch (warning.kind) {
    case "missingPrice":
      return LIBRARY_STRINGS.insert.missingPrice;
    case "expired":
      return LIBRARY_STRINGS.insert.expired(formatIsoDate(warning.effectiveTo));
    case "notYetEffective":
      return LIBRARY_STRINGS.insert.notYetEffective(formatIsoDate(warning.effectiveFrom));
  }
}

const AddWorkItemPanel: React.FC<{
  gateway: WorkbookGateway;
  pricing?: PricingGateway;
  tablesVersion: number;
  onAppended: () => void;
  /** Ghi nhận dòng mới vào hồ sơ báo giá (giai đoạn 17); không có thì chỉ ghi sheet như trước. */
  quotation?: QuotationService;
  prefill?: LibraryPrefill | null;
  onPrefillConsumed?: () => void;
}> = ({ gateway, pricing, tablesVersion, onAppended, quotation, prefill, onPrefillConsumed }) => {
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
  const [fromLibrary, setFromLibrary] = React.useState<LibraryPrefill | null>(null);
  const p = PRICING_STRINGS.composition;
  const [priceMethod, setPriceMethod] = React.useState<PriceMethodChoice>("library");
  const [selection, setSelection] = React.useState<PriceSelection>({});
  const [rounding, setRounding] = React.useState<RoundingConfig>(DEFAULT_ROUNDING);
  const [existingAnalysis, setExistingAnalysis] = React.useState<AnalysisPrice | null>(null);
  const composition = fromLibrary?.composition;
  const usingComposition = composition !== undefined && priceMethod === "composition";
  const compositionResult = React.useMemo(
    () =>
      composition
        ? buildComposition(composition.item, composition.lines, selection, rounding.unitPrice)
        : null,
    [composition, selection, rounding]
  );

  function choosePriceMethod(
    method: PriceMethodChoice,
    source: LibraryPrefill | null = fromLibrary
  ) {
    setPriceMethod(method);
    if (!source?.composition) {
      return;
    }
    const { item, lines } = source.composition;
    // Ô Đơn giá và ghi chú truy vết đổi theo phương pháp (prompts/10: hiển thị phương pháp và nguồn giá).
    setDraft((d) =>
      method === "composition"
        ? { ...d, unitPrice: "", notes: compositionNote(item, lines.length, "") }
        : { ...d, unitPrice: source.draft.unitPrice, notes: source.draft.notes }
    );
  }

  // Bấm "Chèn vào báo giá" ở thư viện: điền sẵn form; người dùng nhập Khối lượng rồi bấm Thêm.
  React.useEffect(() => {
    if (prefill) {
      setDraft(prefill.draft);
      setErrors([]);
      setPhase({ kind: "idle" });
      setFromLibrary(prefill);
      setExistingAnalysis(null);
      if (prefill.composition) {
        const { item, lines } = prefill.composition;
        setSelection(defaultSelection(lines));
        // Người dùng tự chọn cách xác định đơn giá; mặc định phân tích khi thư viện chưa có đơn giá.
        choosePriceMethod(item.unitPrice === null ? "composition" : "library", prefill);
        if (pricing) {
          pricing.readRounding().then(setRounding, () => undefined);
          pricing
            .findAnalysis(item.code)
            .then(setExistingAnalysis, () => setExistingAnalysis(null));
        }
      } else {
        setPriceMethod("library");
      }
      // Dùng một lần: quay lại tab Báo giá sau này không bị điền lại công tác cũ.
      onPrefillConsumed?.();
    }
  }, [prefill?.nonce]);

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

  const execute = async (
    plan: AppendPlan,
    baseRow: (string | number)[],
    withComposition: boolean
  ) => {
    setPhase({ kind: "working" });
    try {
      let row = baseRow;
      let note = "";
      let incomplete = false;
      // Mã dòng ổn định (không phụ thuộc số hàng Excel) và mục hồ sơ chụp nguồn gốc của dòng.
      const lineId = randomId();
      const extras: Record<string, string | number> = { [LINE_ID_HEADER]: lineId };
      const identity = {
        id: lineId,
        code: draft.code.trim(),
        name: draft.description.trim(),
        unit: draft.unit.trim(),
        now: new Date().toISOString(),
      };
      let item: QuotationItemRecord =
        fromLibrary && !withComposition
          ? libraryItem(identity, fromLibrary.item)
          : manualItem(identity);
      let breakdown: Record<CostType, number> | null = null;
      if (withComposition && composition && compositionResult && pricing) {
        // Ghi phân tích (hoặc dùng phân tích có sẵn) rồi lấy đơn giá do chính Excel tính.
        const written = await pricing.writeAnalysis(composition.item.code, compositionResult.rows);
        const price = written.price;
        item = normItem(
          identity,
          composition.item,
          composition.lines,
          selection,
          compositionResult.rows
        );
        // Đơn giá theo loại chỉ ghi khi khối phân tích vừa được ghi từ chính các thành phần này và đủ giá.
        breakdown =
          written.status === "written" && price.kind === "value"
            ? compositionBreakdown(composition.lines, selection)
            : null;
        if (breakdown) {
          for (const t of COST_TYPES) {
            extras[extensionHeader(BREAKDOWN_COLUMNS[t])] = breakdown[t];
          }
        }
        row = [...baseRow];
        row[UNIT_PRICE_INDEX] = price.kind === "value" ? price.value : "";
        row[NOTES_INDEX] =
          "'" +
          compositionNote(composition.item, composition.lines.length, compositionResult.currency);
        incomplete = price.kind !== "value";
        note = [
          p.analysisSheet(written.sheetName),
          written.status === "exists" && existingAnalysis === null
            ? p.existsUsed(composition.item.code)
            : "",
          price.kind === "missing"
            ? p.addedMissing
            : price.kind === "error"
              ? p.addedError(price.error)
              : "",
        ]
          .filter(Boolean)
          .join(" ");
      }
      const result = await executeAppend(
        gateway,
        plan,
        [row],
        { shift: plan.status === "needsShiftConfirmation" },
        [extras]
      );
      if (result.status === "changed") {
        setPhase({
          kind: "warning",
          message: withComposition ? p.analysisWrittenButChanged : s.changed,
        });
        return;
      }
      const added = s.added(qualifiedAddress(result.rows.sheetName, result.rows.address));
      let registerNote = "";
      if (quotation) {
        const registered = await quotation.registerInsertedLine(result.rows.tableName, {
          ...item,
          writtenBreakdown: breakdown,
        });
        // Bảng cũ chưa có cột Mã dòng: không có hồ sơ theo dòng, không cần báo.
        if (!registered.saved && registered.reason !== "notOnSheet") {
          registerNote = QUOTATION_UI.registerFailed(registered.reason);
        }
      }
      const message = [added, note, registerNote].filter(Boolean).join(" ");
      setPhase({ kind: incomplete || registerNote ? "warning" : "success", message });
      // Giữ Nhóm công tác và Đơn vị tính — thường lặp lại ở dòng kế tiếp.
      setDraft((d) => ({ ...EMPTY_DRAFT, group: d.group, unit: d.unit }));
      if (fromLibrary) {
        setFromLibrary(null);
        // Đánh dấu workbook đã dùng thư viện để cảnh báo nếu sau này thư viện cục bộ trống bất thường.
        gateway.markLibraryUsed().catch(() => undefined);
      }
      onAppended();
    } catch (error) {
      setPhase({ kind: "error", message: describeWriteError(error) });
    }
  };

  const submit = async () => {
    if (
      usingComposition &&
      existingAnalysis === null &&
      compositionResult &&
      !compositionResult.ok
    ) {
      setPhase({ kind: "error", message: compositionResult.errors.join(" ") });
      return;
    }
    const validation = validateWorkItemDraft(
      usingComposition ? { ...draft, unitPrice: "" } : draft,
      tableName
    );
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
        await execute(plan, validation.row, usingComposition);
      } else {
        setPhase({ kind: "confirm", plan, row: validation.row, composition: usingComposition });
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

      {fromLibrary && (
        <MessageBar
          intent={fromLibrary.warnings.length > 0 ? "warning" : "info"}
          layout="multiline"
          politeness="polite"
        >
          <MessageBarBody>
            {LIBRARY_STRINGS.insert.prefilled(fromLibrary.code)}
            {fromLibrary.warnings.map((w) => (
              <div key={w.kind}>{describeInsertWarning(w)}</div>
            ))}
          </MessageBarBody>
        </MessageBar>
      )}
      {tables === null && <Spinner size="tiny" label={s.loadingTables} />}
      {tables !== null && tables.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>{s.noTables}</MessageBarBody>
        </MessageBar>
      )}

      {tables !== null && tables.length > 0 && (
        // <form> để Enter trong ô nhập gửi biểu mẫu (dùng được bằng bàn phím).
        <form
          noValidate
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
            label={hintLabel(s.position, positionHint.kind === "hint" ? positionHint.text : undefined)}
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

          {composition && (
            <Field label={PRICING_STRINGS.method.label}>
              <RadioGroup
                value={priceMethod}
                onChange={(_e, data) => choosePriceMethod(data.value as PriceMethodChoice)}
              >
                <Radio
                  value="library"
                  label={
                    composition.item.unitPrice === null
                      ? PRICING_STRINGS.method.libraryNone
                      : PRICING_STRINGS.method.library
                  }
                />
                <Radio
                  value="composition"
                  label={PRICING_STRINGS.method.composition(composition.lines.length)}
                />
              </RadioGroup>
            </Field>
          )}
          {usingComposition && composition && compositionResult && (
            <CompositionPicker
              code={composition.item.code}
              lines={composition.lines}
              selection={selection}
              onChange={setSelection}
              result={compositionResult}
              rule={rounding.unitPrice}
              existing={existingAnalysis}
            />
          )}

          <div className={styles.grid}>
            {FIELDS.map(({ field, label, numeric }) => (
              <Field
                key={field}
                label={hintLabel(
                  label,
                  field === "unitPrice" && usingComposition
                    ? p.unitPriceLocked
                    : numeric && !errorFor(field)
                      ? s.numberHint
                      : undefined
                )}
                required={field === "description"}
                validationMessage={errorFor(field)}
              >
                <Input
                  value={draft[field]}
                  disabled={field === "unitPrice" && usingComposition}
                  inputMode={numeric ? "decimal" : undefined}
                  onChange={(_e, data) => setDraft((d) => ({ ...d, [field]: data.value }))}
                />
              </Field>
            ))}
          </div>

          <div className={styles.actions}>
            <Button
              type="submit"
              appearance="primary"
              disabled={phase.kind === "working" || !tableName}
            >
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
          onConfirm={() => void exclusive(() => execute(phase.plan, phase.row, phase.composition))}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}
    </section>
  );
};

export default AddWorkItemPanel;
