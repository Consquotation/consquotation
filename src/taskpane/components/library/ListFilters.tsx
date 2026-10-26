import * as React from "react";
import { Field, Input, Select, makeStyles, tokens } from "@fluentui/react-components";
import { NONE, ResourceFilter, SortKey, compareText } from "../../../domain/library/search";
import { Category, RESOURCE_TYPES, ResourceType, Supplier } from "../../../domain/library/types";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

/* global clearTimeout, setTimeout */

const useStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: tokens.spacingHorizontalS,
    alignItems: "end",
  },
  search: { gridColumn: "1 / -1" },
  // Ô chọn không được rộng hơn cột lưới (tên nhà cung cấp dài làm tràn ngang).
  field: { minWidth: 0 },
  select: { width: "100%", minWidth: 0 },
});

/** Bộ lọc kèm truy vấn đã debounce (200 ms) để thư viện lớn không chậm khi gõ (prompts/17). */
export function useListFilter(): {
  filter: ResourceFilter;
  rawQuery: string;
  setQuery: (q: string) => void;
  update: (patch: Partial<ResourceFilter>) => void;
} {
  const [rawQuery, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<ResourceFilter>({
    query: "",
    categoryId: "",
    supplierId: "",
    sort: "code",
    type: "",
  });
  React.useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => ({ ...f, query: rawQuery })), 200);
    return () => clearTimeout(timer);
  }, [rawQuery]);
  const update = React.useCallback(
    (patch: Partial<ResourceFilter>) => setFilter((f) => ({ ...f, ...patch })),
    []
  );
  return { filter, rawQuery, setQuery, update };
}

const byName = <T extends { name: string }>(items: readonly T[]) =>
  [...items].sort((a, b) => compareText(a.name, b.name));

/** Ô tìm kiếm và các bộ lọc; ô nào không có dữ liệu để lọc (ví dụ chưa có nhà cung cấp) thì ẩn. */
const ListFilters: React.FC<{
  rawQuery: string;
  setQuery: (q: string) => void;
  filter: ResourceFilter;
  update: (patch: Partial<ResourceFilter>) => void;
  categories: readonly Category[];
  suppliers: readonly Supplier[];
  showType?: boolean;
}> = ({ rawQuery, setQuery, filter, update, categories, suppliers, showType }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS;
  return (
    <div className={styles.root}>
      <Field label={s.search} className={styles.search}>
        <Input type="search" value={rawQuery} onChange={(_e, data) => setQuery(data.value)} />
      </Field>
      {categories.length > 0 && (
        <Field label={s.group} className={styles.field}>
          <Select
            className={styles.select}
            value={filter.categoryId}
            onChange={(_e, data) => update({ categoryId: data.value })}
          >
            <option value="">{s.allGroups}</option>
            <option value={NONE}>{s.noGroup}</option>
            {byName(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {showType && (
        <Field label={s.type} className={styles.field}>
          <Select
            className={styles.select}
            value={filter.type}
            onChange={(_e, data) => update({ type: data.value as ResourceType | "" })}
          >
            <option value="">{s.allTypes}</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {s.resources.types[t]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {suppliers.length > 0 && (
        <Field label={s.supplier} className={styles.field}>
          <Select
            className={styles.select}
            value={filter.supplierId}
            onChange={(_e, data) => update({ supplierId: data.value })}
          >
            <option value="">{s.allSuppliers}</option>
            <option value={NONE}>{s.noSupplier}</option>
            {byName(suppliers).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={s.sort} className={styles.field}>
        <Select
          className={styles.select}
          value={filter.sort}
          onChange={(_e, data) => update({ sort: data.value as SortKey })}
        >
          <option value="code">{s.sortBy.code}</option>
          <option value="name">{s.sortBy.name}</option>
          <option value="price">{s.sortBy.price}</option>
        </Select>
      </Field>
    </div>
  );
};

export default ListFilters;
