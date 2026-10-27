import * as React from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import { PricingGateway } from "../../../application/pricingGateway";
import { ExtensionInspection } from "../../../application/quotationGateway";
import {
  QuotationService,
  QuotationView,
  WriteOutcome,
} from "../../../application/quotationService";
import { preferredTable } from "../../../application/quoteTableSelection";
import { QuoteTableInfo, WorkbookGateway } from "../../../application/workbookGateway";
import { normalizeForSearch } from "../../../domain/library/search";
import { rateToPercent } from "../../../domain/library/validation";
import { LineEvaluation } from "../../../domain/quotation/evaluate";
import { CalculationStatus } from "../../../domain/quotation/model";
import { describeOfficeError, describeWriteError } from "../../../office/officeErrors";
import { cellAddress } from "../../../shared/a1";
import { QUOTATION_UI as s } from "../../../shared/strings.quotation.vi";
import { STRINGS } from "../../../shared/strings.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  row: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  card: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  list: {
    listStyleType: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalS,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderLeft: `3px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  itemWarning: { borderLeftColor: tokens.colorPaletteYellowBorderActive },
  itemError: { borderLeftColor: tokens.colorPaletteRedBorderActive },
  wrap: { wordBreak: "break-word" },
  sub: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
  },
  totals: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
  },
  number: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
});

const STATUS_BADGE: Record<CalculationStatus, "success" | "warning" | "danger"> = {
  valid: "success",
  validWithWarnings: "warning",
  invalid: "danger",
};

const STATE_BADGE: Record<
  QuotationView["state"],
  "informative" | "success" | "warning" | "danger"
> = {
  noRecord: "informative",
  draft: "informative",
  completed: "success",
  modifiedAfterCompletion: "warning",
  unreadable: "danger",
};

type Filter = "all" | "invalid" | "warnings";
type Notice = { intent: "success" | "warning" | "error" | "info"; text: string; list?: string[] };

const num = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString("vi-VN", { maximumFractionDigits: 6 })
    : s.missing;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("vi-VN");
};

/** Tab "Công tác": quản lý báo giá theo dòng, trạng thái tính toán, nguồn gốc và đồng bộ với sheet. */
const QuotationItemsView: React.FC<{
  gateway: WorkbookGateway;
  pricing: PricingGateway;
  service: QuotationService;
  tablesVersion: number;
}> = ({ gateway, pricing, service, tablesVersion }) => {
  const styles = useStyles();
  const [tables, setTables] = React.useState<QuoteTableInfo[] | null>(null);
  const [tableName, setTableName] = React.useState("");
  const [view, setView] = React.useState<QuotationView | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [columns, setColumns] = React.useState<ExtensionInspection | null>(null);
  const [confirmColumns, setConfirmColumns] = React.useState(false);
  const [pendingUpdate, setPendingUpdate] = React.useState<LineEvaluation | null>(null);
  const exclusive = useExclusive();
  const current = React.useRef(tableName);
  current.current = tableName;

  const loadTables = React.useCallback(async () => {
    try {
      const list = await gateway.listQuoteTables();
      setTables(list);
      setTableName(preferredTable(list, current.current));
    } catch (error) {
      setTables([]);
      setNotice({ intent: "error", text: describeOfficeError(error) });
    }
  }, [gateway]);

  React.useEffect(() => {
    void loadTables();
  }, [loadTables, tablesVersion]);

  const load = React.useCallback(
    async (name: string, keepNotice = false) => {
      if (!name) {
        setView(null);
        return;
      }
      setLoading(true);
      if (!keepNotice) {
        setNotice(null);
      }
      try {
        const next = await service.load(name);
        setView(next);
        setColumns(
          next.evaluation.missingColumns.length > 0 ? await service.inspectColumns(name) : null
        );
      } catch (error) {
        setView(null);
        setNotice({ intent: "error", text: describeOfficeError(error) });
      } finally {
        setLoading(false);
      }
    },
    [service]
  );

  React.useEffect(() => {
    void load(tableName);
  }, [load, tableName, tablesVersion]);

  /** Chạy thao tác ghi; "changed" → tải lại để người dùng xem dữ liệu mới. */
  const write = <T,>(task: () => Promise<WriteOutcome<T>>, done: (result: T) => Notice) =>
    exclusive(async () => {
      setLoading(true);
      try {
        const outcome = await task();
        if (outcome.status === "changed") {
          setNotice({ intent: "warning", text: s.changed });
        } else if (outcome.status === "blocked") {
          setNotice({ intent: "warning", text: s.completeBlocked, list: outcome.reasons });
        } else {
          setNotice(done(outcome as unknown as T));
        }
      } catch (error) {
        setNotice({ intent: "error", text: describeWriteError(error) });
      } finally {
        setLoading(false);
      }
      await load(tableName, true);
    });

  const addColumns = () =>
    exclusive(async () => {
      setConfirmColumns(false);
      setLoading(true);
      try {
        const added = await service.addColumns(tableName);
        setNotice({ intent: "success", text: s.columns.added(added) });
      } catch (error) {
        setNotice({ intent: "error", text: describeWriteError(error) });
      } finally {
        setLoading(false);
      }
      await load(tableName, true);
    });

  const goTo = (line: LineEvaluation) => {
    if (!view) {
      return;
    }
    pricing
      .goTo(view.sheetName, cellAddress(line.line.sheetRow - 1, view.firstColumnIndex))
      .catch((error) => setNotice({ intent: "error", text: describeOfficeError(error) }));
  };

  const toggle = (row: number) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(row)) {
        next.delete(row);
      } else {
        next.add(row);
      }
      return next;
    });

  const evaluation = view?.evaluation;
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  const visible = (evaluation?.lines ?? []).filter((l) => {
    if (filter === "invalid" && l.result.status !== "invalid") return false;
    if (filter === "warnings" && l.result.status !== "validWithWarnings") return false;
    const haystack = normalizeForSearch(`${l.line.code} ${l.line.description} ${l.line.group}`);
    return words.every((w) => haystack.includes(w));
  });

  const pendingText = view
    ? s.pending(view.pending.assignIds, view.pending.writeBreakdown, view.pending.removeItems)
    : "";
  const canComplete = view !== null && view.blockers.length === 0 && view.state !== "completed";

  const updateBody = (line: LineEvaluation) => {
    const plan = line.plan;
    if (!plan) return "";
    if (plan.kind === "library") {
      return s.updateLibrary(num(plan.oldPrice), num(plan.newPrice));
    }
    return s.updateNorm(
      plan.prices.map(
        (p) =>
          `${p.resourceCode}: ${num(p.oldPrice)} → ${num(p.newPrice)} ${p.currency}/${p.priceUnit}`
      )
    );
  };

  const renderLine = (l: LineEvaluation) => {
    const r = l.result;
    const open = expanded.has(l.line.row);
    const errors = r.issues.filter((i) => i.severity === "error");
    const first = errors[0] ?? r.issues[0];
    const breakdown = l.breakdown?.totals;
    return (
      <li
        key={l.line.row}
        className={`${styles.item} ${r.status === "invalid" ? styles.itemError : r.status === "validWithWarnings" ? styles.itemWarning : ""}`}
      >
        <div className={styles.head}>
          <Text weight="semibold" className={styles.wrap}>
            {s.rowLabel(l.line.sheetRow)} · {l.line.code || "—"}: {l.line.description}
          </Text>
          <Badge appearance="tint" color={STATUS_BADGE[r.status]}>
            {s.lineStatus[r.status]}
          </Badge>
        </div>
        <Caption1 className={styles.wrap}>
          {s.method[l.method]}
          {l.line.group ? ` · ${l.line.group}` : ""} · {num(l.line.quantity.value)} {l.line.unit} ×{" "}
          {num(l.line.unitPrice.value)} = {num(l.line.amount.value)}
        </Caption1>
        {breakdown && (
          <Caption1 className={styles.wrap}>
            {s.breakdown}: {num(breakdown.material)} / {num(breakdown.labor)} /{" "}
            {num(breakdown.machine)} / {num(breakdown.other)}
          </Caption1>
        )}
        {!open && first && (
          <Caption1 className={styles.wrap}>
            {first.severity === "error" ? "Lỗi: " : "Cảnh báo: "}
            {first.message}
            {r.issues.length > 1 ? ` (+${r.issues.length - 1})` : ""}
          </Caption1>
        )}
        {l.changedSinceLastCalc && <Caption1>{s.changedSinceLast}</Caption1>}
        <div className={styles.actions}>
          <Button size="small" onClick={() => toggle(l.line.row)} aria-expanded={open}>
            {open ? s.hideDetails : s.details}
          </Button>
          <Button size="small" onClick={() => goTo(l)}>
            {s.goTo}
          </Button>
          {l.plan && (
            <Button size="small" onClick={() => setPendingUpdate(l)}>
              {s.update}
            </Button>
          )}
        </div>
        {open && (
          <div className={styles.sub}>
            <Caption1 className={styles.wrap}>
              {s.source}:{" "}
              {l.item
                ? [
                    s.method[l.item.pricingMethod],
                    l.item.source?.normCode
                      ? s.sourceNorm(l.item.source.normCode, l.item.source.normVersion)
                      : "",
                    l.item.libraryPrice
                      ? `${num(l.item.libraryPrice.unitPrice)} ${l.item.libraryPrice.currency}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : s.noRecordItem}
            </Caption1>
            <Subtitle2 as="h4">{s.issues}</Subtitle2>
            {r.issues.length === 0 ? (
              <Caption1>{s.noIssues}</Caption1>
            ) : (
              <ul className={styles.sub}>
                {r.issues.map((i, k) => (
                  <li key={k}>
                    <Caption1 className={styles.wrap}>
                      {i.severity === "error" ? "Lỗi: " : "Cảnh báo: "}
                      {i.message}
                      {i.hint ? ` ${i.hint}` : ""}
                    </Caption1>
                  </li>
                ))}
              </ul>
            )}
            {l.method === "norm" && l.item && l.item.components.length > 0 && (
              <>
                <Subtitle2 as="h4">{s.components}</Subtitle2>
                <ul className={styles.sub}>
                  {l.item.components.map((c, k) => (
                    <li key={k}>
                      <Caption1 className={styles.wrap}>
                        {c.resourceCodeSnapshot}: {c.resourceNameSnapshot} ·{" "}
                        {s.componentLine(
                          num(c.appliedConsumption),
                          c.unitSnapshot,
                          num(c.unitPriceSnapshot),
                          num(
                            c.unitPriceSnapshot === null
                              ? null
                              : c.appliedConsumption * c.unitPriceSnapshot
                          )
                        )}
                      </Caption1>
                      <Caption1 className={styles.wrap}>
                        {" "}
                        {s.componentSnapshot(
                          num(c.baseConsumption),
                          c.wasteRate > 0 ? rateToPercent(c.wasteRate) : "",
                          `${num(c.unitPriceSnapshot)} ${c.currency}${c.priceUnitSnapshot ? `/${c.priceUnitSnapshot}` : ""}`
                        )}
                        {c.sourceReference ? ` · ${c.sourceReference}` : ""}
                      </Caption1>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className={styles.root} aria-labelledby="cq-items-title">
      <Subtitle2 as="h2" id="cq-items-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>

      {tables !== null && tables.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>{s.noTables}</MessageBarBody>
        </MessageBar>
      )}
      {tables !== null && tables.length > 0 && (
        <div className={styles.row}>
          <Field label={s.table}>
            <Select value={tableName} onChange={(_e, d) => setTableName(d.value)}>
              {tables.map((t) => (
                <option key={t.tableName} value={t.tableName}>
                  {STRINGS.append.tableOption(t.tableName, t.sheetName, t.dataRowCount)}
                  {t.headersMatch ? "" : STRINGS.append.headersChangedOption}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            size="small"
            disabled={loading}
            onClick={() => void loadTables().then(() => load(tableName))}
          >
            {s.reload}
          </Button>
        </div>
      )}

      {loading && <Spinner size="tiny" label={s.loading} />}
      {notice && (
        <MessageBar intent={notice.intent} layout="multiline">
          <MessageBarBody>
            {notice.text}
            {notice.list && (
              <ul>
                {notice.list.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      {view && evaluation && (
        <>
          <div className={styles.card} aria-label={s.title}>
            <div className={styles.head}>
              <Badge appearance="filled" color={STATE_BADGE[view.state]}>
                {s.state[view.state]}
              </Badge>
              <Caption1>{view.tableName}</Caption1>
            </div>
            <Caption1 className={styles.wrap}>
              {view.state === "unreadable" && view.record.kind === "unreadable"
                ? view.record.message
                : s.stateHint[view.state]}
              {view.state === "completed" &&
              view.record.kind === "ok" &&
              view.record.record.completedAt
                ? ` ${s.completedAt(formatTime(view.record.record.completedAt))}`
                : ""}
            </Caption1>
            {pendingText && (
              <Caption1 className={styles.wrap}>
                {s.pendingLead}
                {pendingText}.
              </Caption1>
            )}
            <div className={styles.actions}>
              <Button
                appearance="primary"
                disabled={loading || !evaluation.hasLineIds || view.state === "unreadable"}
                title={s.recalcHint}
                onClick={() =>
                  void write(
                    () => service.recalculate(view.tableName, evaluation.fingerprint),
                    (r) => ({ intent: "success", text: s.recalcDone(r) })
                  )
                }
              >
                {s.recalc}
              </Button>
              {view.state === "completed" || view.state === "modifiedAfterCompletion" ? (
                <Button
                  disabled={loading}
                  onClick={() =>
                    void write(
                      () => service.reopen(view.tableName),
                      () => ({ intent: "success", text: s.reopened })
                    )
                  }
                >
                  {s.reopen}
                </Button>
              ) : null}
              {view.state !== "completed" && (
                <Button
                  disabled={loading || view.state === "unreadable"}
                  onClick={() =>
                    canComplete
                      ? void write(
                          () => service.complete(view.tableName, evaluation.fingerprint),
                          () => ({ intent: "success", text: s.completed })
                        )
                      : setNotice({
                          intent: "warning",
                          text: s.completeBlocked,
                          list: view.blockers,
                        })
                  }
                >
                  {s.complete}
                </Button>
              )}
            </div>
          </div>

          {columns && columns.missing.length > 0 && (
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>
                <strong>{s.columns.title}</strong> {s.columns.body(columns.missing)}{" "}
                {columns.sheetProtected
                  ? s.columns.protected
                  : columns.cellsRight.count > 0
                    ? s.columns.blockedRight(
                        columns.cellsRight.count,
                        columns.cellsRight.sample.join(", ")
                      )
                    : ""}
                <div>
                  <Button
                    size="small"
                    disabled={loading || columns.sheetProtected || columns.cellsRight.count > 0}
                    onClick={() => setConfirmColumns(true)}
                  >
                    {s.columns.add}
                  </Button>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          <section aria-labelledby="cq-items-summary">
            <Subtitle2 as="h3" id="cq-items-summary">
              {s.summary.title}
            </Subtitle2>
            <Caption1>
              {s.summary.counts(
                evaluation.counts.valid,
                evaluation.counts.validWithWarnings,
                evaluation.counts.invalid
              )}
            </Caption1>
            <div className={styles.totals}>
              <Caption1>{s.summary.total}</Caption1>
              <Caption1 className={styles.number}>
                {evaluation.total.error
                  ? s.summary.totalError(evaluation.total.error)
                  : num(evaluation.total.value)}
              </Caption1>
              <Caption1>{s.summary.computed}</Caption1>
              <Caption1 className={styles.number}>{num(evaluation.computedTotal)}</Caption1>
            </div>
            {evaluation.total.value !== null &&
              evaluation.total.value !== evaluation.computedTotal && (
                <Caption1>{s.summary.mismatch}</Caption1>
              )}
            {evaluation.groups.length > 1 && (
              <>
                <Text size={200} weight="semibold">
                  {s.summary.groups}
                </Text>
                <div className={styles.totals}>
                  {evaluation.groups.map((g) => (
                    <React.Fragment key={g.group}>
                      <Caption1 className={styles.wrap}>
                        {g.group || s.summary.noGroup} ({s.summary.groupLine(g.lines, g.uncomputed)}
                        )
                      </Caption1>
                      <Caption1 className={styles.number}>{num(g.amount)}</Caption1>
                    </React.Fragment>
                  ))}
                </div>
              </>
            )}
            <Caption1 className={styles.wrap}>
              {s.summary.rounding}: {evaluation.roundingPolicy}
            </Caption1>
            {evaluation.tableIssues.length > 0 && (
              <>
                <Text size={200} weight="semibold">
                  {s.summary.tableIssues}
                </Text>
                <ul className={styles.sub}>
                  {evaluation.tableIssues.map((i, k) => (
                    <li key={k}>
                      <Caption1 className={styles.wrap}>
                        {i.location}: {i.message}
                      </Caption1>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <div className={styles.row}>
            <Field label={s.filter.label}>
              <Select value={filter} onChange={(_e, d) => setFilter(d.value as Filter)}>
                <option value="all">{s.filter.all}</option>
                <option value="invalid">{s.filter.invalid}</option>
                <option value="warnings">{s.filter.warnings}</option>
              </Select>
            </Field>
            <Field label={s.filter.search}>
              <Input value={query} onChange={(_e, d) => setQuery(d.value)} />
            </Field>
          </div>

          {evaluation.lines.length === 0 ? (
            <Caption1>{s.empty}</Caption1>
          ) : visible.length === 0 ? (
            <Caption1>{s.noneMatch}</Caption1>
          ) : (
            <ul className={styles.list} aria-label={s.title}>
              {visible.map(renderLine)}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmColumns}
        title={s.columns.confirmTitle}
        body={columns ? s.columns.confirmBody(columns.missing) : ""}
        confirmLabel={s.columns.add}
        cancelLabel={s.cancel}
        onConfirm={() => void addColumns()}
        onCancel={() => setConfirmColumns(false)}
      />
      <ConfirmDialog
        open={pendingUpdate !== null}
        title={s.updateTitle}
        body={pendingUpdate ? updateBody(pendingUpdate) : ""}
        confirmLabel={s.confirm}
        cancelLabel={s.cancel}
        onConfirm={() => {
          const line = pendingUpdate;
          setPendingUpdate(null);
          if (line?.line.lineId && view) {
            void write(
              () =>
                service.applyLibraryUpdate(
                  view.tableName,
                  line.line.lineId!,
                  view.evaluation.fingerprint
                ),
              (r) => ({
                intent: "success",
                text:
                  line.plan?.kind === "library"
                    ? s.updatedLibrary(r.completionCleared)
                    : s.updated(r),
              })
            );
          }
        }}
        onCancel={() => setPendingUpdate(null)}
      />
    </section>
  );
};

export default QuotationItemsView;
