import * as React from "react";
import { Body1, Button, Caption1, Subtitle2, makeStyles, tokens } from "@fluentui/react-components";
import InfoList from "./InfoList";
import {
  DiagnosticEntry,
  clearDiagnostics,
  diagnosticEntries,
  subscribeDiagnostics,
} from "../../shared/diagnostics";
import { STRINGS } from "../../shared/strings.vi";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
});

/** Nhật ký lỗi kỹ thuật của phiên (prompts/13): chỉ mã lỗi, không có dữ liệu workbook/thư viện. */
const DiagnosticsPanel: React.FC = () => {
  const styles = useStyles();
  const s = STRINGS.diagnostics;
  const [entries, setEntries] = React.useState<readonly DiagnosticEntry[]>(diagnosticEntries());
  React.useEffect(() => subscribeDiagnostics(() => setEntries(diagnosticEntries())), []);
  const recent = [...entries].reverse().slice(0, 10);
  return (
    <section className={styles.root} aria-labelledby="cq-diagnostics-title">
      <Subtitle2 as="h2" id="cq-diagnostics-title">
        {s.title}
      </Subtitle2>
      <Caption1>{s.privacy}</Caption1>
      {recent.length === 0 ? (
        <Body1>{s.empty}</Body1>
      ) : (
        <>
          <InfoList
            items={recent.map((e) => ({
              label: new Date(e.at).toLocaleTimeString("vi-VN"),
              value: `${e.operation}: ${e.code}${e.location ? ` (${e.location})` : ""}`,
            }))}
          />
          <Button size="small" onClick={clearDiagnostics}>
            {s.clear}
          </Button>
        </>
      )}
    </section>
  );
};

export default DiagnosticsPanel;
