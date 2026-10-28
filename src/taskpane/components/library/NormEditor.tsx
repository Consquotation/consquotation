import * as React from "react";
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Select,
  Spinner,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { hintLabel } from "../hintLabel";
import {
  RefSelect,
  STATUS_COLOR,
  TextField,
  errorFor,
  formatMoney,
  formatQuantity,
} from "./common";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { NormExportGateway } from "../../../application/normExportGateway";
import { todayIso } from "../../../domain/library/dates";
import { compareCodes } from "../../../domain/library/search";
import {
  LibrarySnapshot,
  Norm,
  NormComponent,
  NormSourceType,
  RESOURCE_TYPES,
} from "../../../domain/library/types";
import {
  FieldError,
  NormComponentField,
  NormComponentForm,
  NormField,
  NormForm,
  normToForm,
  rateToPercent,
} from "../../../domain/library/validation";
import { RESOURCE_TYPE_TEXT } from "../../../domain/pricing/composition";
import { ComponentResult, calculateNorm, recheckNorm } from "../../../domain/pricing/normCalc";
import { buildExplanationSheet } from "../../../domain/pricing/normExplanation";
import { describeOfficeError } from "../../../office/officeErrors";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { NORM_UI } from "../../../shared/strings.norms.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    // Ô chọn có tùy chọn dài không được đẩy cột rộng hơn task pane.
    "& > *": { minWidth: 0 },
    // Ô có gợi ý/lỗi cao hơn không kéo giãn các ô cùng hàng.
    alignItems: "start",
  },
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  row: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    borderLeft: `3px solid ${tokens.colorNeutralStroke2}`,
  },
  rowWarning: { borderLeftColor: tokens.colorPaletteYellowBorderActive },
  rowError: { borderLeftColor: tokens.colorPaletteRedBorderActive },
  wrap: { wordBreak: "break-word" },
  select: { width: "100%", minWidth: 0 },
  totals: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
  },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  form: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
});

const EMPTY_FORM: NormForm = {
  code: "",
  name: "",
  unit: "",
  categoryId: "",
  workItemId: "",
  version: "1",
  effectiveFrom: "",
  sourceType: "user",
  source: "",
  sourceVerified: false,
  wasteIncluded: false,
  notes: "",
};

const EMPTY_COMPONENT: NormComponentForm = {
  resourceId: "",
  consumption: "",
  wastePercent: "",
  notes: "",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const NormEditor: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  editing: Norm | null;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  exporter: NormExportGateway;
  onBack: () => void;
  onOpen: (id: string) => void;
}> = ({ service, library, editing, reload, notify, exporter, onBack, onOpen }) => {
  const styles = useStyles();
  const s = NORM_UI;
  const f = s.fields;
  const [form, setForm] = React.useState<NormForm>(editing ? normToForm(editing) : EMPTY_FORM);
  const [errors, setErrors] = React.useState<FieldError<NormField>[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const locked = editing !== null && editing.status !== "draft";
  const set = (field: keyof NormForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const run = (task: () => Promise<void>) =>
    exclusive(async () => {
      setFailure(null);
      setStatusMessage(null);
      try {
        await task();
      } catch (error) {
        setFailure(message(error));
      }
    });

  const saveHeader = () =>
    run(async () => {
      const result = await service.saveNorm(form, editing?.id ?? null, library);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      await reload();
      notify(s.savedNorm(result.value.code, result.value.version));
      if (!editing) {
        onOpen(result.value.id);
      }
    });

  const changeStatus = (next: "approved" | "inactive") =>
    run(async () => {
      if (!editing) {
        return;
      }
      const check = await service.setNormStatus(editing.id, next, library);
      if (!check.ok) {
        setStatusMessage(check.message);
        return;
      }
      await reload();
      notify(
        next === "approved"
          ? s.approved(editing.code, editing.version)
          : s.deactivated(editing.code, editing.version)
      );
    });

  const copyVersion = () =>
    run(async () => {
      if (!editing) {
        return;
      }
      const created = await service.copyNormAsNewVersion(editing.id, library);
      await reload();
      notify(s.copied(created.code, created.version));
      onOpen(created.id);
    });

  const workItemOptions = React.useMemo(
    () =>
      [...library.workItems]
        .sort((a, b) => compareCodes(a.code, b.code))
        .map((w) => ({ id: w.id, name: `${w.code}: ${w.name}` })),
    [library.workItems]
  );

  return (
    <section className={styles.root} aria-labelledby="cq-norm-editor-title">
      <div>
        <Button size="small" onClick={onBack}>
          {s.back}
        </Button>
      </div>
      <div className={styles.head}>
        <Subtitle2 as="h3" id="cq-norm-editor-title" tabIndex={-1}>
          {editing ? s.editTitle(editing.code, editing.version) : s.newTitle}
        </Subtitle2>
        {editing && (
          <Badge appearance="tint" color={STATUS_COLOR[editing.status]}>
            {s.status[editing.status]}
          </Badge>
        )}
      </div>
      {editing && (
        <div className={styles.actions}>
          {(editing.status === "draft" || editing.status === "inactive") && (
            <Button size="small" appearance="primary" onClick={() => void changeStatus("approved")}>
              {s.approve}
            </Button>
          )}
          {editing.status === "approved" && (
            <Button size="small" onClick={() => void changeStatus("inactive")}>
              {s.deactivate}
            </Button>
          )}
          <Button size="small" onClick={() => void copyVersion()}>
            {s.copyVersion}
          </Button>
        </div>
      )}
      {statusMessage && (
        <MessageBar intent="warning" layout="multiline" politeness="assertive">
          <MessageBarBody>{statusMessage}</MessageBarBody>
        </MessageBar>
      )}
      {locked && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.lockedNote}</MessageBarBody>
        </MessageBar>
      )}
      {failure && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            {LIBRARY_STRINGS.actionFailed}: {failure}
          </MessageBarBody>
        </MessageBar>
      )}

      <form
        noValidate
        className={styles.section}
        onSubmit={(event) => {
          event.preventDefault();
          void saveHeader();
        }}
      >
        <div className={styles.grid}>
          <TextField
            label={f.code}
            required
            value={form.code}
            onChange={set("code")}
            error={errorFor(errors, "code")}
            disabled={locked}
          />
          <TextField
            label={f.version}
            required
            value={form.version}
            onChange={set("version")}
            error={errorFor(errors, "version")}
            disabled={locked}
          />
          <TextField
            label={f.name}
            required
            value={form.name}
            onChange={set("name")}
            error={errorFor(errors, "name")}
          />
          <TextField
            label={f.unit}
            required
            value={form.unit}
            onChange={set("unit")}
            error={errorFor(errors, "unit")}
            disabled={locked}
          />
          <RefSelect
            label={f.category}
            value={form.categoryId}
            options={library.categories}
            noneLabel={LIBRARY_STRINGS.refs.noneCategory}
            onChange={set("categoryId")}
            error={errorFor(errors, "categoryId")}
          />
          <RefSelect
            label={f.workItem}
            hint={f.workItemHint}
            value={form.workItemId}
            options={workItemOptions}
            noneLabel={f.noWorkItem}
            onChange={set("workItemId")}
            error={errorFor(errors, "workItemId")}
          />
          <TextField
            label={f.effectiveFrom}
            type="date"
            value={form.effectiveFrom}
            onChange={set("effectiveFrom")}
            error={errorFor(errors, "effectiveFrom")}
          />
          <Field label={f.sourceType}>
            <Select
              value={form.sourceType}
              onChange={(_e, data) =>
                setForm((c) => ({ ...c, sourceType: data.value as NormSourceType }))
              }
            >
              <option value="user">{f.sourceUser}</option>
              <option value="document">{f.sourceDocument}</option>
            </Select>
          </Field>
        </div>
        <TextField
          label={f.source}
          value={form.source}
          onChange={set("source")}
          error={errorFor(errors, "source")}
        />
        <Checkbox
          label={f.sourceVerified}
          checked={form.sourceVerified}
          onChange={(_e, data) => setForm((c) => ({ ...c, sourceVerified: data.checked === true }))}
        />
        <Field validationMessage={errorFor(errors, "wasteIncluded")}>
          <Checkbox
            label={f.wasteIncluded}
            checked={form.wasteIncluded}
            disabled={locked}
            onChange={(_e, data) =>
              setForm((c) => ({ ...c, wasteIncluded: data.checked === true }))
            }
          />
        </Field>
        <TextField label={f.notes} value={form.notes} onChange={set("notes")} multiline />
        <div className={styles.actions}>
          <Button type="submit" appearance="primary">
            {s.save}
          </Button>
        </div>
      </form>

      {editing && (
        <ComponentsAndResult
          service={service}
          library={library}
          norm={editing}
          reload={reload}
          notify={notify}
          exporter={exporter}
          styles={styles}
        />
      )}
    </section>
  );
};

const ComponentsAndResult: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  norm: Norm;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  exporter: NormExportGateway;
  styles: ReturnType<typeof useStyles>;
}> = ({ service, library, norm, reload, notify, exporter, styles }) => {
  const s = NORM_UI;
  const c = s.components;
  const editable = norm.status === "draft";
  const today = todayIso();
  const [form, setForm] = React.useState<NormComponentForm>(EMPTY_COMPONENT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldError<NormComponentField>[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<NormComponent | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [exportState, setExportState] = React.useState<{
    busy: boolean;
    message: string | null;
    intent: "success" | "warning" | "error";
  }>({ busy: false, message: null, intent: "success" });
  const exclusive = useExclusive();

  const components = React.useMemo(
    () => library.normComponents.filter((x) => x.normId === norm.id),
    [library.normComponents, norm.id]
  );
  const result = React.useMemo(
    () =>
      calculateNorm(norm, components, library, {
        today,
        now: new Date().toISOString(),
      }),
    [norm, components, library, today]
  );
  const byId = new Map(components.map((x) => [x.id, x]));
  const resources = React.useMemo(
    () => [...library.resources].sort((a, b) => compareCodes(a.code, b.code)),
    [library.resources]
  );

  const run = (task: () => Promise<void>) =>
    exclusive(async () => {
      setFailure(null);
      try {
        await task();
      } catch (error) {
        setFailure(message(error));
      }
    });

  const saveComponent = () =>
    run(async () => {
      const saved = await service.saveNormComponent(norm.id, form, editingId, library);
      if (!saved.ok) {
        setErrors(saved.errors);
        return;
      }
      setErrors([]);
      setForm(EMPTY_COMPONENT);
      setEditingId(null);
      await reload();
    });

  const startEdit = (component: NormComponent) => {
    setEditingId(component.id);
    setErrors([]);
    setForm({
      resourceId: component.resourceId,
      consumption: String(component.consumption),
      wastePercent: rateToPercent(component.wasteRate),
      notes: component.notes,
    });
  };

  const exportExcel = () =>
    exclusive(async () => {
      if (result.status === "invalid") {
        setExportState({ busy: false, message: s.exportInvalid, intent: "warning" });
        return;
      }
      setExportState({ busy: true, message: null, intent: "success" });
      try {
        // Tính lại với thư viện mới đọc: dữ liệu đổi giữa lúc xem và lúc ghi thì không ghi.
        const check = recheckNorm(result, await service.load(), {
          today,
          now: new Date().toISOString(),
        });
        if (!check) {
          await reload();
          setExportState({ busy: false, message: s.changedMeanwhile, intent: "warning" });
          return;
        }
        const written = await exporter.writeExplanation(
          buildExplanationSheet(check.norm, check.result, today)
        );
        setExportState({ busy: false, message: s.exported(written.sheetName), intent: "success" });
        notify(s.exported(written.sheetName));
      } catch (error) {
        setExportState({ busy: false, message: describeOfficeError(error), intent: "error" });
      }
    });

  const statusIntent =
    result.status === "valid"
      ? "success"
      : result.status === "validWithWarnings"
        ? "warning"
        : "error";
  const money = (value: number | null) =>
    value === null ? s.result.missing : formatMoney(value, result.currency);

  const renderRow = (r: ComponentResult, index: number) => {
    const component = byId.get(r.componentId);
    const issues = result.issues.filter((i) => i.componentId === r.componentId);
    const resource = library.resources.find((x) => x.id === r.resourceId);
    const prices = resource
      ? library.resourcePrices.filter((p) => p.resourceId === resource.id)
      : [];
    const snapshotDiffers =
      component &&
      resource &&
      (resource.code !== component.resourceCodeSnapshot ||
        resource.name !== component.resourceNameSnapshot ||
        resource.unit !== component.resourceUnitSnapshot ||
        resource.type !== component.resourceTypeSnapshot);
    return (
      <li
        key={r.componentId}
        className={`${styles.row} ${r.severity === "error" ? styles.rowError : r.severity === "warning" ? styles.rowWarning : ""}`}
      >
        <Text weight="semibold" className={styles.wrap}>
          {index + 1}. [{RESOURCE_TYPE_TEXT[r.type]}] {r.resourceCode}: {r.resourceName} (
          {r.resourceUnit})
        </Text>
        <Caption1>
          {c.line(
            formatQuantity(r.baseConsumption),
            r.wasteApplied ? rateToPercent(r.wasteRate) : "",
            formatQuantity(r.effectiveConsumption),
            r.resourceUnit
          )}{" "}
          {r.amount !== null && r.unitPrice !== null
            ? c.priced(
                formatMoney(r.unitPrice, r.currency),
                r.priceUnit,
                formatMoney(r.amount, r.currency)
              )
            : `· ${c.unpriced}`}
        </Caption1>
        {issues.map((i) => (
          <Caption1 key={`${i.code}-${i.message}`} className={styles.wrap}>
            {i.severity === "error" ? "Lỗi: " : "Cảnh báo: "}
            {i.message}
          </Caption1>
        ))}
        {prices.length > 0 && (
          <Field label={hintLabel(c.choosePrice, c.choosePriceHint)}>
            <Select
              className={styles.select}
              value={component?.priceId ?? ""}
              disabled={!component || norm.status === "inactive"}
              onChange={(_e, data) =>
                component &&
                void run(() =>
                  service
                    .setComponentPrice(component.id, data.value === "" ? null : data.value, library)
                    .then(reload)
                )
              }
            >
              <option value="">{c.autoPrice}</option>
              {prices.map((p) => (
                <option key={p.id} value={p.id}>
                  {c.priceOption(
                    formatMoney(p.price, p.currency),
                    p.unit,
                    LIBRARY_STRINGS.prices.status[p.status],
                    p.source
                  )}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {editable && component && (
          <div className={styles.actions}>
            <Button size="small" onClick={() => startEdit(component)}>
              {c.edit}
            </Button>
            <Button
              size="small"
              disabled={index === 0}
              onClick={() =>
                void run(() => service.moveNormComponent(component.id, -1, library).then(reload))
              }
            >
              {c.up}
            </Button>
            <Button
              size="small"
              disabled={index === result.components.length - 1}
              onClick={() =>
                void run(() => service.moveNormComponent(component.id, 1, library).then(reload))
              }
            >
              {c.down}
            </Button>
            {snapshotDiffers && (
              <Button
                size="small"
                onClick={() =>
                  void run(() => service.refreshComponentLink(component.id, library).then(reload))
                }
              >
                {c.refresh}
              </Button>
            )}
            <Button size="small" onClick={() => setPendingDelete(component)}>
              {c.remove}
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className={styles.section} aria-labelledby="cq-norm-components-title">
        <Subtitle2 as="h4" id="cq-norm-components-title">
          {c.title} ({components.length})
        </Subtitle2>
        {failure && (
          <MessageBar intent="error" layout="multiline" politeness="assertive">
            <MessageBarBody>
              {LIBRARY_STRINGS.actionFailed}: {failure}
            </MessageBarBody>
          </MessageBar>
        )}
        {components.length === 0 && <Caption1>{c.empty}</Caption1>}
        <ul
          style={{
            listStyleType: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            rowGap: tokens.spacingVerticalXS,
          }}
        >
          {result.components.map(renderRow)}
        </ul>
        {editable &&
          (resources.length === 0 ? (
            <Caption1>{c.needResources}</Caption1>
          ) : (
            <form
              noValidate
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void saveComponent();
              }}
            >
              <Field label={c.resource} required validationMessage={errorFor(errors, "resourceId")}>
                <Select
                  className={styles.select}
                  value={form.resourceId}
                  onChange={(_e, data) => setForm((cur) => ({ ...cur, resourceId: data.value }))}
                >
                  <option value="">{c.chooseResource}</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code}: {r.name} ({r.unit}, {RESOURCE_TYPE_TEXT[r.type]})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className={styles.grid}>
                <TextField
                  label={c.consumption}
                  required
                  value={form.consumption}
                  onChange={(v) => setForm((cur) => ({ ...cur, consumption: v }))}
                  error={errorFor(errors, "consumption")}
                  hint={c.consumptionHint}
                  inputMode="decimal"
                />
                <TextField
                  label={c.wastePercent}
                  value={form.wastePercent}
                  onChange={(v) => setForm((cur) => ({ ...cur, wastePercent: v }))}
                  error={errorFor(errors, "wastePercent")}
                  hint={c.wasteHint}
                  inputMode="decimal"
                />
              </div>
              <TextField
                label={c.notes}
                value={form.notes}
                onChange={(v) => setForm((cur) => ({ ...cur, notes: v }))}
              />
              <div className={styles.actions}>
                <Button type="submit" appearance="primary">
                  {editingId ? c.update : c.add}
                </Button>
                {editingId && (
                  <Button
                    onClick={() => {
                      setEditingId(null);
                      setForm(EMPTY_COMPONENT);
                      setErrors([]);
                    }}
                  >
                    {c.cancelEdit}
                  </Button>
                )}
              </div>
            </form>
          ))}
      </section>

      <section className={styles.section} aria-labelledby="cq-norm-result-title">
        <Subtitle2 as="h4" id="cq-norm-result-title">
          {s.result.title}
        </Subtitle2>
        <MessageBar intent={statusIntent} layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{s.result[result.status]}</MessageBarTitle>
            {s.result.dateNote(today.split("-").reverse().join("/"))}
          </MessageBarBody>
        </MessageBar>
        <div className={styles.totals}>
          {RESOURCE_TYPES.map((type) => (
            <React.Fragment key={type}>
              <Text>{s.result[type]}</Text>
              <Text className={styles.num}>{money(result.totalsByType[type])}</Text>
            </React.Fragment>
          ))}
          <Text weight="semibold">{s.result.unitPrice(norm.unit)}</Text>
          <Text weight="semibold" className={styles.num}>
            {money(result.unitPrice)}
          </Text>
        </div>
        <Caption1>{s.result.formula}</Caption1>
        <Caption1>{s.result.rounding}</Caption1>
        {result.issues.filter((i) => !i.componentId).length > 0 && (
          <MessageBar intent={statusIntent} layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>{s.result.issuesTitle}</MessageBarTitle>
              {result.issues
                .filter((i) => !i.componentId)
                .map((i) => i.message)
                .join(" ")}
            </MessageBarBody>
          </MessageBar>
        )}
        <div className={styles.actions}>
          <Button disabled={exportState.busy} onClick={() => void exportExcel()}>
            {s.exportExcel}
          </Button>
        </div>
        {exportState.busy && <Spinner size="tiny" label={s.exporting} />}
        {exportState.message && (
          <MessageBar intent={exportState.intent} layout="multiline" politeness="polite">
            <MessageBarBody>{exportState.message}</MessageBarBody>
          </MessageBar>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          open
          title={c.deleteTitle}
          body={<p>{c.deleteBody(pendingDelete.resourceCodeSnapshot)}</p>}
          confirmLabel={c.remove}
          cancelLabel={LIBRARY_STRINGS.actions.cancel}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void run(() => service.deleteNormComponent(target.id, library).then(reload));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
};

export default NormEditor;
