import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import { PricingGateway, SummaryState } from "../../../application/pricingGateway";
import { TargetChangedError } from "../../../application/workbookGateway";
import {
  Adjustment,
  AdjustmentError,
  AdjustmentKind,
  AdjustmentMethod,
  validateAdjustments,
} from "../../../domain/pricing/adjustments";
import { parseDecimalInput } from "../../../domain/workItemDraft";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRICING_STRINGS } from "../../../shared/strings.pricing.vi";
import { STRINGS } from "../../../shared/strings.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  item: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
});

/** Dòng đang sửa: giá trị giữ dạng chữ người dùng gõ cho tới khi áp dụng. */
interface Draft {
  key: number;
  name: string;
  kind: AdjustmentKind;
  method: AdjustmentMethod;
  value: string;
}

let nextKey = 1;
const toDraft = (a: Adjustment): Draft => ({
  key: nextKey++,
  name: a.name,
  kind: a.kind,
  method: a.method,
  value: a.value === null ? "" : String(a.value),
});

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "confirm"; adjustments: Adjustment[]; address: string; fingerprint: string }
  | { kind: "confirmRemove" }
  | { kind: "message"; intent: "success" | "warning" | "error"; text: string };

/** Cấu hình chiết khấu/phụ phí/thuế và thứ tự áp dụng (prompts/10). Không có tỷ lệ mặc định. */
const SummaryPanel: React.FC<{ pricing: PricingGateway; tableName: string }> = ({ pricing, tableName }) => {
  const styles = useStyles();
  const s = PRICING_STRINGS.summary;
  const [state, setState] = React.useState<SummaryState | null>(null);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [errors, setErrors] = React.useState<AdjustmentError[]>([]);
  const [valueErrors, setValueErrors] = React.useState<Record<number, string>>({});
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const exclusive = useExclusive();

  const load = React.useCallback(async () => {
    if (!tableName) {
      return;
    }
    try {
      const current = await pricing.readSummary(tableName);
      setState(current);
      setDrafts(current.adjustments.map(toDraft));
      setErrors([]);
      setValueErrors({});
    } catch (error) {
      setPhase({ kind: "message", intent: "error", text: describeOfficeError(error) });
    }
  }, [pricing, tableName]);

  React.useEffect(() => {
    setPhase({ kind: "idle" });
    void load();
  }, [load]);

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const move = (index: number, delta: number) =>
    setDrafts((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const apply = () =>
    exclusive(async () => {
      const parsedErrors: Record<number, string> = {};
      const adjustments: Adjustment[] = drafts.map((d, i) => {
        const parsed = parseDecimalInput(d.value);
        if (!parsed.ok) {
          parsedErrors[i] = parsed.message;
        }
        return { name: d.name.trim(), kind: d.kind, method: d.method, value: parsed.ok ? parsed.value : null };
      });
      const validation = validateAdjustments(adjustments);
      setValueErrors(parsedErrors);
      setErrors(validation);
      if (validation.length > 0 || Object.keys(parsedErrors).length > 0) {
        setPhase({ kind: "message", intent: "error", text: s.errors });
        return;
      }
      setPhase({ kind: "working" });
      try {
        // Người dùng có thể đã sửa bảng tổng hợp trực tiếp trên sheet sau khi panel tải (prompts/07):
        // so với lần đọc trước; khác thì tải lại thay vì ghi đè thay đổi đó.
        const now = await pricing.readSummary(tableName);
        if (JSON.stringify(now.adjustments) !== JSON.stringify(state?.adjustments ?? []) || now.exists !== (state?.exists ?? false)) {
          await load();
          setPhase({ kind: "message", intent: "warning", text: s.changedOnSheet });
          return;
        }
        const check = await pricing.inspectSummary(tableName, adjustments.length);
        if (!check.ok) {
          const b = s.blocked;
          const text =
            check.reason === "occupied" ? b.occupied((check.sample ?? []).join(", ")) : b[check.reason];
          setPhase({ kind: "message", intent: "error", text });
          return;
        }
        setPhase({ kind: "confirm", adjustments, address: check.address, fingerprint: check.fingerprint });
      } catch (error) {
        setPhase({ kind: "message", intent: "error", text: describeOfficeError(error) });
      }
    });

  const write = (adjustments: Adjustment[], fingerprint: string) =>
    exclusive(async () => {
      setPhase({ kind: "working" });
      try {
        await pricing.writeSummary(tableName, adjustments, fingerprint);
        await load();
        setPhase({ kind: "message", intent: "success", text: s.written });
      } catch (error) {
        setPhase({
          kind: "message",
          intent: error instanceof TargetChangedError ? "warning" : "error",
          text: error instanceof TargetChangedError ? STRINGS.create.changed : describeOfficeError(error),
        });
      }
    });

  const remove = () =>
    exclusive(async () => {
      setPhase({ kind: "working" });
      try {
        await pricing.removeSummary(tableName);
        await load();
        setPhase({ kind: "message", intent: "success", text: s.removed });
      } catch (error) {
        setPhase({ kind: "message", intent: "error", text: describeOfficeError(error) });
      }
    });

  const errorOf = (index: number, field: "name" | "value") =>
    (field === "value" ? valueErrors[index] : undefined) ??
    errors.find((e) => e.index === index && e.field === field)?.message;

  return (
    <section className={styles.root} aria-labelledby="cq-summary-title">
      <Subtitle2 as="h2" id="cq-summary-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      {state === null && tableName && <Spinner size="tiny" />}
      {state && <Caption1>{state.exists ? s.existing(state.address) : s.none}</Caption1>}
      {state && state.invalidRows > 0 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{s.invalidRows(state.invalidRows)}</MessageBarBody>
        </MessageBar>
      )}

      {drafts.map((d, index) => (
        <div key={d.key} className={styles.item} role="group" aria-label={`${s.name} ${index + 1}`}>
          <Field label={s.name} required validationMessage={errorOf(index, "name")}>
            <Input value={d.name} placeholder={s.namePlaceholder} onChange={(_e, v) => update(d.key, { name: v.value })} />
          </Field>
          <Field label={s.kind}>
            <Select value={d.kind} onChange={(_e, v) => update(d.key, { kind: v.value as AdjustmentKind })}>
              {(Object.keys(s.kinds) as AdjustmentKind[]).map((k) => (
                <option key={k} value={k}>
                  {s.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.methodLabel}>
            <Select value={d.method} onChange={(_e, v) => update(d.key, { method: v.value as AdjustmentMethod })}>
              {(Object.keys(s.methods) as AdjustmentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {s.methods[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={s.value}
            validationMessage={errorOf(index, "value")}
            hint={d.method === "fixed" ? s.valueHintFixed : s.valueHintPercent}
          >
            <Input value={d.value} inputMode="decimal" onChange={(_e, v) => update(d.key, { value: v.value })} />
          </Field>
          <div className={styles.row}>
            <Button size="small" disabled={index === 0} onClick={() => move(index, -1)}>
              {s.moveUp}
            </Button>
            <Button size="small" disabled={index === drafts.length - 1} onClick={() => move(index, 1)}>
              {s.moveDown}
            </Button>
            <Button size="small" onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
              {s.remove}
            </Button>
          </div>
        </div>
      ))}

      <div className={styles.row}>
        <Button
          onClick={() =>
            setDrafts((list) => [...list, { key: nextKey++, name: "", kind: "add", method: "percentOfRunning", value: "" }])
          }
        >
          {s.add}
        </Button>
        <Button
          appearance="primary"
          disabled={!tableName || phase.kind === "working" || (drafts.length === 0 && !state?.exists)}
          onClick={() => void apply()}
        >
          {s.apply}
        </Button>
        {state?.exists && (
          <Button disabled={phase.kind === "working"} onClick={() => setPhase({ kind: "confirmRemove" })}>
            {s.removeTable}
          </Button>
        )}
        {phase.kind === "working" && <Spinner size="tiny" />}
      </div>

      {phase.kind === "message" && (
        <MessageBar intent={phase.intent} layout="multiline" politeness={phase.intent === "error" ? "assertive" : "polite"}>
          <MessageBarBody>{phase.text}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={phase.kind === "confirm"}
        title={s.confirmTitle}
        body={phase.kind === "confirm" ? s.confirmBody(phase.address, phase.adjustments.length) : ""}
        confirmLabel={PRICING_STRINGS.confirm}
        cancelLabel={PRICING_STRINGS.cancel}
        onConfirm={() => phase.kind === "confirm" && void write(phase.adjustments, phase.fingerprint)}
        onCancel={() => setPhase({ kind: "idle" })}
      />
      <ConfirmDialog
        open={phase.kind === "confirmRemove"}
        title={s.removeTitle}
        body={s.removeBody}
        confirmLabel={s.removeTable}
        cancelLabel={PRICING_STRINGS.cancel}
        onConfirm={() => void remove()}
        onCancel={() => setPhase({ kind: "idle" })}
      />
    </section>
  );
};

export default SummaryPanel;
