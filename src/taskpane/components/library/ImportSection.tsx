import * as React from "react";
import {
  Body1,
  Button,
  Caption1,
  Field,
  Input,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Select,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { hintLabel } from "../hintLabel";
import ImportReview, { AnalysisDetails, ImportReport } from "./ImportReview";
import { LibraryService } from "../../../application/libraryService";
import { WorkbookGateway, SheetSummary, TableSummary } from "../../../application/workbookGateway";
import {
  backupSheetKinds,
  checkBackupMeta,
  datasetFromBackupSheet,
  parseBackupJson,
} from "../../../domain/library/exchange/backup";
import { RawCell, parseTextCell } from "../../../domain/library/exchange/cells";
import { decodeTextFile, parseCsv } from "../../../domain/library/exchange/csv";
import {
  DATASETS,
  DATASET_KINDS,
  DatasetKind,
  EXCHANGE_SCHEMA_VERSION,
  META_SHEET_NAME,
} from "../../../domain/library/exchange/schema";
import {
  ColumnMapping,
  ImportDataset,
  MAX_IMPORT_ROWS,
  SourceTable,
  autoMap,
  datasetFromTable,
  detectHeaderRow,
  guessKind,
  headerTexts,
} from "../../../domain/library/exchange/source";
import { formatDateTime } from "../../../domain/library/dates";
import { LibrarySnapshot } from "../../../domain/library/types";
import { columnToLetters } from "../../../shared/a1";
import { EXCHANGE_STRINGS } from "../../../shared/strings.exchange.vi";
import { useExclusive } from "../../useExclusive";

/* global File, HTMLInputElement */

const MAX_FILE_MB = 20;
/** Đọc thêm vài dòng ngoài giới hạn để còn chỗ cho dòng tiêu đề/ghi chú phía trên. */
const SHEET_READ_MARGIN = 50;
const PREVIEW_ROWS = 5;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  row: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: tokens.spacingHorizontalS },
  hiddenInput: { display: "none" },
  mapping: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", rowGap: tokens.spacingVerticalXS },
  tableWrap: { overflowX: "auto" },
  table: {
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    "& th, & td": {
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
      textAlign: "left",
      whiteSpace: "nowrap",
      maxWidth: "160px",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
  },
});

type Step =
  | { kind: "source" }
  | { kind: "table"; table: SourceTable; headerIndex: number; dataKind: DatasetKind | null; mapping: ColumnMapping }
  | { kind: "multi"; label: string; datasets: ImportDataset[] }
  | { kind: "done"; report: ImportReport };

function tableStep(table: SourceTable): Step {
  const headerIndex = detectHeaderRow(table);
  const headers = headerIndex >= 0 ? headerTexts(table, headerIndex) : [];
  const dataKind = guessKind(headers);
  return { kind: "table", table, headerIndex, dataKind, mapping: dataKind ? autoMap(dataKind, headers) : {} };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const ImportSection: React.FC<{
  service: LibraryService;
  gateway: WorkbookGateway;
  library: LibrarySnapshot;
  onImported: () => Promise<void>;
}> = ({ service, gateway, library, onImported }) => {
  const styles = useStyles();
  const s = EXCHANGE_STRINGS.import;
  const [step, setStep] = React.useState<Step>({ kind: "source" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sheets, setSheets] = React.useState<SheetSummary[] | null>(null);
  const [sheetName, setSheetName] = React.useState("");
  const [tables, setTables] = React.useState<TableSummary[]>([]);
  const [tableName, setTableName] = React.useState("");
  const [backupInfo, setBackupInfo] = React.useState<{
    exportedAt: string;
    libraryName: string;
    schemaVersion: number;
  } | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const exclusive = useExclusive();

  const loadSheets = React.useCallback(async () => {
    try {
      const { sheets: list, activeSheet } = await gateway.listSheets();
      setSheets(list);
      setSheetName((current) => (list.some((x) => x.name === current) ? current : activeSheet));
      const tableList = await gateway.listTables();
      setTables(tableList);
      setTableName((current) =>
        tableList.some((t) => t.name === current) ? current : (tableList[0]?.name ?? "")
      );
      setBackupInfo(null);
      if (list.some((x) => x.name === META_SHEET_NAME)) {
        const meta = await gateway.readSheet(META_SHEET_NAME, 20);
        const check = checkBackupMeta(meta.table.rows);
        if (check.kind === "backup") {
          setBackupInfo({
            exportedAt: check.exportedAt,
            libraryName: check.libraryName,
            schemaVersion: check.schemaVersion,
          });
        }
      }
    } catch (e) {
      setError(`${s.readFailed}: ${errorText(e)}`);
    }
  }, [gateway, s.readFailed]);

  React.useEffect(() => {
    if (step.kind === "source" && sheets === null) {
      void loadSheets();
    }
  }, [step.kind, sheets, loadSheets]);

  const read = (task: () => Promise<void>) =>
    exclusive(async () => {
      setBusy(true);
      setError(null);
      try {
        await task();
      } catch (e) {
        setError(`${s.readFailed}: ${errorText(e)}`);
      } finally {
        setBusy(false);
      }
    });

  const onFileChosen = (file: File | undefined) =>
    read(async () => {
      if (!file) {
        return;
      }
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".xlsm")) {
        setError(s.xlsxNotSupported);
        return;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(s.tooBig(MAX_FILE_MB));
        return;
      }
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        // File bị xóa/di chuyển sau khi chọn, hoặc đang bị ứng dụng khác khóa.
        setError(s.fileUnreadable);
        return;
      }
      const decoded = decodeTextFile(bytes);
      if (!decoded.ok) {
        setError(decoded.message);
        return;
      }
      if (decoded.text.trim() === "") {
        setError(s.emptySource);
        return;
      }
      if (name.endsWith(".json") || decoded.text.trimStart().startsWith("{")) {
        const backup = parseBackupJson(decoded.text);
        if (!backup.ok) {
          setError(backup.message);
          return;
        }
        if (backup.datasets.length === 0) {
          setError(s.emptySource);
          return;
        }
        setStep({
          kind: "multi",
          label: s.backupFileLabel(file.name, backup.meta.libraryName),
          datasets: backup.datasets,
        });
        return;
      }
      const rows = parseCsv(decoded.text).map((row) => row.map((value): RawCell => ({ value })));
      const table: SourceTable = { label: `File "${file.name}"`, firstRowNumber: 1, firstColumnIndex: 0, rows };
      if (detectHeaderRow(table) < 0) {
        setError(s.emptySource);
        return;
      }
      setStep(tableStep(table));
    });

  /** Excel Table làm nguồn (chỉ đọc), dùng lớp core của giai đoạn tích hợp Excel. */
  const readTable = () =>
    read(async () => {
      const { table, totalRows } = await gateway.readTableSource(tableName, MAX_IMPORT_ROWS + SHEET_READ_MARGIN);
      if (totalRows > MAX_IMPORT_ROWS + SHEET_READ_MARGIN) {
        setError(s.sheetTooLarge(totalRows, MAX_IMPORT_ROWS));
        return;
      }
      if (detectHeaderRow(table) < 0) {
        setError(s.emptySource);
        return;
      }
      setStep(tableStep(table));
    });

  const readSheet = () =>
    read(async () => {
      const { table, totalRows } = await gateway.readSheet(sheetName, MAX_IMPORT_ROWS + SHEET_READ_MARGIN);
      if (totalRows > MAX_IMPORT_ROWS + SHEET_READ_MARGIN) {
        setError(s.sheetTooLarge(totalRows, MAX_IMPORT_ROWS));
        return;
      }
      if (detectHeaderRow(table) < 0) {
        setError(s.emptySource);
        return;
      }
      setStep(tableStep(table));
    });

  const readBackupWorkbook = () =>
    read(async () => {
      const datasets: ImportDataset[] = [];
      // Bản xuất schema 1–2: sheet "Định mức" là dòng định mức kiểu cũ (ADR-0013).
      for (const { kind, sheetName: name } of backupSheetKinds(
        backupInfo?.schemaVersion ?? EXCHANGE_SCHEMA_VERSION
      )) {
        if (!sheets?.some((x) => x.name === name)) {
          continue;
        }
        const { table, totalRows } = await gateway.readSheet(name, MAX_IMPORT_ROWS + 1);
        const dataset = datasetFromBackupSheet(kind, table);
        if (totalRows > MAX_IMPORT_ROWS + 1) {
          dataset.problems.push(s.sheetTooLarge(totalRows, MAX_IMPORT_ROWS));
        }
        datasets.push(dataset);
      }
      if (datasets.every((d) => d.rows.length === 0)) {
        setError(s.emptySource);
        return;
      }
      setStep({ kind: "multi", label: "Workbook", datasets: datasets.filter((d) => d.rows.length > 0) });
    });

  const reset = () => {
    setStep({ kind: "source" });
    setError(null);
    setSheets(null);
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  };

  const errorBar = error && (
    <MessageBar intent="error" layout="multiline" politeness="assertive">
      <MessageBarBody>{error}</MessageBarBody>
    </MessageBar>
  );

  if (step.kind === "done") {
    return (
      <section className={styles.root} aria-labelledby="cq-import-title">
        <Subtitle2 as="h2" id="cq-import-title" tabIndex={-1}>
          {s.title}
        </Subtitle2>
        <MessageBar intent="success" layout="multiline" politeness="polite">
          <MessageBarBody>{s.done(step.report.added, step.report.updated)}</MessageBarBody>
        </MessageBar>
        <AnalysisDetails analysis={step.report.analysis} done />
        <div className={styles.row}>
          <Button onClick={reset}>{s.another}</Button>
        </div>
      </section>
    );
  }

  const finish = async (report: ImportReport) => {
    await onImported();
    setStep({ kind: "done", report });
  };

  let body: React.ReactNode;
  if (step.kind === "source") {
    body = (
      <>
        <Body1>{s.description}</Body1>
        <div className={styles.row}>
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            {s.chooseFile}
          </Button>
          <input
            ref={fileInput}
            className={styles.hiddenInput}
            type="file"
            accept=".json,.csv,.txt,application/json,text/csv"
            aria-label={s.chooseFile}
            onChange={(e) => void onFileChosen(e.target.files?.[0])}
          />
        </div>
        <Caption1>{s.fileHint}</Caption1>

        <Subtitle2 as="h3">{s.fromWorkbook}</Subtitle2>
        {backupInfo && (
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>{s.backupDetected(
                backupInfo.exportedAt && formatDateTime(backupInfo.exportedAt),
                backupInfo.libraryName
              )}</MessageBarBody>
            <MessageBarActions>
              <Button size="small" appearance="primary" disabled={busy} onClick={() => void readBackupWorkbook()}>
                {s.readBackup}
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}
        {sheets === null ? (
          <Spinner size="tiny" label={s.reading} />
        ) : (
          <div className={styles.row}>
            <Field label={s.sheet}>
              <Select value={sheetName} onChange={(_e, data) => setSheetName(data.value)}>
                {sheets.map((x) => (
                  <option key={x.name} value={x.name}>
                    {s.sheetSize(x.name, x.rowCount, x.columnCount)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={busy || !sheetName} onClick={() => void readSheet()}>
              {s.readSheet}
            </Button>
            <Button appearance="subtle" disabled={busy} onClick={() => void loadSheets()}>
              {s.refreshSheets}
            </Button>
          </div>
        )}
        {sheets !== null && tables.length > 0 && (
          <div className={styles.row}>
            <Field label={hintLabel(s.table, s.tableHint)}>
              <Select value={tableName} onChange={(_e, data) => setTableName(data.value)}>
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {s.tableOption(t.name, t.sheetName, t.rowCount)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={busy || !tableName} onClick={() => void readTable()}>
              {s.readTable}
            </Button>
          </div>
        )}
        {busy && <Spinner size="tiny" label={s.reading} />}
      </>
    );
  } else if (step.kind === "multi") {
    body = (
      <>
        <Body1>{s.sourceRead(step.label, step.datasets.reduce((n, d) => n + d.rows.length, 0))}</Body1>
        <ImportReview service={service} library={library} datasets={step.datasets} onCancel={reset} onImported={finish} />
      </>
    );
  } else {
    body = <TableStep step={step} setStep={setStep} service={service} library={library} onCancel={reset} onImported={finish} />;
  }

  return (
    <section className={styles.root} aria-labelledby="cq-import-title">
      <Subtitle2 as="h2" id="cq-import-title" tabIndex={-1}>
        {s.title}
      </Subtitle2>
      {errorBar}
      {body}
    </section>
  );
};

type TableStepState = Extract<Step, { kind: "table" }>;

/** Nhận diện dòng tiêu đề → chọn loại dữ liệu → map cột → xem trước → kiểm tra. */
const TableStep: React.FC<{
  step: TableStepState;
  setStep: (step: Step) => void;
  service: LibraryService;
  library: LibrarySnapshot;
  onCancel: () => void;
  onImported: (report: ImportReport) => Promise<void>;
}> = ({ step, setStep, service, library, onCancel, onImported }) => {
  const styles = useStyles();
  const s = EXCHANGE_STRINGS.import;
  const { table, headerIndex, dataKind, mapping } = step;
  const headers = headerIndex >= 0 ? headerTexts(table, headerIndex) : [];
  const columnCount = Math.max(0, ...table.rows.map((r) => r.length));
  const [headerInput, setHeaderInput] = React.useState(String(table.firstRowNumber + headerIndex));

  const dataset = React.useMemo(
    () => (dataKind ? datasetFromTable(table, headerIndex, dataKind, mapping) : null),
    [table, headerIndex, dataKind, mapping]
  );
  const datasets = React.useMemo(() => (dataset ? [dataset] : []), [dataset]);

  const changeHeader = (text: string) => {
    setHeaderInput(text);
    const index = Number(text) - table.firstRowNumber;
    if (Number.isInteger(index) && index >= 0 && index < table.rows.length) {
      const nextHeaders = headerTexts(table, index);
      const kind = dataKind ?? guessKind(nextHeaders);
      setStep({ ...step, headerIndex: index, dataKind: kind, mapping: kind ? autoMap(kind, nextHeaders) : {} });
    }
  };

  const columnName = (c: number) => `${columnToLetters(table.firstColumnIndex + c)}${headers[c] ? ` · ${headers[c]}` : ""}`;

  return (
    <>
      <Body1>{s.sourceRead(table.label, Math.max(0, table.rows.length - headerIndex - 1))}</Body1>
      <div className={styles.row}>
        <Field label={hintLabel(s.headerRow, s.headerRowHint)}>
          <Input type="number" inputMode="numeric" value={headerInput} onChange={(_e, d) => changeHeader(d.value)} />
        </Field>
        <Field label={s.kind}>
          <Select
            value={dataKind ?? ""}
            onChange={(_e, d) => {
              const kind = (d.value || null) as DatasetKind | null;
              setStep({ ...step, dataKind: kind, mapping: kind ? autoMap(kind, headers) : {} });
            }}
          >
            <option value="">{s.chooseKind}</option>
            {DATASET_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXCHANGE_STRINGS.kinds[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!dataKind && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>{s.kindUnknown}</MessageBarBody>
        </MessageBar>
      )}

      {dataKind && (
        <section aria-labelledby="cq-import-mapping-title" className={styles.mapping}>
          <Subtitle2 as="h3" id="cq-import-mapping-title">
            {s.mappingTitle}
          </Subtitle2>
          {DATASETS[dataKind].fields.map((field) => (
            <Field key={field.key} label={field.header} required={field.required} orientation="horizontal">
              <Select
                value={mapping[field.key] === null || mapping[field.key] === undefined ? "" : String(mapping[field.key])}
                onChange={(_e, d) =>
                  setStep({ ...step, mapping: { ...mapping, [field.key]: d.value === "" ? null : Number(d.value) } })
                }
              >
                <option value="">{s.notMapped}</option>
                {Array.from({ length: columnCount }, (_v, c) => (
                  <option key={c} value={String(c)}>
                    {columnName(c)}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </section>
      )}

      {dataset && dataset.mappedFields.length > 0 && (
        <section aria-labelledby="cq-import-preview-title">
          <Subtitle2 as="h3" id="cq-import-preview-title">
            {s.preview}
          </Subtitle2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  {dataset.mappedFields.map((key) => (
                    <th key={key}>{DATASETS[dataset.kind].fields.find((x) => x.key === key)?.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.slice(0, PREVIEW_ROWS).map((row) => (
                  <tr key={row.rowLabel}>
                    <td>{row.rowLabel}</td>
                    {dataset.mappedFields.map((key) => {
                      const cell = row.cells[key];
                      return <td key={key}>{cell?.date ?? parseTextCell(cell)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dataset ? (
        <ImportReview service={service} library={library} datasets={datasets} onCancel={onCancel} onImported={onImported} />
      ) : (
        <div className={styles.row}>
          <Button onClick={onCancel}>{s.cancel}</Button>
        </div>
      )}
    </>
  );
};

export default ImportSection;
