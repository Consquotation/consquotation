import * as React from "react";
import {
  Badge,
  Field,
  Input,
  InputProps,
  Select,
  Textarea,
  makeStyles,
} from "@fluentui/react-components";
import { Validity } from "../../../domain/library/dates";
import { compareText } from "../../../domain/library/search";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

/** Ô nhập có nhãn và thông báo lỗi tiếng Việt. */
export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: InputProps["type"];
  multiline?: boolean;
  inputMode?: InputProps["inputMode"];
  disabled?: boolean;
}> = ({ label, value, onChange, error, hint, required, type, multiline, inputMode, disabled }) => (
  <Field label={label} required={required} validationMessage={error} hint={hint}>
    {multiline ? (
      <Textarea
        value={value}
        disabled={disabled}
        onChange={(_e, data) => onChange(data.value)}
        resize="vertical"
      />
    ) : (
      <Input
        type={type}
        value={value}
        inputMode={inputMode}
        disabled={disabled}
        onChange={(_e, data) => onChange(data.value)}
      />
    )}
  </Field>
);

const VALIDITY_COLOR: Record<Validity, "success" | "warning" | "danger" | "informative"> = {
  active: "success",
  noDates: "informative",
  notYetEffective: "warning",
  expired: "danger",
};

export const ValidityBadge: React.FC<{ validity: Validity }> = ({ validity }) => (
  <Badge appearance="tint" color={VALIDITY_COLOR[validity]}>
    {LIBRARY_STRINGS.validity[validity]}
  </Badge>
);

export function formatMoney(value: number | null, currency: string): string {
  if (value === null) {
    return LIBRARY_STRINGS.workItems.noPrice;
  }
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}${currency ? ` ${currency}` : ""}`;
}

export function formatQuantity(value: number): string {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

export function errorFor<F extends string>(
  errors: { field: F; message: string }[],
  field: F
): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

/** Màu nhãn trạng thái phiên bản định mức. */
export const STATUS_COLOR: Record<
  "draft" | "approved" | "inactive",
  "informative" | "success" | "subtle"
> = {
  draft: "informative",
  approved: "success",
  inactive: "subtle",
};

/** Giá trị đặc biệt của ô chọn: tạo nhóm/nhà cung cấp mới ngay trong form. */
export const NEW_REF = "__new__";

// Tên dài trong danh sách không được làm ô chọn rộng hơn task pane.
const useRefSelectStyles = makeStyles({
  field: { minWidth: 0 },
  select: { width: "100%", minWidth: 0 },
});

/**
 * Ô chọn nhóm hoặc nhà cung cấp. "" = không chọn. Có `newLabel` thì thêm lựa chọn tạo mới; khi chọn,
 * hiện ô nhập tên mới (form tự tạo bản ghi lúc lưu).
 */
export const RefSelect: React.FC<{
  label: string;
  value: string;
  options: readonly { id: string; name: string }[];
  noneLabel: string;
  onChange: (value: string) => void;
  error?: string;
  newLabel?: string;
  newName?: string;
  newNameLabel?: string;
  onNewNameChange?: (value: string) => void;
}> = (props) => {
  const sorted = React.useMemo(
    () => [...props.options].sort((a, b) => compareText(a.name, b.name)),
    [props.options]
  );
  const styles = useRefSelectStyles();
  const creating = props.value === NEW_REF;
  return (
    <>
      <Field
        label={props.label}
        validationMessage={creating ? undefined : props.error}
        className={styles.field}
      >
        <Select
          value={props.value}
          onChange={(_e, data) => props.onChange(data.value)}
          className={styles.select}
        >
          <option value="">{props.noneLabel}</option>
          {sorted.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          {props.newLabel && <option value={NEW_REF}>{props.newLabel}</option>}
        </Select>
      </Field>
      {creating && props.onNewNameChange && (
        <TextField
          label={props.newNameLabel ?? props.label}
          required
          value={props.newName ?? ""}
          onChange={props.onNewNameChange}
          error={props.error}
        />
      )}
    </>
  );
};
