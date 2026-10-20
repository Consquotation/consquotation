import * as React from "react";
import {
  Button,
  Caption1,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { TextField, ValidityBadge, errorFor, formatMoney } from "./common";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { formatIsoDate, todayIso, validityOn } from "../../../domain/library/dates";
import {
  LibrarySnapshot,
  PriceStatus,
  RESOURCE_TYPES,
  Resource,
  ResourcePrice,
  ResourceType,
} from "../../../domain/library/types";
import { FieldError, PriceField, PriceForm, ResourceField, ResourceForm } from "../../../domain/library/validation";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
  },
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  priceRow: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  priceHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", columnGap: tokens.spacingHorizontalS },
});

export interface ResourceEditorProps {
  service: LibraryService;
  library: LibrarySnapshot;
  editing: Resource | null;
  onSaved: (resource: Resource) => void;
  onCancel: () => void;
  onLibraryChanged: () => Promise<void>;
}

const ResourceEditor: React.FC<ResourceEditorProps> = ({ service, library, editing, onSaved, onCancel, onLibraryChanged }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS.resources;
  const [form, setForm] = React.useState<ResourceForm>(
    editing
      ? { code: editing.code, name: editing.name, type: editing.type, unit: editing.unit, notes: editing.notes }
      : { code: "", name: "", type: "material", unit: "", notes: "" }
  );
  const [errors, setErrors] = React.useState<FieldError<ResourceField>[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const set = (field: ResourceField) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const save = () =>
    exclusive(async () => {
      setFailure(null);
      try {
        const result = await service.saveResource(form, editing?.id ?? null, library);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setErrors([]);
        onSaved(result.value);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });

  return (
    <section className={styles.root} aria-labelledby="cq-lib-editor-title">
      <Subtitle2 as="h3" id="cq-lib-editor-title" tabIndex={-1}>
        {editing ? s.editTitle(editing.code) : s.newTitle}
      </Subtitle2>
      <form noValidate
        className={styles.root}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.grid}>
          <TextField label={s.fields.code} required value={form.code} onChange={set("code")} error={errorFor(errors, "code")} />
          <TextField label={s.fields.name} required value={form.name} onChange={set("name")} error={errorFor(errors, "name")} />
          <Field label={s.fields.type}>
            <Select value={form.type} onChange={(_e, data) => setForm((f) => ({ ...f, type: data.value as ResourceType }))}>
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {s.types[t]}
                </option>
              ))}
            </Select>
          </Field>
          <TextField label={s.fields.unit} required value={form.unit} onChange={set("unit")} error={errorFor(errors, "unit")} />
        </div>
        <TextField label={s.fields.notes} value={form.notes} onChange={set("notes")} multiline />
        {failure && (
          <MessageBar intent="error" layout="multiline" politeness="assertive">
            <MessageBarBody>
              {LIBRARY_STRINGS.saveFailed}: {failure}
            </MessageBarBody>
          </MessageBar>
        )}
        <div className={styles.actions}>
          <Button type="submit" appearance="primary">
            {LIBRARY_STRINGS.actions.saveResource}
          </Button>
          <Button onClick={onCancel}>{LIBRARY_STRINGS.actions.cancel}</Button>
        </div>
      </form>

      {editing ? (
        <PricesSection
          service={service}
          library={library}
          resource={editing}
          onLibraryChanged={onLibraryChanged}
          styles={styles}
        />
      ) : (
        <Caption1 as="p">{LIBRARY_STRINGS.prices.saveFirst}</Caption1>
      )}
    </section>
  );
};

function emptyPriceForm(resource: Resource): PriceForm {
  return {
    price: "",
    unit: resource.unit,
    currency: "VND",
    effectiveFrom: "",
    effectiveTo: "",
    source: "",
    status: "active",
    notes: "",
  };
}

const PricesSection: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  resource: Resource;
  onLibraryChanged: () => Promise<void>;
  styles: ReturnType<typeof useStyles>;
}> = ({ service, library, resource, onLibraryChanged, styles }) => {
  const s = LIBRARY_STRINGS.prices;
  const [form, setForm] = React.useState<PriceForm>(emptyPriceForm(resource));
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldError<PriceField>[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<ResourcePrice | null>(null);
  const exclusive = useExclusive();
  const today = todayIso();
  const prices = library.resourcePrices
    .filter((p) => p.resourceId === resource.id)
    .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""));
  const activeCount = prices.filter((p) => p.status === "active").length;
  const set = (field: PriceField) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const save = () =>
    exclusive(async () => {
      const result = await service.savePrice(resource.id, form, editingId, library);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setEditingId(null);
      setForm(emptyPriceForm(resource));
      await onLibraryChanged();
    });

  const startEdit = (price: ResourcePrice) => {
    setEditingId(price.id);
    setErrors([]);
    setForm({
      price: String(price.price),
      unit: price.unit,
      currency: price.currency,
      effectiveFrom: price.effectiveFrom ?? "",
      effectiveTo: price.effectiveTo ?? "",
      source: price.source,
      status: price.status,
      notes: price.notes,
    });
  };

  const confirmDelete = () =>
    exclusive(async () => {
      if (!pendingDelete) {
        return;
      }
      const id = pendingDelete.id;
      setPendingDelete(null);
      await service.deletePrice(id);
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyPriceForm(resource));
      }
      await onLibraryChanged();
    });

  return (
    <section className={styles.root} aria-label={s.title}>
      <Subtitle2 as="h4">{s.title}</Subtitle2>
      {activeCount > 1 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{s.noAutoPick}</MessageBarBody>
        </MessageBar>
      )}
      {prices.length === 0 && <Caption1 as="p">{s.empty}</Caption1>}
      {prices.map((p) => (
        <div key={p.id} className={styles.priceRow}>
          <div className={styles.priceHead}>
            <Text weight="semibold">
              {formatMoney(p.price, p.currency)} / {p.unit}
            </Text>
            <ValidityBadge validity={validityOn(p.effectiveFrom, p.effectiveTo, today)} />
          </div>
          <Caption1>
            {[
              s.status[p.status],
              p.effectiveFrom || p.effectiveTo
                ? `${formatIsoDate(p.effectiveFrom) || "…"} – ${formatIsoDate(p.effectiveTo) || "…"}`
                : "",
              p.source,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Caption1>
          <div className={styles.actions}>
            <Button size="small" onClick={() => startEdit(p)}>
              {LIBRARY_STRINGS.actions.edit}
            </Button>
            <Button size="small" onClick={() => setPendingDelete(p)}>
              {LIBRARY_STRINGS.actions.delete}
            </Button>
          </div>
        </div>
      ))}

      <form noValidate
        className={styles.root}
        aria-label={s.add}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.grid}>
          <TextField label={s.fields.price} required value={form.price} onChange={set("price")} error={errorFor(errors, "price")} inputMode="decimal" />
          <TextField label={s.fields.unit} required value={form.unit} onChange={set("unit")} error={errorFor(errors, "unit")} />
          <TextField label={s.fields.currency} required value={form.currency} onChange={set("currency")} error={errorFor(errors, "currency")} />
          <TextField label={s.fields.source} value={form.source} onChange={set("source")} />
          <TextField label={s.fields.effectiveFrom} type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} error={errorFor(errors, "effectiveFrom")} />
          <TextField label={s.fields.effectiveTo} type="date" value={form.effectiveTo} onChange={set("effectiveTo")} error={errorFor(errors, "effectiveTo")} />
          <Field label={s.fields.status}>
            <Select value={form.status} onChange={(_e, data) => setForm((f) => ({ ...f, status: data.value as PriceStatus }))}>
              <option value="active">{s.status.active}</option>
              <option value="inactive">{s.status.inactive}</option>
            </Select>
          </Field>
        </div>
        <div className={styles.actions}>
          <Button type="submit">{editingId ? LIBRARY_STRINGS.actions.savePrice : s.add}</Button>
          {editingId && (
            <Button
              onClick={() => {
                setEditingId(null);
                setErrors([]);
                setForm(emptyPriceForm(resource));
              }}
            >
              {LIBRARY_STRINGS.actions.cancel}
            </Button>
          )}
        </div>
      </form>

      {pendingDelete && (
        <ConfirmDialog
          open
          title={s.deleteTitle}
          body={<p>{s.deleteBody}</p>}
          confirmLabel={LIBRARY_STRINGS.actions.delete}
          cancelLabel={LIBRARY_STRINGS.actions.cancel}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
};

export default ResourceEditor;
