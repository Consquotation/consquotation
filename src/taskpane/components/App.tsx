import * as React from "react";
import {
  Body1,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import EnvironmentPanel from "./EnvironmentPanel";
import StorageProbePanel from "./StorageProbePanel";
import { STRINGS } from "../../shared/strings.vi";

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    padding: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalL,
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXS,
  },
});

const App: React.FC = () => {
  const styles = useStyles();

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <Title3 as="h1">{STRINGS.appName}</Title3>
        <Body1>{STRINGS.appTagline}</Body1>
      </header>

      <section aria-labelledby="cq-overview-title">
        <Subtitle2 as="h2" id="cq-overview-title">
          {STRINGS.overview.title}
        </Subtitle2>
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{STRINGS.overview.phaseNotice}</MessageBarBody>
        </MessageBar>
      </section>

      <EnvironmentPanel />
      <StorageProbePanel />
    </main>
  );
};

export default App;
