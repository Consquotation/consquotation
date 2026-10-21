import * as React from "react";
import {
  Body1,
  Button,
  Field,
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
import ConfirmDialog from "../ConfirmDialog";
import { LibraryService } from "../../../application/libraryService";
import { DuplicateMode, ImportAnalysis, changeCount } from "../../../domain/library/exchange/analyze";
import { ImportDataset, LARGE_IMPORT_ROWS } from "../../../domain/library/exchange/source";
import { LibrarySnapshot } from "../../../domain/library/types";
import { EXCHANGE_STRINGS } from "../../../shared/strings.exchange.vi";
import { useExclusive } from "../../useExclusive";

const MAX_ISSUES_SHOWN = 100;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  tableWrap: { overflowX: "auto" },
  table: {
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    "& th, & td": {
      border: `1px solid ${tokens.colorNeutralStroke2}`,
      padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
      textAlign: "left",
      whiteSpace: "nowrap",
    },
  },
  issues: { margin: 0, paddingLeft: tokens.spacingHorizontalL },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

export interface ImportReport {
  analysis: ImportAnalysis;
  added: number;
  updated: number;
}

function totals(analysis: ImportAnalysis) {
  return analysis.summaries.reduce(
    (t, s) => ({
      total: t.total + s.total,
      added: t.added + s.added,
      updated: t.updated + s.updated,
      duplicates: t.duplicates + s.duplicates,
      errors: t.errors + s.errors,
    }),
    { total: 0, added: 0, updated: 0, duplicates: 0, errors: 0 }
  );
}

/** Bảng tổng hợp + danh sách lỗi theo dòng/cột (dùng cả trước khi nhập và trong báo cáo). */
export const AnalysisDetails: React.FC<{ analysis: ImportAnalysis; done?: boolean }> = ({
  analysis,
  done = false,
}) => {
  const styles = useStyles();
  const s = EXCHANGE_STRINGS.import;
  const c = s.columns;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={s.summaryTitle}>
          <thead>
            <tr>
              <th>{c.source}</th>
              <th>{c.kind}</th>
              <th>{c.total}</th>
              <th>{c.added}</th>
              <th>{c.duplicates}</th>
              <th>{c.errors}</th>
              <th>{c.empty}</th>
            </tr>
          </thead>
          <tbody>
            {analysis.summaries.map((sum) => (
              <tr key={`${sum.sourceLabel}-${sum.kind}`}>
                <td>{sum.sourceLabel}</td>
                <td>{EXCHANGE_STRINGS.kinds[sum.kind]}</td>
                <td>{sum.total}</td>
                <td>{sum.added}</td>
                <td>{sum.duplicates}</td>
                <td>{sum.errors}</td>
                <td>{sum.empty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {analysis.issues.length > 0 && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>
              {done ? s.issuesSkipped(totals(analysis).errors) : s.issuesTitle(totals(analysis).errors)}
            </MessageBarTitle>
            <ul className={styles.issues}>
              {analysis.issues.slice(0, MAX_ISSUES_SHOWN).map((issue, i) => (
                <li key={i}>
                  {[issue.sourceLabel, issue.rowLabel, issue.columnLabel].filter(Boolean).join(", ")}: {issue.message}
                </li>
              ))}
            </ul>
            {analysis.issues.length > MAX_ISSUES_SHOWN && s.moreIssues(analysis.issues.length - MAX_ISSUES_SHOWN)}
          </MessageBarBody>
        </MessageBar>
      )}
    </>
  );
};

/**
 * Bước kiểm tra → chọn cách xử lý trùng → xác nhận (prompts/09).
 * Trước khi ghi, kiểm tra lại với thư viện mới đọc: nếu khác kết quả đã hiển thị thì dừng.
 */
const ImportReview: React.FC<{
  service: LibraryService;
  library: LibrarySnapshot;
  datasets: ImportDataset[];
  onCancel: () => void;
  onImported: (report: ImportReport) => Promise<void>;
}> = ({ service, library, datasets, onCancel, onImported }) => {
  const styles = useStyles();
  const s = EXCHANGE_STRINGS.import;
  const [mode, setMode] = React.useState<DuplicateMode>("skip");
  const [base, setBase] = React.useState(library);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const exclusive = useExclusive();

  React.useEffect(() => setBase(library), [library]);
  const analysis = React.useMemo(() => service.analyzeImport(datasets, base, mode), [service, datasets, base, mode]);
  const t = totals(analysis);
  const changes = changeCount(analysis.changes);
  const blocked = analysis.problems.length > 0;
  const skippedDuplicates = t.duplicates - t.updated;

  const runImport = () =>
    exclusive(async () => {
      setConfirming(false);
      setError(null);
      setImporting(true);
      try {
        const fresh = await service.load();
        const recheck = service.analyzeImport(datasets, fresh, mode);
        if (JSON.stringify(recheck.summaries) !== JSON.stringify(analysis.summaries)) {
          setBase(fresh);
          setError(s.changedMeanwhile);
          return;
        }
        await service.applyImport(recheck.changes);
        const after = totals(recheck);
        await onImported({ analysis: recheck, added: after.added, updated: after.updated });
      } catch (e) {
        setError(`${s.failed} ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setImporting(false);
      }
    });

  return (
    <section className={styles.root} aria-labelledby="cq-import-review-title">
      <Subtitle2 as="h3" id="cq-import-review-title">
        {s.summaryTitle}
      </Subtitle2>
      {blocked && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.problemsTitle}</MessageBarTitle>
            <ul className={styles.issues}>
              {analysis.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </MessageBarBody>
        </MessageBar>
      )}
      {!blocked && <AnalysisDetails analysis={analysis} />}
      {!blocked && t.total > LARGE_IMPORT_ROWS && (
        <MessageBar intent="info">
          <MessageBarBody>{s.largeWarning(t.total)}</MessageBarBody>
        </MessageBar>
      )}

      {!blocked && (
        <Field label={s.duplicateMode} hint={s.updateHint}>
          <RadioGroup value={mode} disabled={importing} onChange={(_e, data) => setMode(data.value as DuplicateMode)}>
            <Radio value="skip" label={s.skip} />
            <Radio value="update" label={s.update} />
          </RadioGroup>
        </Field>
      )}

      {error && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!blocked && changes === 0 && <Body1>{s.nothingToImport}</Body1>}

      <div className={styles.actions}>
        <Button appearance="primary" disabled={blocked || changes === 0 || importing} onClick={() => setConfirming(true)}>
          {s.submit(changes)}
        </Button>
        <Button disabled={importing} onClick={onCancel}>
          {s.cancel}
        </Button>
      </div>
      {importing && <Spinner size="tiny" label={s.importing} />}

      <ConfirmDialog
        open={confirming}
        title={s.confirmTitle}
        body={s.confirmBody(t.added, t.updated, skippedDuplicates, t.errors)}
        confirmLabel={s.confirm}
        cancelLabel={s.cancel}
        onConfirm={() => void runImport()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
};

export default ImportReview;
