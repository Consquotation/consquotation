import * as React from "react";
import { Badge, Field, Input, InputProps, Textarea } from "@fluentui/react-components";
import { Validity } from "../../../domain/library/dates";
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
}> = ({ label, value, onChange, error, hint, required, type, multiline, inputMode }) => (
  <Field label={label} required={required} validationMessage={error} hint={hint}>
    {multiline ? (
      <Textarea value={value} onChange={(_e, data) => onChange(data.value)} resize="vertical" />
    ) : (
      <Input type={type} value={value} inputMode={inputMode} onChange={(_e, data) => onChange(data.value)} />
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

export function errorFor<F extends string>(errors: { field: F; message: string }[], field: F): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}
