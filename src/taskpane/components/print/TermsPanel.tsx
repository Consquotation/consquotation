import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Field,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle2,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import { LayoutGateway, TermsState } from "../../../application/layoutGateway";
import { TargetChangedError } from "../../../application/workbookGateway";
import {
  TERMS_SECTIONS,
  TermsKey,
  TermsSection,
  termsRows,
  termsToWrite,
  validateTerms,
} from "../../../domain/terms";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRINT_STRINGS } from "../../../shared/strings.print.vi";
import { STRINGS } from "../../../shared/strings.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
});

type Texts = Record<TermsKey, string>;
type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "confirm"; sections: TermsSection[]; address: string; fingerprint: string }
  | { kind: "confirmRemove" }
  | { kind: "message"; intent: "success" | "warning" | "error" | "info"; text: string };

const textsOf = (state: TermsState): Texts =>
  Object.fromEntries(
    TERMS_SECTIONS.map((s) => [s.key, state.sections.find((x) => x.key === s.key)?.text ?? ""])
  ) as Texts;

/** Khu vực ghi chú/điều khoản theo cấu hình (prompts/11); nội dung do người dùng tự nhập. */
const TermsPanel: React.FC<{ layout: LayoutGateway; tableName: string; onChanged: () => void }> = ({
  layout,
  tableName,
  onChanged,
}) => {
  const styles = useStyles();
  const s = PRINT_STRINGS.terms;
  const [state, setState] = React.useState<TermsState | null>(null);
  const [texts, setTexts] = React.useState<Texts | null>(null);
  const [errors, setErrors] = React.useState<{ key: TermsKey; message: string }[]>([]);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const exclusive = useExclusive();

  const load = React.useCallback(async () => {
    const current = await layout.readTerms(tableName);
    setState(current);
    setTexts(textsOf(current));
    setErrors([]);
  }, [layout, tableName]);

  React.useEffect(() => {
    setPhase({ kind: "idle" });
    load().catch((e) => setPhase({ kind: "message", intent: "error", text: describeOfficeError(e) }));
  }, [load]);

  const sections = (): TermsSection[] =>
    TERMS_SECTIONS.map((d) => ({ key: d.key, text: texts?.[d.key] ?? "" }));

  const apply = () =>
    exclusive(async () => {
      const list = sections();
      const invalid = validateTerms(list);
      setErrors(invalid);
      if (invalid.length > 0) {
        return;
      }
      if (termsToWrite(list).length === 0) {
        setPhase(state?.exists ? { kind: "confirmRemove" } : { kind: "message", intent: "info", text: s.nothing });
        return;
      }
      setPhase({ kind: "working" });
      try {
        // Người dùng có thể đã sửa khu vực này trực tiếp trên sheet sau khi panel tải (prompts/07).
        const now = await layout.readTerms(tableName);
        if (JSON.stringify(now) !== JSON.stringify(state)) {
          await load();
          setPhase({ kind: "message", intent: "warning", text: s.changedOnSheet });
          return;
        }
        const check = await layout.inspectTerms(tableName, termsRows(list).length);
        if (!check.ok) {
          const text =
            check.reason === "occupied" ? s.blocked.occupied((check.sample ?? []).join(", ")) : s.blocked[check.reason];
          setPhase({ kind: "message", intent: "error", text });
          return;
        }
        setPhase({ kind: "confirm", sections: list, address: check.address, fingerprint: check.fingerprint });
      } catch (e) {
        setPhase({ kind: "message", intent: "error", text: describeOfficeError(e) });
      }
    });

  const write = (list: TermsSection[], fingerprint: string) =>
    exclusive(async () => {
      setPhase({ kind: "working" });
      try {
        await layout.writeTerms(tableName, list, fingerprint);
        await load();
        onChanged();
        setPhase({ kind: "message", intent: "success", text: s.written });
      } catch (e) {
        setPhase({
          kind: "message",
          intent: e instanceof TargetChangedError ? "warning" : "error",
          text: e instanceof TargetChangedError ? STRINGS.create.changed : describeOfficeError(e),
        });
      }
    });

  const remove = () =>
    exclusive(async () => {
      setPhase({ kind: "working" });
      try {
        await layout.removeTerms(tableName);
        await load();
        onChanged();
        setPhase({ kind: "message", intent: "success", text: s.removed });
      } catch (e) {
        setPhase({ kind: "message", intent: "error", text: describeOfficeError(e) });
      }
    });

  return (
    <section className={styles.root} aria-labelledby="cq-terms-title">
      <Subtitle2 as="h2" id="cq-terms-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      {!state || !texts ? (
        <Spinner size="tiny" />
      ) : (
        <>
          <Caption1>{state.exists ? s.existing(state.address) : s.none}</Caption1>
          {TERMS_SECTIONS.map((section) => (
            <Field
              key={section.key}
              label={section.label.replace(/:$/, "")}
              validationMessage={errors.find((e) => e.key === section.key)?.message}
            >
              <Textarea
                value={texts[section.key]}
                resize="vertical"
                onChange={(_e, d) => setTexts((t) => (t ? { ...t, [section.key]: d.value } : t))}
              />
            </Field>
          ))}
          <div className={styles.row}>
            <Button appearance="primary" disabled={phase.kind === "working"} onClick={() => void apply()}>
              {s.apply}
            </Button>
            {state.exists && (
              <Button disabled={phase.kind === "working"} onClick={() => setPhase({ kind: "confirmRemove" })}>
                {s.remove}
              </Button>
            )}
            {phase.kind === "working" && <Spinner size="tiny" />}
          </div>
        </>
      )}
      {phase.kind === "message" && (
        <MessageBar intent={phase.intent} layout="multiline" politeness={phase.intent === "error" ? "assertive" : "polite"}>
          <MessageBarBody>{phase.text}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={phase.kind === "confirm"}
        title={s.confirmTitle}
        body={phase.kind === "confirm" ? s.confirmBody(phase.address, termsToWrite(phase.sections).length) : ""}
        confirmLabel={PRINT_STRINGS.confirm}
        cancelLabel={PRINT_STRINGS.cancel}
        onConfirm={() => phase.kind === "confirm" && void write(phase.sections, phase.fingerprint)}
        onCancel={() => setPhase({ kind: "idle" })}
      />
      <ConfirmDialog
        open={phase.kind === "confirmRemove"}
        title={s.removeTitle}
        body={s.removeBody}
        confirmLabel={s.remove}
        cancelLabel={PRINT_STRINGS.cancel}
        onConfirm={() => void remove()}
        onCancel={() => setPhase({ kind: "idle" })}
      />
    </section>
  );
};

export default TermsPanel;
