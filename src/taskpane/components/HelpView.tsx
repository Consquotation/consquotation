import * as React from "react";
import { Button, Subtitle2, makeStyles, tokens } from "@fluentui/react-components";
import { STRINGS } from "../../shared/strings.vi";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS, flexGrow: 1 },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  frame: {
    width: "100%",
    minHeight: "70vh",
    flexGrow: 1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
});

/**
 * Trợ giúp hiển thị ngay trong task pane bằng chính help.html (cũng là SupportUrl của manifest),
 * để chỉ có một nguồn nội dung. Đường dẫn tương đối nên chạy được cả ở dev và GitHub Pages.
 */
const HelpView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const styles = useStyles();
  const s = STRINGS.help;
  return (
    <section className={styles.root} aria-labelledby="cq-help-title">
      <div className={styles.heading}>
        <Subtitle2 as="h2" id="cq-help-title" tabIndex={-1}>
          {s.title}
        </Subtitle2>
        <Button onClick={onBack}>{s.back}</Button>
      </div>
      <iframe className={styles.frame} src="help.html" title={s.frameTitle} />
    </section>
  );
};

export default HelpView;
