import * as React from "react";
import { LibraryService } from "../../../application/libraryService";
import { LibrarySnapshot } from "../../../domain/library/types";
import { recordError } from "../../../shared/diagnostics";

export type LibraryState =
  | { kind: "loading" }
  | { kind: "ready"; library: LibrarySnapshot }
  | { kind: "error"; message: string };

/** Đọc lại toàn bộ thư viện sau mỗi thay đổi — đơn giản và luôn khớp dữ liệu đã lưu. */
export function useLibrary(service: LibraryService) {
  const [state, setState] = React.useState<LibraryState>({ kind: "loading" });

  const reload = React.useCallback(async () => {
    try {
      setState({ kind: "ready", library: await service.load() });
    } catch (error) {
      recordError("thư viện", error);
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [service]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
