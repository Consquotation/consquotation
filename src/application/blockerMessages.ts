import { AppendInspection, TargetBlocker } from "./workbookGateway";
import { STRINGS } from "../shared/strings.vi";

type AnyBlocker = TargetBlocker | AppendInspection["blockers"][number];

export function describeBlocker(blocker: AnyBlocker): string {
  const s = STRINGS.blockers;
  switch (blocker.kind) {
    case "protected":
      return s.protected;
    case "tableOverlap":
      return s.tableOverlap(blocker.tableNames.join(", "));
    case "mergedCells":
      return s.mergedCells(blocker.addresses.join(", "));
    case "outOfBounds":
      return s.outOfBounds;
    case "sheetMissing":
      return s.sheetMissing;
    case "tableMissing":
      return s.tableMissing;
    case "headersChanged":
      return s.headersChanged;
    case "selectionOutsideTable":
      return s.selectionOutsideTable;
  }
}
