import * as React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";

export interface InfoItem {
  label: string;
  value: React.ReactNode;
}

const useStyles = makeStyles({
  list: {
    display: "grid",
    gridTemplateColumns: "minmax(110px, auto) 1fr",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXS,
    margin: 0,
  },
  term: {
    color: tokens.colorNeutralForeground3,
  },
  detail: {
    margin: 0,
    wordBreak: "break-word",
  },
});

/** Danh sách nhãn–giá trị dùng chung cho các khối chẩn đoán. */
const InfoList: React.FC<{ items: InfoItem[] }> = ({ items }) => {
  const styles = useStyles();
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <React.Fragment key={item.label}>
          <dt className={styles.term}>{item.label}</dt>
          <dd className={styles.detail}>{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

export default InfoList;
