import * as React from "react";
import { Badge, Body1, Caption1, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import { todayIso } from "../../../domain/library/dates";
import { LibrarySnapshot } from "../../../domain/library/types";
import { libraryIssues } from "../../../domain/library/validation";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  list: { listStyleType: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
  item: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  head: { display: "flex", columnGap: tokens.spacingHorizontalS, alignItems: "center" },
});

/** Báo cáo kiểm tra toàn thư viện: chỉ liệt kê, không tự sửa (prompts/08, 13). */
const LibraryCheckPanel: React.FC<{ library: LibrarySnapshot }> = ({ library }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS.check;
  const issues = React.useMemo(() => {
    const all = libraryIssues(library, todayIso());
    return [...all.filter((i) => i.severity === "error"), ...all.filter((i) => i.severity === "warning")];
  }, [library]);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <section className={styles.root} aria-label={s.title}>
      <Body1>{s.description}</Body1>
      {issues.length === 0 ? (
        <MessageBar intent="success">
          <MessageBarBody>{s.ok}</MessageBarBody>
        </MessageBar>
      ) : (
        <>
          <Caption1 aria-live="polite">
            {s.errors(errorCount)} · {s.warnings(issues.length - errorCount)}
          </Caption1>
          <ul className={styles.list}>
            {issues.map((issue, index) => (
              <li key={`${issue.kind}-${issue.entityId}-${index}`} className={styles.item}>
                <div className={styles.head}>
                  <Badge appearance="tint" color={issue.severity === "error" ? "danger" : "warning"}>
                    {issue.severity === "error" ? s.error : s.warning}
                  </Badge>
                  <Text weight="semibold">{issue.label}</Text>
                </div>
                <Caption1>{issue.detail}</Caption1>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default LibraryCheckPanel;
