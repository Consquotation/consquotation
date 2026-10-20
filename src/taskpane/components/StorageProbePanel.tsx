import * as React from "react";
import {
  Body1,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import InfoList from "./InfoList";
import { readPartitionKey } from "../../office/environment";
import {
  PersistenceRequest,
  ProbeResult,
  StorageStatus,
  readStorageStatus,
  requestPersistence,
  runStorageProbe,
} from "../../storage/storageProbe";
import { STRINGS } from "../../shared/strings.vi";

/* global indexedDB, navigator */

type ProbeState =
  | { kind: "idle" }
  | { kind: "running" }
  | {
      kind: "done";
      status: StorageStatus;
      persistence: PersistenceRequest;
      result: ProbeResult | null;
    }
  | { kind: "error"; message: string };

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalS,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
  },
});

function formatBytes(value: number | null): string {
  if (value === null) {
    return STRINGS.storage.unknown;
  }
  return `${(value / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
}

function formatBoolean(value: boolean | null): string {
  if (value === null) {
    return STRINGS.storage.unknown;
  }
  return value ? STRINGS.storage.yes : STRINGS.storage.no;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN");
}

const StorageProbePanel: React.FC = () => {
  const styles = useStyles();
  const s = STRINGS.storage;
  const [state, setState] = React.useState<ProbeState>({ kind: "idle" });
  const partitionKey = readPartitionKey();

  const runProbe = async () => {
    setState({ kind: "running" });
    try {
      const factory = typeof indexedDB === "undefined" ? undefined : indexedDB;
      const storageManager = typeof navigator === "undefined" ? undefined : navigator.storage;
      const status = await readStorageStatus(factory, storageManager);
      const persistence = await requestPersistence(storageManager);
      const result = factory ? await runStorageProbe(factory, partitionKey) : null;
      setState({ kind: "done", status, persistence, result });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className={styles.root} aria-labelledby="cq-storage-title">
      <Subtitle2 as="h2" id="cq-storage-title">
        {s.title}
      </Subtitle2>
      <Body1>{s.description}</Body1>

      <div className={styles.actions}>
        <Button appearance="primary" onClick={runProbe} disabled={state.kind === "running"}>
          {state.kind === "running" ? s.running : s.run}
        </Button>
        {state.kind === "running" && <Spinner size="tiny" aria-label={s.running} />}
      </div>

      {state.kind === "done" && (
        <InfoList
          items={[
            { label: s.indexedDb, value: state.status.indexedDbAvailable ? s.available : s.unavailable },
            { label: s.persisted, value: formatBoolean(state.status.persisted) },
            { label: s.persistRequest, value: s.persistResult[state.persistence] },
            {
              label: s.usage,
              value: `${formatBytes(state.status.usageBytes)} / ${formatBytes(state.status.quotaBytes)}`,
            },
            { label: s.partitionKey, value: partitionKey ?? s.none },
            ...(state.result
              ? [
                  { label: s.database, value: state.result.databaseName },
                  {
                    label: s.previousWrite,
                    value: state.result.previousWriteAt
                      ? formatTimestamp(state.result.previousWriteAt)
                      : s.noPreviousWrite,
                  },
                  { label: s.currentWrite, value: formatTimestamp(state.result.currentWriteAt) },
                ]
              : []),
          ]}
        />
      )}

      {state.kind === "error" && (
        <MessageBar intent="error" layout="multiline" politeness="assertive">
          <MessageBarBody>
            <MessageBarTitle>{s.failed}</MessageBarTitle>
            {state.message}
          </MessageBarBody>
        </MessageBar>
      )}

      <MessageBar intent="warning" layout="multiline">
        <MessageBarBody>{s.cacheWarning}</MessageBarBody>
      </MessageBar>
    </section>
  );
};

export default StorageProbePanel;
