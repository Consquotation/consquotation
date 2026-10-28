import * as React from "react";
import { FieldProps, InfoLabel, LabelProps, tokens } from "@fluentui/react-components";
import { ErrorCircle16Filled } from "@fluentui/react-icons";
import { STRINGS } from "../../shared/strings.vi";

/**
 * Nhãn ô nhập kèm biểu tượng gợi ý, thay cho dòng chữ dưới ô để form gọn trong task pane.
 * "info": hướng dẫn cố định (biểu tượng i). "warning": lưu ý theo tình huống (dấu ! màu cảnh báo).
 * Bấm biểu tượng để xem. Lỗi nhập liệu vẫn hiện dưới ô (validationMessage), không đưa vào đây.
 */
export function hintLabel(
  label: string,
  hint: string | undefined,
  kind: "info" | "warning" = "info"
): FieldProps["label"] {
  if (!hint) {
    return label;
  }
  const infoButton =
    kind === "warning"
      ? {
          "aria-label": STRINGS.fieldHint.warning,
          children: <ErrorCircle16Filled style={{ color: tokens.colorStatusWarningForeground1 }} />,
        }
      : { "aria-label": STRINGS.fieldHint.info };
  return {
    children: (_: unknown, slotProps: LabelProps) => (
      <InfoLabel {...slotProps} info={hint} infoButton={infoButton}>
        {label}
      </InfoLabel>
    ),
  };
}
