import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Checkbox,
  Field,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "../ConfirmDialog";
import InfoList from "../InfoList";
import { LayoutGateway, PrintSetupState } from "../../../application/layoutGateway";
import {
  DEFAULT_PRINT_OPTIONS,
  Fit,
  Orientation,
  Paper,
  PrintOptions,
} from "../../../domain/printLayout";
import { describeOfficeError } from "../../../office/officeErrors";
import { PRINT_STRINGS } from "../../../shared/strings.print.vi";
import { useExclusive } from "../../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  row: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
  guide: { margin: 0, paddingLeft: tokens.spacingHorizontalL },
});

/**
 * Thiết lập trang in (prompts/11). Chỉ đặt những gì PageLayout (ExcelApi 1.9) hỗ trợ và đã kiểm thử;
 * Excel không hỗ trợ thì hướng dẫn thao tác trong Excel thay vì giả vờ hỗ trợ.
 */
const PrintSetupPanel: React.FC<{ layout: LayoutGateway; tableName: string; version: number }> = ({
  layout,
  tableName,
  version,
}) => {
  const styles = useStyles();
  const s = PRINT_STRINGS.print;
  const [state, setState] = React.useState<PrintSetupState | null>(null);
  const [options, setOptions] = React.useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [confirming, setConfirming] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [message, setMessage] = React.useState<{ intent: "success" | "error"; text: string } | null>(null);
  const exclusive = useExclusive();

  const load = React.useCallback(async () => {
    setState(await layout.readPrintSetup(tableName));
  }, [layout, tableName]);

  React.useEffect(() => {
    load().catch((e) => setMessage({ intent: "error", text: describeOfficeError(e) }));
  }, [load, version]);

  const set = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const apply = () =>
    exclusive(async () => {
      setConfirming(false);
      setWorking(true);
      setMessage(null);
      try {
        const result = await layout.applyPrintSetup(tableName, options);
        await load();
        setMessage({ intent: "success", text: s.applied(result.printArea) });
      } catch (e) {
        setMessage({ intent: "error", text: describeOfficeError(e) });
      } finally {
        setWorking(false);
      }
    });

  const c = state?.current;
  const none = s.none;

  return (
    <section className={styles.root} aria-labelledby="cq-print-title">
      <Subtitle2 as="h2" id="cq-print-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      <Body1>{s.intro}</Body1>
      {!state && !message && <Spinner size="tiny" />}
      {state && !state.supported && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{s.unsupported}</MessageBarBody>
        </MessageBar>
      )}
      {state && (
        <Body1>
          <strong>{s.area(state.quoteArea, state.sheetName)}</strong>
        </Body1>
      )}
      {state?.supported && c && (
        <>
          <Caption1>{s.current}</Caption1>
          <InfoList
            items={[
              { label: s.currentArea, value: c.printArea ?? none },
              { label: s.currentTitles, value: c.titleRows ?? none },
              {
                label: s.currentOrientation,
                value: c.orientation ? (s.orientationValues[c.orientation] ?? c.orientation) : none,
              },
              { label: s.currentPaper, value: c.paper ?? none },
              { label: s.currentFit, value: s.fitText(c.fitWide, c.fitTall, c.scale) },
              { label: s.currentFooter, value: c.footer ?? none },
            ]}
          />
          <Field label={s.orientation}>
            <RadioGroup layout="horizontal" value={options.orientation} onChange={(_e, d) => set("orientation", d.value as Orientation)}>
              {(Object.keys(s.orientations) as Orientation[]).map((o) => (
                <Radio key={o} value={o} label={s.orientations[o]} />
              ))}
            </RadioGroup>
          </Field>
          <Field label={s.paper}>
            <Select value={options.paper} onChange={(_e, d) => set("paper", d.value as Paper)}>
              {(Object.keys(s.papers) as Paper[]).map((p) => (
                <option key={p} value={p}>
                  {s.papers[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.fit}>
            <Select value={options.fit} onChange={(_e, d) => set("fit", d.value as Fit)}>
              {(Object.keys(s.fits) as Fit[]).map((f) => (
                <option key={f} value={f}>
                  {s.fits[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox checked={options.repeatHeader} label={s.repeatHeader} onChange={(_e, d) => set("repeatHeader", !!d.checked)} />
          <Checkbox checked={options.pageNumbers} label={s.pageNumbers} onChange={(_e, d) => set("pageNumbers", !!d.checked)} />
          <Checkbox checked={options.centerHorizontally} label={s.center} onChange={(_e, d) => set("centerHorizontally", !!d.checked)} />
          <Checkbox checked={options.wrapLongText} label={s.wrap} onChange={(_e, d) => set("wrapLongText", !!d.checked)} />
          <div className={styles.row}>
            <Button appearance="primary" disabled={working} onClick={() => setConfirming(true)}>
              {s.apply}
            </Button>
            {working && <Spinner size="tiny" />}
          </div>
        </>
      )}
      {message && (
        <MessageBar intent={message.intent} layout="multiline" politeness={message.intent === "error" ? "assertive" : "polite"}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}
      <Subtitle2 as="h3">{s.guideTitle}</Subtitle2>
      <ul className={styles.guide}>
        {s.guide.map((line) => (
          <li key={line}>
            <Caption1>{line}</Caption1>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming}
        title={s.confirmTitle}
        body={state ? s.confirmBody(state.quoteArea, state.current?.printArea ?? null) : ""}
        confirmLabel={PRINT_STRINGS.confirm}
        cancelLabel={PRINT_STRINGS.cancel}
        onConfirm={() => void apply()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
};

export default PrintSetupPanel;
