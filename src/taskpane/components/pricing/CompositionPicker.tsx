import * as React from "react";
import {
  Body1,
  Caption1,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { AnalysisPrice } from "../../../application/pricingGateway";
import { formatIsoDate } from "../../../domain/library/dates";
import { CompositionLine, CompositionResult, PriceSelection } from "../../../domain/pricing/composition";
import { RoundingRule, describeRule } from "../../../domain/pricing/rounding";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";
import { PRICING_STRINGS } from "../../../shared/strings.pricing.vi";
import { formatMoney, formatQuantity } from "../library/common";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  line: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXXS },
});

/** Chọn giá cho từng tài nguyên của định mức (prompts/10: phân tích cấu thành, truy vết được). */
const CompositionPicker: React.FC<{
  code: string;
  lines: CompositionLine[];
  selection: PriceSelection;
  onChange: (selection: PriceSelection) => void;
  result: CompositionResult;
  rule: RoundingRule;
  existing: AnalysisPrice | null;
}> = ({ code, lines, selection, onChange, result, rule, existing }) => {
  const styles = useStyles();
  const s = PRICING_STRINGS.composition;
  const validity = LIBRARY_STRINGS.validity;
  const status = LIBRARY_STRINGS.prices.status;

  return (
    <section className={styles.root} aria-labelledby="cq-composition-title">
      <Subtitle2 as="h3" id="cq-composition-title">
        {s.title}
      </Subtitle2>
      <Caption1>{s.intro}</Caption1>
      {existing && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>
            {s.exists(code, existing.kind === "value" ? formatMoney(existing.value, "") : existing.kind === "error" ? existing.error : s.existsMissing)}
          </MessageBarBody>
        </MessageBar>
      )}
      {lines.map((line) => {
        const chosen = selection[line.norm.id] ?? "";
        const option = line.options.find((o) => o.price.id === chosen);
        const usableCount = line.options.filter((o) => o.usable).length;
        const label = line.resource
          ? `${line.resource.code} — ${line.resource.name}`
          : s.missingResource;
        return (
          <div key={line.norm.id} className={styles.line}>
            <Field
              label={label}
              hint={
                line.options.length === 0
                  ? s.noOptions
                  : chosen && chosen === line.defaultPriceId
                    ? s.onlyValid
                    : usableCount > 1 && !chosen
                      ? s.mustChoose
                      : undefined
              }
            >
              <Select
                value={chosen}
                disabled={existing !== null}
                onChange={(_e, data) => onChange({ ...selection, [line.norm.id]: data.value })}
              >
                <option value="">{s.noPrice}</option>
                {line.options.map((o) => (
                  <option key={o.price.id} value={o.price.id} disabled={!o.unitMatches}>
                    {s.priceOption(
                      formatMoney(o.price.price, o.price.currency),
                      o.price.unit,
                      status[o.price.status],
                      o.validity === "noDates"
                        ? validity.noDates
                        : `${validity[o.validity]} (${formatIsoDate(o.price.effectiveFrom) || "…"} – ${formatIsoDate(o.price.effectiveTo) || "…"})`,
                      o.price.source
                    )}
                    {o.unitMatches ? "" : s.unitMismatch}
                  </option>
                ))}
              </Select>
            </Field>
            <Caption1>
              {s.quantity(formatQuantity(line.norm.quantity), line.resource?.unit ?? "")}
              {option ? ` × ${formatMoney(option.price.price, "")} ${s.lineAmount(formatMoney(line.norm.quantity * option.price.price, ""))}` : ""}
            </Caption1>
          </div>
        );
      })}
      {existing === null && (
        <>
          <Body1>
            {result.preview !== null
              ? s.preview(formatMoney(result.preview, ""), result.currency, describeRule(rule))
              : s.previewMissing}
          </Body1>
          {result.errors.length > 0 && (
            <MessageBar intent="error" layout="multiline" politeness="assertive">
              <MessageBarBody>
                {result.errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </MessageBarBody>
            </MessageBar>
          )}
          {result.warnings.length > 0 && (
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>
                {result.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </MessageBarBody>
            </MessageBar>
          )}
        </>
      )}
    </section>
  );
};

export default CompositionPicker;
