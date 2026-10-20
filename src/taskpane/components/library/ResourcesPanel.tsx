import * as React from "react";
import { Button, Caption1, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import ResourceEditor from "./ResourceEditor";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { searchResources } from "../../../domain/library/search";
import { LibrarySnapshot, Resource } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { useExclusive } from "../../useExclusive";

/* global clearTimeout, setTimeout */

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
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
});

type Mode = { kind: "list" } | { kind: "edit"; id: string | null };

const ResourcesPanel: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}> = ({ service, library, reload, notify }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = React.useState<Resource | null>(null);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const exclusive = useExclusive();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  React.useEffect(() => setLimit(PAGE_SIZE), [debounced]);
  const results = React.useMemo(() => searchResources(library.resources, debounced), [library.resources, debounced]);

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
      const result = await service.deleteResource(resource.id, library);
      if (!result.ok) {
        setBlocked(s.resources.inUse(result.normCount));
        return;
      }
      setBlocked(null);
      await reload();
      notify(s.deleted(resource.code));
    });

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
          <Field label={s.search}>
            <Input type="search" value={query} onChange={(_e, data) => setQuery(data.value)} />
          </Field>
          <Caption1 aria-live="polite">{s.count(results.length, library.resources.length)}</Caption1>
          {results.length === 0 && <Caption1>{s.noResults}</Caption1>}
          <ul className={styles.list}>
            {results.slice(0, limit).map((r) => {
              const priceCount = library.resourcePrices.filter((p) => p.resourceId === r.id).length;
              return (
                <li key={r.id} className={styles.item}>
                  <Text weight="semibold">
                    {r.code} — {r.name}
                  </Text>
                  <Caption1>
                    {s.resources.types[r.type]} · {r.unit} · {s.resources.priceCount(priceCount)}
                  </Caption1>
                  <div className={styles.actions}>
                    <Button size="small" onClick={() => setMode({ kind: "edit", id: r.id })}>
                      {s.actions.edit}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        // Đang được định mức dùng → báo ngay, không hỏi "Xóa?" rồi mới chặn.
                        const normCount = library.norms.filter((n) => n.resourceId === r.id).length;
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
              );
            })}
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
                library.resourcePrices.filter((p) => p.resourceId === pendingDelete.id).length
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
