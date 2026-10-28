import * as React from "react";
import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { NEW_REF, RefSelect, TextField, errorFor } from "./common";
import { createNewRefs } from "./newRefs";
import { LibraryService } from "../../../application/libraryService";
import { compareCodes } from "../../../domain/library/search";
import { LibrarySnapshot, WorkItem } from "../../../domain/library/types";
import { NORM_UI } from "../../../shared/strings.norms.vi";
import {
  FieldError,
  WorkItemField,
  WorkItemForm,
  sameNameRecords,
  workItemToForm,
} from "../../../domain/library/validation";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

const EMPTY_FORM: WorkItemForm = {
  code: "",
  name: "",
  categoryId: "",
  unit: "",
  description: "",
  unitPrice: "",
  // Mặc định giao diện, người dùng sửa được; không phải dữ liệu chuyên ngành.
  currency: "VND",
  supplierId: "",
  source: "",
  effectiveFrom: "",
  effectiveTo: "",
  notes: "",
};

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    // Ô có gợi ý/lỗi cao hơn không kéo giãn các ô cùng hàng.
    alignItems: "start",
  },
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS },
  normRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  normAdd: { display: "flex", alignItems: "flex-end", columnGap: tokens.spacingHorizontalS, flexWrap: "wrap" },
});

export interface WorkItemEditorProps {
  service: LibraryService;
  library: LibrarySnapshot;
  editing: WorkItem | null;
  onSaved: (item: WorkItem) => void;
  onCancel: () => void;
  onLibraryChanged: () => Promise<void>;
}

const WorkItemEditor: React.FC<WorkItemEditorProps> = ({
  service,
  library,
  editing,
  onSaved,
  onCancel,
  onLibraryChanged,
}) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const f = s.workItems.fields;
  const [form, setForm] = React.useState<WorkItemForm>(editing ? workItemToForm(editing) : EMPTY_FORM);
  const [errors, setErrors] = React.useState<FieldError<WorkItemField>[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [newCategory, setNewCategory] = React.useState("");
  const [newSupplier, setNewSupplier] = React.useState("");
  const exclusive = useExclusive();
  const set = (field: WorkItemField) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const sameName = sameNameRecords(form.name, library.workItems, editing?.id ?? null);

  const save = () =>
    exclusive(async () => {
      setFailure(null);
      try {
        // Nhóm/nhà cung cấp mới gõ trong form: tạo trước, rồi lưu công tác trỏ tới chúng.
        const refs = await createNewRefs(service, library, {
          category: form.categoryId === NEW_REF ? newCategory : undefined,
          supplier: form.supplierId === NEW_REF ? newSupplier : undefined,
        });
        if (!refs.ok) {
          setErrors([{ field: refs.field, message: refs.message }]);
          return;
        }
        const toSave: WorkItemForm = {
          ...form,
          categoryId: refs.categoryId ?? form.categoryId,
          supplierId: refs.supplierId ?? form.supplierId,
        };
        if (refs.categoryId || refs.supplierId) {
          // Giữ lựa chọn vừa tạo nếu bước lưu công tác báo lỗi (không mất dữ liệu đang nhập).
          setForm(toSave);
          setNewCategory("");
          setNewSupplier("");
        }
        const result = await service.saveWorkItem(toSave, editing?.id ?? null, refs.library);
        if (!result.ok) {
          setErrors(result.errors);
          if (refs.categoryId || refs.supplierId) {
            await onLibraryChanged();
          }
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
        {editing ? s.workItems.editTitle(editing.code) : s.workItems.newTitle}
      </Subtitle2>
      <form noValidate
        className={styles.root}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.grid}>
          <TextField label={f.code} required value={form.code} onChange={set("code")} error={errorFor(errors, "code")} />
          <TextField
            label={f.name}
            required
            value={form.name}
            onChange={set("name")}
            error={errorFor(errors, "name")}
            hintKind="warning"
            hint={sameName.length > 0 ? s.sameName(sameName.map((w) => w.code).join(", ")) : undefined}
          />
          <RefSelect
            label={f.group}
            value={form.categoryId}
            options={library.categories}
            noneLabel={s.refs.noneCategory}
            onChange={set("categoryId")}
            error={errorFor(errors, "categoryId")}
            newLabel={s.refs.newCategory}
            newName={newCategory}
            newNameLabel={s.refs.newCategoryName}
            onNewNameChange={setNewCategory}
          />
          <TextField label={f.unit} required value={form.unit} onChange={set("unit")} error={errorFor(errors, "unit")} />
          <TextField
            label={f.unitPrice}
            value={form.unitPrice}
            onChange={set("unitPrice")}
            error={errorFor(errors, "unitPrice")}
            hint={s.workItems.priceHint}
            inputMode="decimal"
          />
          <TextField label={f.currency} value={form.currency} onChange={set("currency")} error={errorFor(errors, "currency")} />
          <RefSelect
            label={f.supplier}
            value={form.supplierId}
            options={library.suppliers}
            noneLabel={s.refs.noneSupplier}
            onChange={set("supplierId")}
            error={errorFor(errors, "supplierId")}
            newLabel={s.refs.newSupplier}
            newName={newSupplier}
            newNameLabel={s.refs.newSupplierName}
            onNewNameChange={setNewSupplier}
          />
          <TextField label={f.source} value={form.source} onChange={set("source")} />
          <TextField
            label={f.effectiveFrom}
            type="date"
            value={form.effectiveFrom}
            onChange={set("effectiveFrom")}
            error={errorFor(errors, "effectiveFrom")}
          />
          <TextField
            label={f.effectiveTo}
            type="date"
            value={form.effectiveTo}
            onChange={set("effectiveTo")}
            error={errorFor(errors, "effectiveTo")}
          />
        </div>
        <TextField label={f.description} value={form.description} onChange={set("description")} multiline />
        <TextField label={f.notes} value={form.notes} onChange={set("notes")} multiline />
        {failure && (
          <MessageBar intent="error" layout="multiline" politeness="assertive">
            <MessageBarBody>
              {s.saveFailed}: {failure}
            </MessageBarBody>
          </MessageBar>
        )}
        <div className={styles.actions}>
          <Button type="submit" appearance="primary">
            {s.actions.saveWorkItem}
          </Button>
          <Button onClick={onCancel}>{s.actions.cancel}</Button>
        </div>
      </form>

      <LinkedNorms library={library} workItem={editing} styles={styles} />
    </section>
  );
};

/** Định mức liên kết với công tác (ADR-0013). Tạo và sửa định mức ở tab Định mức. */
const LinkedNorms: React.FC<{
  library: LibrarySnapshot;
  workItem: WorkItem | null;
  styles: ReturnType<typeof useStyles>;
}> = ({ library, workItem, styles }) => {
  const s = LIBRARY_STRINGS.norms;
  const linked = workItem
    ? library.norms
        .filter((n) => n.workItemId === workItem.id)
        .sort((a, b) => compareCodes(a.code, b.code) || compareCodes(a.version, b.version))
    : [];
  return (
    <section aria-label={s.title} className={styles.root}>
      <Subtitle2 as="h4">{s.title}</Subtitle2>
      {linked.length === 0 ? (
        <Caption1 as="p">{s.noneLinked}</Caption1>
      ) : (
        linked.map((norm) => (
          <div key={norm.id} className={styles.normRow}>
            <Text>{s.linkedLine(norm.code, norm.version, NORM_UI.status[norm.status])}</Text>
          </div>
        ))
      )}
      <Caption1 as="p">{s.manageInTab}</Caption1>
    </section>
  );
};

export default WorkItemEditor;
