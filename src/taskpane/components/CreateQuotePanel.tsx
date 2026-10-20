import * as React from "react";
import {
  Body1,
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "./ConfirmDialog";
import { describeBlocker } from "../../application/blockerMessages";
import { Placement, TemplatePlan, executeTemplate, planTemplate } from "../../application/quoteService";
import { TargetInspection, WorkbookGateway } from "../../application/workbookGateway";
import { DEFAULT_QUOTE_SHEET_NAME, SHEET_NAME_MAX, checkSheetNameInput } from "../../domain/naming";
import { DEFAULT_INITIAL_ROWS, MAX_INITIAL_ROWS, clampInitialRows } from "../../domain/quoteTemplate";
import { describeOfficeError } from "../../office/officeErrors";
import { qualifiedAddress } from "../../shared/a1";
import { STRINGS } from "../../shared/strings.vi";
import { useExclusive } from "../useExclusive";

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "confirm"; plan: TemplatePlan }
  | { kind: "blocked"; plan: TemplatePlan }
  | { kind: "success"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  actions: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
});

function where(inspection: TargetInspection): string {
  return qualifiedAddress(inspection.sheetName, inspection.address);
}

const CreateQuotePanel: React.FC<{ gateway: WorkbookGateway; onCreated: () => void }> = ({ gateway, onCreated }) => {
  const styles = useStyles();
  const s = STRINGS.create;
  const [placement, setPlacement] = React.useState<Placement>("newSheet");
  const [rowsText, setRowsText] = React.useState(String(DEFAULT_INITIAL_ROWS));
  const [sheetName, setSheetName] = React.useState(DEFAULT_QUOTE_SHEET_NAME);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const exclusive = useExclusive();
  const initialRows = clampInitialRows(Number(rowsText));
  const sheetNameCheck = checkSheetNameInput(sheetName);
  const sheetNameInvalid = placement === "newSheet" && !sheetNameCheck.ok;

  const execute = async (plan: TemplatePlan) => {
    setPhase({ kind: "working" });
    try {
      const result = await executeTemplate(gateway, plan, initialRows, {
        overwrite: plan.status === "needsOverwriteConfirmation",
      });
      if (result.status === "changed") {
        setPhase({ kind: "warning", message: s.changed });
        return;
      }
      setPhase({
        kind: "success",
        message: s.created(result.quote.tableName, qualifiedAddress(result.quote.sheetName, result.quote.address)),
      });
      onCreated();
    } catch (error) {
      setPhase({ kind: "error", message: `${describeOfficeError(error)} ${s.partialHint}` });
    }
  };

  const submit = async () => {
    if (placement === "newSheet" && !sheetNameCheck.ok) {
      return;
    }
    setPhase({ kind: "working" });
    try {
      const plan = await planTemplate(
        gateway,
        placement,
        initialRows,
        sheetNameCheck.ok ? sheetNameCheck.name : DEFAULT_QUOTE_SHEET_NAME
      );
      if (plan.status === "blocked") {
        setPhase({ kind: "blocked", plan });
      } else if (plan.status === "ready") {
        await execute(plan);
      } else {
        setPhase({ kind: "confirm", plan });
      }
    } catch (error) {
      setPhase({ kind: "error", message: describeOfficeError(error) });
    }
  };

  const confirmPlan = phase.kind === "confirm" ? phase.plan : undefined;
  const overwrite = confirmPlan?.status === "needsOverwriteConfirmation";

  return (
    <section className={styles.root} aria-labelledby="cq-create-title">
      <Subtitle2 as="h2" id="cq-create-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.description}</Body1>

      {/* <form> để Enter trong ô số dòng gửi biểu mẫu (dùng được bằng bàn phím). */}
      <form noValidate
        className={styles.root}
        onSubmit={(event) => {
          event.preventDefault();
          void exclusive(submit);
        }}
      >
        <Field label={s.placement}>
          <RadioGroup value={placement} onChange={(_e, data) => setPlacement(data.value as Placement)}>
            <Radio value="newSheet" label={s.newSheet} />
            <Radio value="atSelection" label={s.atSelection} />
          </RadioGroup>
        </Field>

        {placement === "newSheet" && (
          <Field
            label={s.sheetName}
            required
            hint={s.sheetNameHint}
            validationMessage={sheetNameCheck.ok ? undefined : sheetNameCheck.message}
          >
            <Input
              value={sheetName}
              maxLength={SHEET_NAME_MAX}
              onChange={(_e, data) => setSheetName(data.value)}
            />
          </Field>
        )}

        <Field label={s.initialRows} hint={`1–${MAX_INITIAL_ROWS}`}>
          <Input
            type="number"
            min={1}
            max={MAX_INITIAL_ROWS}
            value={rowsText}
            onChange={(_e, data) => setRowsText(data.value)}
          />
        </Field>

        <div className={styles.actions}>
          <Button type="submit" appearance="primary" disabled={phase.kind === "working" || sheetNameInvalid}>
            {phase.kind === "working" ? s.working : s.submit}
          </Button>
          {phase.kind === "working" && <Spinner size="tiny" aria-label={s.working} />}
        </div>
      </form>

      {phase.kind === "blocked" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.blockedTitle}</MessageBarTitle>
            {where(phase.plan.inspection)}: {phase.plan.inspection.blockers.map(describeBlocker).join(" ")}
          </MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "success" && (
        <MessageBar intent="success" layout="multiline" politeness="polite">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "warning" && (
        <MessageBar intent="warning" layout="multiline" politeness="polite">
          <MessageBarBody>{phase.message}</MessageBarBody>
        </MessageBar>
      )}
      {phase.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.failed}</MessageBarTitle>
            {phase.message}
          </MessageBarBody>
        </MessageBar>
      )}

      {confirmPlan && (
        <ConfirmDialog
          open
          title={overwrite ? s.confirmOverwriteTitle : s.confirmLocationTitle}
          body={
            <>
              <p>
                {overwrite
                  ? s.confirmOverwriteBody(
                      where(confirmPlan.inspection),
                      confirmPlan.inspection.occupied.count,
                      confirmPlan.inspection.occupied.sample.join(", ")
                    )
                  : s.confirmLocationBody(where(confirmPlan.inspection))}
              </p>
              {confirmPlan.inspection.skippedChecks.includes("mergedCells") && <p>{s.skippedMerged}</p>}
            </>
          }
          confirmLabel={overwrite ? s.confirmOverwrite : s.confirmCreate}
          cancelLabel={s.cancel}
          onConfirm={() => void exclusive(() => execute(confirmPlan))}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}
    </section>
  );
};

export default CreateQuotePanel;
