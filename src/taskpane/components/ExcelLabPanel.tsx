import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import ConfirmDialog from "./ConfirmDialog";
import InfoList from "./InfoList";
import {
  ExcelLabGateway,
  LabActiveInfo,
  LabSampleInspection,
  LabSheet,
} from "../../application/excelLabGateway";
import { describeOfficeError } from "../../office/officeErrors";
import { EXCEL_LAB_STRINGS } from "../../shared/strings.excel.vi";
import { useExclusive } from "../useExclusive";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  body: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  group: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  buttons: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalL },
});

type Result = { intent: "success" | "error" | "warning"; text: string } | null;

/**
 * Khu vực thử lớp thao tác Excel (giai đoạn tích hợp Excel). Chỉ hiện trong bản phát triển và
 * chỉ ghi vào sheet "CQ Thử nghiệm"; tách khỏi giao diện sản phẩm để gỡ được về sau.
 */
const ExcelLabPanel: React.FC<{ lab: ExcelLabGateway }> = ({ lab }) => {
  const styles = useStyles();
  const s = EXCEL_LAB_STRINGS;
  const exclusive = useExclusive();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const [active, setActive] = React.useState<LabActiveInfo | null>(null);
  const [sheets, setSheets] = React.useState<{ sheets: LabSheet[]; activeSheet: string } | null>(
    null
  );
  // Mặc định thu gọn để không làm rối tab Cài đặt.
  const [open, setOpen] = React.useState(false);
  const [pendingOverwrite, setPendingOverwrite] = React.useState<LabSampleInspection | null>(null);

  /** Chạy một bước: chặn bấm lặp, luôn trả nút về trạng thái bình thường kể cả khi lỗi. */
  const run = (task: () => Promise<Result>) =>
    void exclusive(async () => {
      setBusy(true);
      setResult(null);
      try {
        setResult(await task());
      } catch (error) {
        setResult({ intent: "error", text: describeOfficeError(error) });
      } finally {
        setBusy(false);
      }
    });

  const yesNo = (value: boolean | null) => (value === null ? "—" : value ? s.yes : s.no);

  const writeSample = (fingerprint?: string): Promise<Result> =>
    lab
      .writeSample(fingerprint)
      .then((r) => ({ intent: "success", text: s.sampleWritten(r.address) }));

  const startWrite = () =>
    run(async () => {
      const inspection = await lab.inspectSample();
      if (inspection.isTable) {
        return { intent: "warning", text: s.tableBlocksRewrite };
      }
      if (inspection.occupiedCount > 0) {
        setPendingOverwrite(inspection);
        return null;
      }
      return writeSample();
    });

  const confirmOverwrite = () => {
    const inspection = pendingOverwrite;
    setPendingOverwrite(null);
    if (inspection) {
      // Vân tay lúc kiểm tra: vùng đổi trong lúc chờ xác nhận thì không ghi.
      run(() => writeSample(inspection.fingerprint));
    }
  };

  return (
    <section className={styles.root} aria-labelledby="cq-excel-lab-title">
      <div className={styles.heading}>
        <Subtitle2 as="h2" id="cq-excel-lab-title">
          {s.title}
        </Subtitle2>
        <Button
          size="small"
          aria-expanded={open}
          aria-controls="cq-excel-lab-body"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? s.collapse : s.expand}
        </Button>
      </div>
      {open && (
        <div id="cq-excel-lab-body">
          <div className={styles.body}>
            <Caption1>{s.intro}</Caption1>

            <div className={styles.group}>
              <Body1>
                <strong>{s.sections.active}</strong>
              </Body1>
              <div className={styles.buttons}>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setActive(await lab.readActive());
                      return null;
                    })
                  }
                >
                  {s.readActive}
                </Button>
              </div>
              {active && (
                <InfoList
                  items={[
                    { label: s.workbookName, value: active.workbookName ?? s.workbookNameUnknown },
                    { label: s.readOnly, value: yesNo(active.readOnly) },
                    { label: s.workbookProtected, value: yesNo(active.structureProtected) },
                    { label: s.sheetCount, value: String(active.sheetCount) },
                    { label: s.activeSheet, value: active.activeSheet },
                    { label: s.sheetProtectedLabel, value: yesNo(active.sheetProtected) },
                    { label: s.usedRange, value: active.usedAddress ?? s.usedRangeEmpty },
                  ]}
                />
              )}
            </div>

            <div className={styles.group}>
              <Body1>
                <strong>{s.sections.sheets}</strong>
              </Body1>
              <div className={styles.buttons}>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setSheets(await lab.listSheets());
                      return null;
                    })
                  }
                >
                  {s.listSheets}
                </Button>
              </div>
              {sheets && (
                <ul className={styles.list}>
                  {sheets.sheets.map((sheet) => (
                    <li key={sheet.name}>
                      {s.sheetLine(
                        sheet.name,
                        sheet.visibility,
                        sheet.protected,
                        sheet.name === sheets.activeSheet
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.group}>
              <Body1>
                <strong>{s.sections.steps}</strong>
              </Body1>
              <div className={styles.buttons}>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await lab.ensureSheet();
                      return {
                        intent: "success",
                        text: r.created ? s.sheetCreated(r.name) : s.sheetAlreadyThere(r.name),
                      };
                    })
                  }
                >
                  {s.createSheet}
                </Button>
                <Button size="small" disabled={busy} onClick={startWrite}>
                  {s.writeSample}
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await lab.createTable();
                      return {
                        intent: "success",
                        text: r.created
                          ? s.tableCreated(r.name, r.address)
                          : s.tableAlreadyThere(r.name),
                      };
                    })
                  }
                >
                  {s.createTable}
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await lab.formatTable();
                      return { intent: "success", text: s.formatted(r.name) };
                    })
                  }
                >
                  {s.formatTable}
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await lab.readBack();
                      const summary = s.readBackResult(
                        r.rowCount,
                        r.columnCount,
                        r.emptyCells,
                        r.errorCount,
                        r.formulaCells
                      );
                      const ok = r.mismatches.length === 0 && r.errorCount === r.expectedErrors;
                      return {
                        intent: ok ? "success" : "warning",
                        text: `${summary} ${r.mismatches.length === 0 ? s.readBackMatch : s.readBackMismatch(r.mismatches.join(", "))}`,
                      };
                    })
                  }
                >
                  {s.readBack}
                </Button>
              </div>
            </div>

            {busy && <Spinner size="tiny" label={s.working} />}
            {result && (
              <MessageBar
                intent={result.intent}
                layout="multiline"
                politeness={result.intent === "error" ? "assertive" : "polite"}
              >
                <MessageBarBody>
                  <MessageBarTitle>
                    {result.intent === "error"
                      ? s.failed
                      : result.intent === "warning"
                        ? s.notice
                        : s.done}
                  </MessageBarTitle>
                  {result.text}
                </MessageBarBody>
              </MessageBar>
            )}
          </div>

          <ConfirmDialog
            open={pendingOverwrite !== null}
            title={s.confirmOverwriteTitle}
            body={
              pendingOverwrite
                ? s.confirmOverwriteBody(pendingOverwrite.address, pendingOverwrite.occupiedCount)
                : ""
            }
            confirmLabel={s.confirmOverwrite}
            cancelLabel={s.cancel}
            onConfirm={confirmOverwrite}
            onCancel={() => setPendingOverwrite(null)}
          />
        </div>
      )}
    </section>
  );
};

export default ExcelLabPanel;
