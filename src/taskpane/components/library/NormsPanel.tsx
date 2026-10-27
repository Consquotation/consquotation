import * as React from "react";
import {
  Badge,
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
import NormEditor from "./NormEditor";
import { STATUS_COLOR } from "./common";
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { NormExportGateway } from "../../../application/normExportGateway";
import { NONE, compareCodes, compareText, normalizeForSearch } from "../../../domain/library/search";
import { LibrarySnapshot, NORM_STATUSES, Norm, NormStatus } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { NORM_UI } from "../../../shared/strings.norms.vi";
import { useExclusive } from "../../useExclusive";

/* global clearTimeout, setTimeout */

const PAGE_SIZE = 50;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: tokens.spacingHorizontalS,
    alignItems: "end",
  },
  search: { gridColumn: "1 / -1" },
  field: { minWidth: 0 },
  select: { width: "100%", minWidth: 0 },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", columnGap: tokens.spacingHorizontalS },
  name: { wordBreak: "break-word" },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
});

type Mode = { kind: "list" } | { kind: "edit"; id: string | null };

const NormsPanel: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  exporter: NormExportGateway;
}> = ({ service, library, reload, notify, exporter }) => {
  const styles = useStyles();
  const s = NORM_UI;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [status, setStatus] = React.useState<NormStatus | "">("");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = React.useState<Norm | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const exclusive = useExclusive();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  React.useEffect(() => setLimit(PAGE_SIZE), [debounced, categoryId, status]);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    library.normComponents.forEach((c) => map.set(c.normId, (map.get(c.normId) ?? 0) + 1));
    return map;
  }, [library.normComponents]);
  const workItemCode = React.useMemo(
    () => new Map(library.workItems.map((w) => [w.id, w.code])),
    [library.workItems]
  );
  const categoryName = React.useMemo(
    () => new Map(library.categories.map((c) => [c.id, c.name])),
    [library.categories]
  );
  const results = React.useMemo(() => {
    const terms = normalizeForSearch(debounced).split(" ").filter(Boolean);
    return library.norms
      .filter((n) => {
        if (status && n.status !== status) {
          return false;
        }
        if (categoryId === NONE ? n.categoryId !== null : categoryId !== "" && n.categoryId !== categoryId) {
          return false;
        }
        const haystack = normalizeForSearch(`${n.code} ${n.name} ${n.version}`);
        return terms.every((t) => haystack.includes(t));
      })
      .sort((a, b) => compareCodes(a.code, b.code) || compareCodes(a.version, b.version));
  }, [library.norms, debounced, categoryId, status]);

  if (mode.kind === "edit") {
    const editing = mode.id ? library.norms.find((n) => n.id === mode.id) ?? null : null;
    return (
      <NormEditor
        key={editing?.id ?? "new"}
        service={service}
        library={library}
        editing={editing}
        reload={reload}
        notify={notify}
        exporter={exporter}
        onBack={() => setMode({ kind: "list" })}
        onOpen={(id) => setMode({ kind: "edit", id })}
      />
    );
  }

  const guarded = (task: () => Promise<void>) =>
    exclusive(async () => {
      setFailure(null);
      try {
        await task();
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });

  const copy = (norm: Norm) =>
    guarded(async () => {
      const created = await service.copyNormAsNewVersion(norm.id, library);
      await reload();
      notify(s.copied(created.code, created.version));
      setMode({ kind: "edit", id: created.id });
    });

  const confirmDelete = () =>
    guarded(async () => {
      const target = pendingDelete;
      if (!target) {
        return;
      }
      setPendingDelete(null);
      await service.deleteNorm(target.id, library);
      await reload();
      notify(LIBRARY_STRINGS.deleted(`${target.code} v${target.version}`));
    });

  return (
    <section className={styles.root} aria-label={s.title}>
      <Caption1>{s.intro}</Caption1>
      <div>
        <Button appearance="primary" onClick={() => setMode({ kind: "edit", id: null })}>
          {s.add}
        </Button>
      </div>
      {failure && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            {LIBRARY_STRINGS.actionFailed}: {failure}
          </MessageBarBody>
        </MessageBar>
      )}
      {library.norms.length === 0 ? (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{s.empty}</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <div className={styles.filters}>
            <Field label={s.search} className={styles.search}>
              <Input type="search" value={query} onChange={(_e, data) => setQuery(data.value)} />
            </Field>
            {library.categories.length > 0 && (
              <Field label={LIBRARY_STRINGS.group} className={styles.field}>
                <Select className={styles.select} value={categoryId} onChange={(_e, data) => setCategoryId(data.value)}>
                  <option value="">{LIBRARY_STRINGS.allGroups}</option>
                  <option value={NONE}>{LIBRARY_STRINGS.noGroup}</option>
                  {[...library.categories]
                    .sort((a, b) => compareText(a.name, b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Field label={s.statusFilter} className={styles.field}>
              <Select
                className={styles.select}
                value={status}
                onChange={(_e, data) => setStatus(data.value as NormStatus | "")}
              >
                <option value="">{s.allStatuses}</option>
                {NORM_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {s.status[st]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Caption1 aria-live="polite">{LIBRARY_STRINGS.count(results.length, library.norms.length)}</Caption1>
          {results.length === 0 && <Caption1>{LIBRARY_STRINGS.noResults}</Caption1>}
          <ul className={styles.list}>
            {results.slice(0, limit).map((n) => (
              <li key={n.id} className={styles.item}>
                <div className={styles.head}>
                  <Text weight="semibold" className={styles.name}>
                    {n.code} v{n.version}: {n.name}
                  </Text>
                  <Badge appearance="tint" color={STATUS_COLOR[n.status]}>
                    {s.status[n.status]}
                  </Badge>
                </div>
                <Caption1 className={styles.name}>
                  {[
                    s.listLine(n.unit, counts.get(n.id) ?? 0),
                    n.categoryId ? categoryName.get(n.categoryId) : LIBRARY_STRINGS.noGroup,
                    n.sourceType === "document" ? s.sourceDocument(n.source, n.sourceVerified) : s.sourceUser,
                    n.workItemId && workItemCode.get(n.workItemId) ? s.linkedTo(workItemCode.get(n.workItemId)!) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Caption1>
                <div className={styles.actions}>
                  <Button size="small" appearance="primary" onClick={() => setMode({ kind: "edit", id: n.id })}>
                    {s.open}
                  </Button>
                  <Button size="small" onClick={() => void copy(n)}>
                    {s.copyVersion}
                  </Button>
                  {n.status === "draft" && (
                    <Button size="small" onClick={() => setPendingDelete(n)}>
                      {LIBRARY_STRINGS.actions.delete}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {results.length > limit && <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>{LIBRARY_STRINGS.showMore}</Button>}
        </>
      )}
      {pendingDelete && (
        <ConfirmDialog
          open
          title={s.deleteTitle}
          body={<p>{s.deleteBody(pendingDelete.code, pendingDelete.version, counts.get(pendingDelete.id) ?? 0)}</p>}
          confirmLabel={LIBRARY_STRINGS.actions.delete}
          cancelLabel={LIBRARY_STRINGS.actions.cancel}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
};

export default NormsPanel;
