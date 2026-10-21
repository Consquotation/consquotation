import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import { PricingGateway } from "../../../application/pricingGateway";
import {
  DEFAULT_ROUNDING,
  ROUNDING_LEVELS,
  RoundingConfig,
  RoundingLevel,
  RoundingMode,
  describeRule,
} from "../../../domain/pricing/rounding";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRICING_STRINGS } from "../../../shared/strings.pricing.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  level: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  wide: { gridColumn: "1 / -1" },
  row: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center" },
});

/** Quy tắc làm tròn của workbook: độ chính xác, kiểu làm tròn, cấp làm tròn (prompts/10). */
const RoundingPanel: React.FC<{ pricing: PricingGateway }> = ({ pricing }) => {
  const styles = useStyles();
  const s = PRICING_STRINGS.rounding;
  const [saved, setSaved] = React.useState<RoundingConfig | null>(null);
  const [config, setConfig] = React.useState<RoundingConfig>(DEFAULT_ROUNDING);
  const [confirming, setConfirming] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [message, setMessage] = React.useState<{ intent: "success" | "error"; text: string } | null>(null);
  const exclusive = useExclusive();

  React.useEffect(() => {
    pricing.readRounding().then(
      (current) => {
        setSaved(current);
        setConfig(current);
      },
      (error) => setMessage({ intent: "error", text: describeOfficeError(error) })
    );
  }, [pricing]);

  const set = (level: RoundingLevel, patch: Partial<RoundingConfig[RoundingLevel]>) =>
    setConfig((c) => ({ ...c, [level]: { ...c[level], ...patch } }));

  const apply = () =>
    exclusive(async () => {
      setConfirming(false);
      setWorking(true);
      setMessage(null);
      try {
        const result = await pricing.applyRounding(config);
        setSaved(config);
        setMessage({ intent: "success", text: s.applied(result.updatedCells, result.keptCells) });
      } catch (error) {
        setMessage({ intent: "error", text: describeOfficeError(error) });
      } finally {
        setWorking(false);
      }
    });


  return (
    <section className={styles.root} aria-labelledby="cq-rounding-title">
      <Subtitle2 as="h2" id="cq-rounding-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      {saved === null && !message && <Spinner size="tiny" />}
      {saved !== null &&
        ROUNDING_LEVELS.map((level) => (
          <div key={level} className={styles.level} role="group" aria-label={s.levels[level]}>
            <Body1 className={styles.wide}>
              <strong>{s.levels[level]}</strong>
            </Body1>
            <Field label={s.mode}>
              <Select value={config[level].mode} onChange={(_e, d) => set(level, { mode: d.value as RoundingMode })}>
                {(Object.keys(s.modes) as RoundingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {s.modes[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.digits}>
              <Select
                value={String(config[level].digits)}
                disabled={config[level].mode === "none"}
                onChange={(_e, d) => set(level, { digits: Number(d.value) })}
              >
                {s.digitOptions.map(([digits, label]) => (
                  <option key={digits} value={String(digits)}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Caption1 className={styles.wide}>
              {s.current(describeRule(saved[level]))} {s.levelHint[level]}
            </Caption1>
          </div>
        ))}
      <div className={styles.row}>
        <Button appearance="primary" disabled={saved === null || working} onClick={() => setConfirming(true)}>
          {s.apply}
        </Button>
        {working && <Spinner size="tiny" />}
      </div>
      {message && (
        <MessageBar intent={message.intent} layout="multiline" politeness={message.intent === "error" ? "assertive" : "polite"}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={confirming}
        title={s.confirmTitle}
        body={s.confirmBody}
        confirmLabel={PRICING_STRINGS.confirm}
        cancelLabel={PRICING_STRINGS.cancel}
        onConfirm={() => void apply()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
};

export default RoundingPanel;
