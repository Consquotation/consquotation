import * as React from "react";
import { Caption1, Subtitle2 } from "@fluentui/react-components";
import InfoList from "./InfoList";
import { APP_VERSION, BUILD_MODE } from "../../shared/buildInfo";
import { STRINGS } from "../../shared/strings.vi";

const VersionPanel: React.FC = () => {
  const s = STRINGS.settings;
  return (
    <section aria-labelledby="cq-version-title">
      <Subtitle2 as="h2" id="cq-version-title" tabIndex={-1}>
        {s.versionTitle}
      </Subtitle2>
      <InfoList
        items={[
          { label: s.version, value: APP_VERSION },
          { label: s.buildMode, value: BUILD_MODE === "production" ? s.production : s.development },
        ]}
      />
      <Caption1>{s.unavailableNote}</Caption1>
    </section>
  );
};

export default VersionPanel;
