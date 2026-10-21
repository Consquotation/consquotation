import * as React from "react";
import {
  Badge,
  Body1,
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import { PricingGateway } from "../../../application/pricingGateway";
import { TargetChangedError } from "../../../application/workbookGateway";
import { PriceMethod, QuoteCheckResult, QuoteSnapshot, checkQuote } from "../../../domain/pricing/quoteCheck";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRICING_STRINGS } from "../../../shared/strings.pricing.vi";
import { useExclusive } from "../../useExclusive";

const MAX_SHOWN = 200;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    alignItems: "flex-start",
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  text: { flexGrow: 1, display: "flex", flexDirection: "column" },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
});

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; snapshot: QuoteSnapshot; result: QuoteCheckResult; at: string }
  | { kind: "error"; message: string };

/** Kiểm tra báo giá (prompts/10, 13): đọc trực tiếp sheet, chỉ báo; sửa cần xác nhận. */
const QuoteCheckPanel: React.FC<{ pricing: PricingGateway; tableName: string }> = ({ pricing, tableName }) => {
  const styles = useStyles();
  const s = PRICING_STRINGS.check;
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const [notice, setNotice] = React.useState<{ intent: "success" | "warning"; text: string } | null>(null);
  const [confirmFix, setConfirmFix] = React.useState(false);
  const exclusive = useExclusive();

  const run = React.useCallback(async () => {
    if (!tableName) {
      return;
    }
    setState({ kind: "running" });
    try {
      const snapshot = await pricing.readQuoteSnapshot(tableName);
      setState({ kind: "done", snapshot, result: checkQuote(snapshot), at: new Date().toLocaleTimeString("vi-VN") });
    } catch (error) {
      setState({ kind: "error", message: describeOfficeError(error) });
    }
  }, [pricing, tableName]);

  React.useEffect(() => {
    setState({ kind: "idle" });
    setNotice(null);
  }, [tableName]);

  const fixes = state.kind === "done" ? state.result.issues.filter((i) => i.fix) : [];

  const applyFixes = () =>
    exclusive(async () => {
      setConfirmFix(false);
      if (state.kind !== "done") {
        return;
      }
      try {
        const count = await pricing.setUnitPrices(
          fixes.map((issue) => ({
            sheetName: issue.sheetName,
            address: issue.address,
            expected: issue.fix!.previous,
            value: issue.fix!.value,
          }))
        );
        setNotice({ intent: "success", text: s.fixed(count) });
      } catch (error) {
        setNotice({
          intent: "warning",
          text: error instanceof TargetChangedError ? s.changed : describeOfficeError(error),
        });
      }
      await run();
    });

  const goTo = (sheetName: string, address: string) =>
    pricing.goTo(sheetName, address).catch((error) => setNotice({ intent: "warning", text: describeOfficeError(error) }));

  const methodCounts =
    state.kind === "done"
      ? state.result.methods.reduce<Partial<Record<PriceMethod, number>>>(
          (acc, m) => ({ ...acc, [m.method]: (acc[m.method] ?? 0) + 1 }),
          {}
        )
      : {};

  return (
    <section className={styles.root} aria-labelledby="cq-check-title">
      <Subtitle2 as="h2" id="cq-check-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      <div className={styles.row}>
        <Button appearance="primary" disabled={!tableName || state.kind === "running"} onClick={() => void exclusive(run)}>
          {s.run}
        </Button>
        {state.kind === "running" && <Spinner size="tiny" />}
      </div>
      {notice && (
        <MessageBar intent={notice.intent} layout="multiline" politeness="polite">
          <MessageBarBody>{notice.text}</MessageBarBody>
        </MessageBar>
      )}
      {state.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>{state.message}</MessageBarBody>
        </MessageBar>
      )}
      {state.kind === "done" && (
        <>
          {state.result.issues.length === 0 ? (
            <MessageBar intent="success" politeness="polite">
              <MessageBarBody>{s.ok(state.result.rowCount)}</MessageBarBody>
            </MessageBar>
          ) : (
            <Body1 role="status">
              {s.counts(
                state.result.issues.filter((i) => i.severity === "error").length,
                state.result.issues.filter((i) => i.severity === "warning").length,
                state.result.rowCount
              )}
            </Body1>
          )}
          {fixes.length > 0 && (
            <div className={styles.row}>
              <Button onClick={() => setConfirmFix(true)}>{s.fixAll(fixes.length)}</Button>
            </div>
          )}
          <ul className={styles.list} aria-label={s.title}>
            {state.result.issues.slice(0, MAX_SHOWN).map((issue, i) => (
              <li key={i} className={styles.item}>
                <Badge appearance="tint" color={issue.severity === "error" ? "danger" : "warning"}>
                  {issue.severity === "error" ? s.error : s.warning}
                </Badge>
                <div className={styles.text}>
                  <Caption1>
                    {issue.sheetName} · {issue.location} · {issue.address}
                  </Caption1>
                  <Body1>{issue.message}</Body1>
                </div>
                <Button size="small" onClick={() => void goTo(issue.sheetName, issue.address)}>
                  {s.goTo}
                </Button>
              </li>
            ))}
          </ul>
          <Subtitle2 as="h3">{s.methodsTitle}</Subtitle2>
          <Body1>
            {(Object.keys(methodCounts) as PriceMethod[])
              .map((m) => `${s.methods[m]}: ${methodCounts[m]}`)
              .join(" · ") || "—"}
          </Body1>
          <ul className={styles.list} aria-label={s.methodsTitle}>
            {state.result.methods
              .filter((m) => m.method !== "direct")
              .slice(0, MAX_SHOWN)
              .map((m, i) => (
                <li key={i} className={styles.item}>
                  <div className={styles.text}>
                    <Caption1>
                      {m.location} · {m.code || "—"} · {s.methods[m.method]}
                    </Caption1>
                    {m.source && <Body1>{m.source}</Body1>}
                  </div>
                </li>
              ))}
          </ul>
          <Caption1>{s.checkedAt(state.at)}</Caption1>
          <Caption1>{s.circularNote}</Caption1>
        </>
      )}
      <ConfirmDialog
        open={confirmFix}
        title={s.fixTitle}
        body={s.fixBody(fixes.length)}
        confirmLabel={PRICING_STRINGS.confirm}
        cancelLabel={PRICING_STRINGS.cancel}
        onConfirm={() => void applyFixes()}
        onCancel={() => setConfirmFix(false)}
      />
    </section>
  );
};

export default QuoteCheckPanel;
