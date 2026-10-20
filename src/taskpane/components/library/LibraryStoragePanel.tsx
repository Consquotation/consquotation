import * as React from "react";
import { Body1, Caption1, Spinner, Subtitle2, makeStyles, tokens } from "@fluentui/react-components";
import { useLibrary } from "./useLibrary";
import { LibraryService } from "../../../application/libraryService";
import { LIBRARY_STRINGS } from "../../../shared/strings.library.vi";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS },
});

/** Mục "nơi lưu" trong Cài đặt (prompts/05, 08, 12): dữ liệu gì, lưu ở đâu, rủi ro gì. */
const LibraryStoragePanel: React.FC<{ service: LibraryService }> = ({ service }) => {
  const styles = useStyles();
  const s = LIBRARY_STRINGS.storage;
  const { state } = useLibrary(service);
  return (
    <section className={styles.root} aria-labelledby="cq-library-storage-title">
      <Subtitle2 as="h2" id="cq-library-storage-title">
        {s.title}
      </Subtitle2>
      <Body1>{s.where}</Body1>
      {state.kind === "loading" && <Spinner size="tiny" label={LIBRARY_STRINGS.loading} />}
      {state.kind === "ready" && (
        <Body1>
          {s.counts(
            state.library.workItems.length,
            state.library.resources.length,
            state.library.resourcePrices.length,
            state.library.norms.length
          )}
        </Body1>
      )}
      {state.kind === "error" && <Body1>{state.message}</Body1>}
      <Caption1>{s.risk}</Caption1>
    </section>
  );
};

export default LibraryStoragePanel;
