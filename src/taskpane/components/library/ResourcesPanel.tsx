import * as React from "react";
import { Button, Caption1, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import { formatMoney } from "./common";
import ListFilters, { useListFilter } from "./ListFilters";
import ResourceEditor from "./ResourceEditor";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { todayIso } from "../../../domain/library/dates";
import { currentPrice, nameLookup, searchResources } from "../../../domain/library/search";
import { LibrarySnapshot, Resource } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

const PAGE_SIZE = 50;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
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
});

type Mode = { kind: "list" } | { kind: "edit"; id: string | null };

const ResourcesPanel: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  /** Mở thẳng form thêm mới (nút ở phần tổng quan thư viện). */
  startNew?: number;
}> = ({ service, library, reload, notify, startNew }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const { filter, rawQuery, setQuery, update } = useListFilter();
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = React.useState<Resource | null>(null);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const exclusive = useExclusive();
  const today = todayIso();

  React.useEffect(() => {
    if (startNew) {
      setMode({ kind: "edit", id: null });
    }
  }, [startNew]);
  React.useEffect(() => setLimit(PAGE_SIZE), [filter]);

  const lookup = React.useMemo(() => nameLookup(library), [library]);
  const results = React.useMemo(
    () => searchResources(library.resources, library.resourcePrices, filter, lookup, today),
    [library.resources, library.resourcePrices, filter, lookup, today]
  );
  const priceCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    library.resourcePrices.forEach((p) => counts.set(p.resourceId, (counts.get(p.resourceId) ?? 0) + 1));
    return counts;
  }, [library.resourcePrices]);

  if (mode.kind === "edit") {
    const editing = mode.id ? library.resources.find((r) => r.id === mode.id) ?? null : null;
    return (
      <ResourceEditor
        key={editing?.id ?? "new"}
        service={service}
        library={library}
        editing={editing}
        onLibraryChanged={reload}
        onCancel={() => setMode({ kind: "list" })}
        onSaved={async (resource) => {
          await reload();
          notify(s.saved(resource.code));
          // Tài nguyên mới: ở lại để thêm giá ngay.
          setMode(mode.id ? { kind: "list" } : { kind: "edit", id: resource.id });
        }}
      />
    );
  }

  const confirmDelete = () =>
    exclusive(async () => {
      if (!pendingDelete) {
        return;
      }
      const resource = pendingDelete;
      setPendingDelete(null);
      try {
        const result = await service.deleteResource(resource.id, library);
        if (!result.ok) {
          setBlocked(s.resources.inUse(result.normCount));
          return;
        }
      } catch (error) {
        setBlocked(`${s.actionFailed}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      setBlocked(null);
      await reload();
      notify(s.deleted(resource.code));
    });

  const priceText = (r: Resource): string => {
    const current = currentPrice(r.id, library.resourcePrices, today);
    if (current.price) {
      return s.resources.currentPrice(`${formatMoney(current.price.price, current.price.currency)} / ${current.price.unit}`);
    }
    if (current.activeCount > 1) {
      return s.resources.manyActive(current.activeCount);
    }
    return (priceCounts.get(r.id) ?? 0) === 0 ? s.resources.priceCount(0) : s.resources.noActive;
  };

  return (
    <section className={styles.root} aria-label={s.sections.resources}>
      <div>
        <Button appearance="primary" onClick={() => setMode({ kind: "edit", id: null })}>
          {s.resources.add}
        </Button>
      </div>
      {blocked && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>{blocked}</MessageBarBody>
        </MessageBar>
      )}
      {library.resources.length === 0 ? (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.resources.empty}</MessageBarBody>
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
            showType
          />
          <Caption1 aria-live="polite">{s.count(results.length, library.resources.length)}</Caption1>
          {results.length === 0 && <Caption1>{s.noResults}</Caption1>}
          <ul className={styles.list}>
            {results.slice(0, limit).map((r) => (
              <li key={r.id} className={styles.item}>
                <Text weight="semibold" className={styles.name}>
                  {r.code}: {r.name}
                </Text>
                <Caption1>
                  {[
                    s.resources.types[r.type],
                    r.categoryId ? lookup.category.get(r.categoryId) : s.noGroup,
                    r.unit,
                    priceText(r),
                    s.resources.priceCount(priceCounts.get(r.id) ?? 0),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Caption1>
                <div className={styles.actions}>
                  <Button size="small" onClick={() => setMode({ kind: "edit", id: r.id })}>
                    {s.actions.edit}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      // Đang được định mức dùng → báo ngay, không hỏi "Xóa?" rồi mới chặn.
                      const normCount = library.normComponents.filter((c) => c.resourceId === r.id).length;
                      if (normCount > 0) {
                        setBlocked(s.resources.inUse(normCount));
                        return;
                      }
                      setBlocked(null);
                      setPendingDelete(r);
                    }}
                  >
                    {s.actions.delete}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {results.length > limit && <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>{s.showMore}</Button>}
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={s.resources.deleteTitle}
          body={
            <p>
              {s.resources.deleteBody(
                pendingDelete.code,
                pendingDelete.name,
                priceCounts.get(pendingDelete.id) ?? 0
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

export default ResourcesPanel;
