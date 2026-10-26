import * as React from "react";
import {
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ValidityBadge, formatMoney } from "./common";
import ListFilters, { useListFilter } from "./ListFilters";
import WorkItemEditor from "./WorkItemEditor";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { formatIsoDate, todayIso, validityOn } from "../../../domain/library/dates";
import { nameLookup, searchWorkItems } from "../../../domain/library/search";
import { LibrarySnapshot, WorkItem } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

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
  itemName: { wordBreak: "break-word" },
  itemActions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
});

type Mode = { kind: "list" } | { kind: "edit"; item: WorkItem | null };

export interface WorkItemsPanelProps {
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  onInsert: (item: WorkItem) => void;
  notify: (message: string) => void;
  /** Mở thẳng form thêm mới (nút ở phần tổng quan thư viện). */
  startNew?: number;
}

const WorkItemsPanel: React.FC<WorkItemsPanelProps> = ({ service, library, reload, onInsert, notify, startNew }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const { filter, rawQuery, setQuery, update } = useListFilter();
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = React.useState<WorkItem | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const today = todayIso();

  React.useEffect(() => {
    if (startNew) {
      setMode({ kind: "edit", item: null });
    }
  }, [startNew]);
  React.useEffect(() => setLimit(PAGE_SIZE), [filter]);

  const lookup = React.useMemo(() => nameLookup(library), [library]);
  const results = React.useMemo(
    () => searchWorkItems(library.workItems, filter, lookup),
    [library.workItems, filter, lookup]
  );
  const normCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    library.norms.forEach((n) => counts.set(n.workItemId, (counts.get(n.workItemId) ?? 0) + 1));
    return counts;
  }, [library.norms]);

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

  /** Lỗi lưu trữ (IndexedDB) sau khi người dùng đã xác nhận: báo rõ, không im lặng. */
  const guarded = (task: () => Promise<void>) =>
    exclusive(async () => {
      setFailure(null);
      try {
        await task();
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });

  const copy = (item: WorkItem) =>
    guarded(async () => {
      const created = await service.copyWorkItem(item.id, library);
      await reload();
      notify(s.copied(created.code));
    });

  const confirmDelete = () =>
    guarded(async () => {
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
      {failure && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            {s.actionFailed}: {failure}
          </MessageBarBody>
        </MessageBar>
      )}

      {library.workItems.length === 0 ? (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.workItems.empty}</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <ListFilters
            rawQuery={rawQuery}
            setQuery={setQuery}
            filter={filter}
            update={update}
            categories={library.categories}
            suppliers={library.suppliers}
          />
          <Caption1 aria-live="polite">{s.count(results.length, library.workItems.length)}</Caption1>
          {results.length === 0 && <Caption1>{s.noResults}</Caption1>}
          <ul className={styles.list}>
            {results.slice(0, limit).map((item) => {
              const normCount = normCounts.get(item.id) ?? 0;
              const dates =
                item.effectiveFrom || item.effectiveTo
                  ? `${formatIsoDate(item.effectiveFrom) || "…"} – ${formatIsoDate(item.effectiveTo) || "…"}`
                  : "";
              return (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <Text weight="semibold" className={styles.itemName}>
                      {item.code}: {item.name}
                    </Text>
                    {item.unitPrice !== null && (
                      <ValidityBadge validity={validityOn(item.effectiveFrom, item.effectiveTo, today)} />
                    )}
                  </div>
                  <Caption1>
                    {[
                      `${formatMoney(item.unitPrice, item.currency)} / ${item.unit}`,
                      item.categoryId ? lookup.category.get(item.categoryId) : s.noGroup,
                      item.supplierId ? lookup.supplier.get(item.supplierId) : "",
                      item.source,
                      dates,
                      normCount > 0 ? `${normCount} định mức` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
                pendingDelete.name,
                normCounts.get(pendingDelete.id) ?? 0
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
