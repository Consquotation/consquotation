import * as React from "react";
import {
  Body1,
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
import { TextField, errorFor } from "./common";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { NONE, categoryUsage, compareText, supplierUsage } from "../../../domain/library/search";
import { Category, LibrarySnapshot, Supplier } from "../../../domain/library/types";
import { FieldError } from "../../../domain/library/validation";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalL },
  section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  name: { wordBreak: "break-word" },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  form: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
});

const byName = <T extends { name: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => compareText(a.name, b.name));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Props {
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}

/** Danh mục: nhóm (dùng chung cho công tác và tài nguyên) và nhà cung cấp. */
const CatalogPanel: React.FC<Props> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <CategoriesSection {...props} />
      <SuppliersSection {...props} />
    </div>
  );
};

type Editing<T> = { kind: "none" } | { kind: "new" } | { kind: "edit"; record: T };

const CategoriesSection: React.FC<Props> = ({ service, library, reload, notify }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS.categories;
  const a = LIBRARY_STRINGS.actions;
  const [editing, setEditing] = React.useState<Editing<Category>>({ kind: "none" });
  const [form, setForm] = React.useState({ name: "", notes: "" });
  const [errors, setErrors] = React.useState<FieldError<"name" | "notes">[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<Category | null>(null);
  const [moveTo, setMoveTo] = React.useState("");
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const usage = React.useMemo(() => categoryUsage(library), [library]);
  const unassigned = usage.get(NONE) ?? { workItems: 0, resources: 0 };

  const open = (next: Editing<Category>) => {
    setEditing(next);
    setErrors([]);
    setFailure(null);
    setForm(next.kind === "edit" ? { name: next.record.name, notes: next.record.notes } : { name: "", notes: "" });
  };

  const save = () =>
    exclusive(async () => {
      setFailure(null);
      try {
        const result = await service.saveCategory(form, editing.kind === "edit" ? editing.record.id : null, library);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        open({ kind: "none" });
        await reload();
        notify(LIBRARY_STRINGS.saved(result.value.name));
      } catch (error) {
        setFailure(message(error));
      }
    });

  const confirmDelete = () =>
    exclusive(async () => {
      const target = pendingDelete;
      if (!target) {
        return;
      }
      setPendingDelete(null);
      setFailure(null);
      try {
        await service.deleteCategory(target.id, moveTo === "" ? null : moveTo, library);
        await reload();
        notify(LIBRARY_STRINGS.deleted(target.name));
      } catch (error) {
        setFailure(message(error));
      }
    });

  const deleteUsage = pendingDelete ? usage.get(pendingDelete.id) : undefined;

  return (
    <section className={styles.section} aria-labelledby="cq-categories-title">
      <Subtitle2 as="h3" id="cq-categories-title">
        {s.title} ({library.categories.length})
      </Subtitle2>
      <Caption1>{s.intro}</Caption1>
      {failure && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            {LIBRARY_STRINGS.actionFailed}: {failure}
          </MessageBarBody>
        </MessageBar>
      )}
      {editing.kind === "none" ? (
        <div>
          <Button appearance="primary" onClick={() => open({ kind: "new" })}>
            {s.add}
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className={styles.form}
          aria-label={editing.kind === "new" ? s.newTitle : s.editTitle(editing.record.name)}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Text weight="semibold">{editing.kind === "new" ? s.newTitle : s.editTitle(editing.record.name)}</Text>
          <TextField label={s.name} required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={errorFor(errors, "name")} />
          <TextField label={s.notes} value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
          <div className={styles.actions}>
            <Button type="submit" appearance="primary">
              {a.save}
            </Button>
            <Button onClick={() => open({ kind: "none" })}>{a.cancel}</Button>
          </div>
        </form>
      )}
      {library.categories.length === 0 && <Body1>{s.empty}</Body1>}
      <ul className={styles.list}>
        {byName(library.categories).map((c) => {
          const u = usage.get(c.id) ?? { workItems: 0, resources: 0 };
          return (
            <li key={c.id} className={styles.item}>
              <Text weight="semibold" className={styles.name}>
                {c.name}
              </Text>
              <Caption1>{[s.usage(u.workItems, u.resources), c.notes].filter(Boolean).join(" · ")}</Caption1>
              <div className={styles.actions}>
                <Button size="small" onClick={() => open({ kind: "edit", record: c })}>
                  {a.edit}
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setMoveTo("");
                    setPendingDelete(c);
                  }}
                >
                  {a.delete}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {(unassigned.workItems > 0 || unassigned.resources > 0) && (
        <Caption1>{s.unassigned(unassigned.workItems, unassigned.resources)}</Caption1>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={s.deleteTitle}
          body={
            deleteUsage && deleteUsage.workItems + deleteUsage.resources > 0 ? (
              <>
                <p>{s.deleteUsed(pendingDelete.name, deleteUsage.workItems, deleteUsage.resources)}</p>
                <Field label={s.moveTo}>
                  <Select value={moveTo} onChange={(_e, data) => setMoveTo(data.value)}>
                    <option value="">{s.unassign}</option>
                    {byName(library.categories)
                      .filter((c) => c.id !== pendingDelete.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </>
            ) : (
              <p>{s.deleteUnused(pendingDelete.name)}</p>
            )
          }
          confirmLabel={s.deleteConfirm}
          cancelLabel={a.cancel}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
};

const SuppliersSection: React.FC<Props> = ({ service, library, reload, notify }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS.suppliers;
  const a = LIBRARY_STRINGS.actions;
  const [editing, setEditing] = React.useState<Editing<Supplier>>({ kind: "none" });
  const [form, setForm] = React.useState({ name: "", contactInfo: "", notes: "" });
  const [errors, setErrors] = React.useState<FieldError<"name" | "contactInfo" | "notes">[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<Supplier | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const usage = React.useMemo(() => supplierUsage(library), [library]);

  const open = (next: Editing<Supplier>) => {
    setEditing(next);
    setErrors([]);
    setFailure(null);
    setForm(
      next.kind === "edit"
        ? { name: next.record.name, contactInfo: next.record.contactInfo, notes: next.record.notes }
        : { name: "", contactInfo: "", notes: "" }
    );
  };

  const save = () =>
    exclusive(async () => {
      setFailure(null);
      try {
        const result = await service.saveSupplier(form, editing.kind === "edit" ? editing.record.id : null, library);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        open({ kind: "none" });
        await reload();
        notify(LIBRARY_STRINGS.saved(result.value.name));
      } catch (error) {
        setFailure(message(error));
      }
    });

  const confirmDelete = () =>
    exclusive(async () => {
      const target = pendingDelete;
      if (!target) {
        return;
      }
      setPendingDelete(null);
      setFailure(null);
      try {
        await service.deleteSupplier(target.id);
        await reload();
        notify(LIBRARY_STRINGS.deleted(target.name));
      } catch (error) {
        setFailure(message(error));
      }
    });

  const deleteUsage = pendingDelete ? usage.get(pendingDelete.id) ?? { workItems: 0, prices: 0 } : null;

  return (
    <section className={styles.section} aria-labelledby="cq-suppliers-title">
      <Subtitle2 as="h3" id="cq-suppliers-title">
        {s.title} ({library.suppliers.length})
      </Subtitle2>
      <Caption1>{s.intro}</Caption1>
      {failure && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            {LIBRARY_STRINGS.actionFailed}: {failure}
          </MessageBarBody>
        </MessageBar>
      )}
      {editing.kind === "none" ? (
        <div>
          <Button appearance="primary" onClick={() => open({ kind: "new" })}>
            {s.add}
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className={styles.form}
          aria-label={editing.kind === "new" ? s.newTitle : s.editTitle(editing.record.name)}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Text weight="semibold">{editing.kind === "new" ? s.newTitle : s.editTitle(editing.record.name)}</Text>
          <TextField label={s.name} required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={errorFor(errors, "name")} />
          <TextField
            label={s.contactInfo}
            value={form.contactInfo}
            onChange={(v) => setForm((f) => ({ ...f, contactInfo: v }))}
            error={errorFor(errors, "contactInfo")}
            multiline
          />
          <TextField label={s.notes} value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
          <div className={styles.actions}>
            <Button type="submit" appearance="primary">
              {a.save}
            </Button>
            <Button onClick={() => open({ kind: "none" })}>{a.cancel}</Button>
          </div>
        </form>
      )}
      {library.suppliers.length === 0 && <Body1>{s.empty}</Body1>}
      <ul className={styles.list}>
        {byName(library.suppliers).map((x) => {
          const u = usage.get(x.id) ?? { workItems: 0, prices: 0 };
          return (
            <li key={x.id} className={styles.item}>
              <Text weight="semibold" className={styles.name}>
                {x.name}
              </Text>
              <Caption1 className={styles.name}>
                {[s.usage(u.workItems, u.prices), x.contactInfo, x.notes].filter(Boolean).join(" · ")}
              </Caption1>
              <div className={styles.actions}>
                <Button size="small" onClick={() => open({ kind: "edit", record: x })}>
                  {a.edit}
                </Button>
                <Button size="small" onClick={() => setPendingDelete(x)}>
                  {a.delete}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {pendingDelete && deleteUsage && (
        <ConfirmDialog
          open
          title={s.deleteTitle}
          body={<p>{s.deleteBody(pendingDelete.name, deleteUsage.workItems, deleteUsage.prices)}</p>}
          confirmLabel={a.delete}
          cancelLabel={a.cancel}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
};

export default CatalogPanel;
