import * as React from "react";
import { Subtitle2 } from "@fluentui/react-components";
import InfoList from "./InfoList";
import { RUNTIME_BASELINE, checkRuntimeSupport, isFeatureSupported } from "../../office/capabilities";
import { officeIsSetSupported, readHostInfo } from "../../office/environment";
import { STRINGS } from "../../shared/strings.vi";

const EnvironmentPanel: React.FC = () => {
  // Chỉ đọc một lần khi mở pane; thông tin này không đổi trong phiên Excel.
  const [hostInfo] = React.useState(readHostInfo);
  const [support] = React.useState(() => checkRuntimeSupport(officeIsSetSupported));
  const [optional] = React.useState(() => ({
    pageLayout: isFeatureSupported("pageLayout", officeIsSetSupported),
    mergedAreas: isFeatureSupported("mergedAreas", officeIsSetSupported),
  }));
  const s = STRINGS.environment;

  return (
    <section aria-labelledby="cq-env-title">
      <Subtitle2 as="h2" id="cq-env-title">
        {s.title}
      </Subtitle2>
      <InfoList
        items={[
          { label: s.host, value: hostInfo.host },
          { label: s.platform, value: hostInfo.platform },
          { label: s.version, value: hostInfo.version },
          {
            label: s.baseline(RUNTIME_BASELINE.name, RUNTIME_BASELINE.version),
            value: support.supported ? s.supported : s.notSupported,
          },
          { label: s.pageLayout, value: optional.pageLayout ? s.supported : s.pageLayoutMissing },
          { label: s.mergedAreas, value: optional.mergedAreas ? s.supported : s.mergedAreasMissing },
        ]}
      />
    </section>
  );
};

export default EnvironmentPanel;
