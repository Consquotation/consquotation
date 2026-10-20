import * as React from "react";
import {
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ValidityBadge, formatMoney } from "./common";
import WorkItemEditor from "./WorkItemEditor";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { todayIso, validityOn } from "../../../domain/library/dates";
import { distinctGroups, searchWorkItems } from "../../../domain/library/search";
import { LibrarySnapshot, WorkItem } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

/* global clearTimeout, setTimeout */

const PAGE_SIZE = 50;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  toolbar: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "flex-end" },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  itemHead: { display: "flex", justifyContent: "space-between", columnGap: tokens.spacingHorizontalS, alignItems: "baseline" },
  itemActions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
});

type Mode = { kind: "list" } | { kind: "edit"; item: WorkItem | null };

export interface WorkItemsPanelProps {
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  onInsert: (item: WorkItem) => void;
  notify: (message: string) => void;
}

const WorkItemsPanel: React.FC<WorkItemsPanelProps> = ({ service, library, reload, onInsert, notify }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = React.useState<WorkItem | null>(null);
  const exclusive = useExclusive();
  const today = todayIso();

  // Debounce tìm kiếm cho thư viện lớn (prompts/17).
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  React.useEffect(() => setLimit(PAGE_SIZE), [debounced, group]);

  const results = React.useMemo(
    () => searchWorkItems(library.workItems, debounced, group),
    [library.workItems, debounced, group]
  );
  const groups = React.useMemo(() => distinctGroups(library.workItems), [library.workItems]);

  if (mode.kind === "edit") {
    // Lấy bản mới nhất từ thư viện (định mức có thể vừa thay đổi).
    const editing = mode.item ? library.workItems.find((w) => w.id === mode.item?.id) ?? null : null;
    return (
      <WorkItemEditor
        key={editing?.id ?? "new"}
        service={service}
        library={library}
        editing={editing}
        onLibraryChanged={reload}
        onCancel={() => setMode({ kind: "list" })}
        onSaved={async (item) => {
          await reload();
          notify(s.saved(item.code));
          // Công tác mới: ở lại trình sửa để khai báo định mức nếu cần.
          setMode(mode.item ? { kind: "list" } : { kind: "edit", item });
        }}
      />
    );
  }

  const copy = (item: WorkItem) =>
    exclusive(async () => {
      const created = await service.copyWorkItem(item.id, library);
      await reload();
      notify(s.copied(created.code));
    });

  const confirmDelete = () =>
    exclusive(async () => {
      if (!pendingDelete) {
        return;
      }
      const item = pendingDelete;
      setPendingDelete(null);
      await service.deleteWorkItem(item.id);
      await reload();
      notify(s.deleted(item.code));
    });

  return (
    <section className={styles.root} aria-label={s.sections.workItems}>
      <div className={styles.toolbar}>
        <Button appearance="primary" onClick={() => setMode({ kind: "edit", item: null })}>
          {s.workItems.add}
        </Button>
      </div>

      {library.workItems.length === 0 ? (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.workItems.empty}</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <div className={styles.toolbar}>
            <Field label={s.search} style={{ flexGrow: 1 }}>
              <Input type="search" value={query} onChange={(_e, data) => setQuery(data.value)} />
            </Field>
            {groups.length > 0 && (
              <Field label={s.group}>
                <Select value={group} onChange={(_e, data) => setGroup(data.value)}>
                  <option value="">{s.allGroups}</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Caption1 aria-live="polite">{s.count(results.length, library.workItems.length)}</Caption1>
          {results.length === 0 && <Caption1>{s.noResults}</Caption1>}
          <ul className={styles.list}>
            {results.slice(0, limit).map((item) => {
              const normCount = library.norms.filter((n) => n.workItemId === item.id).length;
              return (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <Text weight="semibold">
                      {item.code} — {item.name}
                    </Text>
                    {item.unitPrice !== null && (
                      <ValidityBadge validity={validityOn(item.effectiveFrom, item.effectiveTo, today)} />
                    )}
                  </div>
                  <Caption1>
                    {[item.group, item.unit, formatMoney(item.unitPrice, item.currency), item.source]
                      .filter(Boolean)
                      .join(" · ")}
                    {normCount > 0 ? ` · ${normCount} định mức` : ""}
                  </Caption1>
                  <div className={styles.itemActions}>
                    <Button size="small" appearance="primary" onClick={() => onInsert(item)}>
                      {s.actions.insert}
                    </Button>
                    <Button size="small" onClick={() => setMode({ kind: "edit", item })}>
                      {s.actions.edit}
                    </Button>
                    <Button size="small" onClick={() => void copy(item)}>
                      {s.actions.copy}
                    </Button>
                    <Button size="small" onClick={() => setPendingDelete(item)}>
                      {s.actions.delete}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {results.length > limit && (
            <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>{s.showMore}</Button>
          )}
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={s.workItems.deleteTitle}
          body={
            <p>
              {s.workItems.deleteBody(
                pendingDelete.code,
                library.norms.filter((n) => n.workItemId === pendingDelete.id).length
              )}
            </p>
          }
          confirmLabel={s.actions.delete}
          cancelLabel={s.actions.cancel}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
};

export default WorkItemsPanel;
