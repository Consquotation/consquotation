import * as React from "react";
import { MessageBar, MessageBarBody, MessageBarTitle, makeStyles, tokens } from "@fluentui/react-components";
import { RequirementSet } from "../../office/capabilities";
import { STRINGS } from "../../shared/strings.vi";

export type UnsupportedReason =
  | { kind: "wrongHost" }
  | { kind: "missingRequirement"; requirement: RequirementSet };

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
  },
});

const UnsupportedScreen: React.FC<{ reason: UnsupportedReason }> = ({ reason }) => {
  const styles = useStyles();
  const detail =
    reason.kind === "wrongHost"
      ? STRINGS.unsupported.wrongHost
      : STRINGS.unsupported.missingRequirement(reason.requirement.name, reason.requirement.version);

  return (
    <div className={styles.root} role="alert">
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>{STRINGS.unsupported.title}</MessageBarTitle>
          {detail}
        </MessageBarBody>
      </MessageBar>
      <p>{STRINGS.unsupported.remedy}</p>
      <p>{STRINGS.unsupported.noChange}</p>
    </div>
  );
};

export default UnsupportedScreen;
