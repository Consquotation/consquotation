/**
 * Use case quản lý báo giá theo dòng (giai đoạn 17, ADR-0014).
 *
 * Nguồn dữ liệu: bảng báo giá và sheet phân tích (đọc lại mỗi lần, prompts/07) + hồ sơ báo giá trong
 * workbook. Không có giao dịch nguyên tử giữa ô Excel và hồ sơ: thứ tự luôn là ghi ô trước (có kiểm
 * tra giá trị cũ), lưu hồ sơ sau. Nếu bước sau lỗi, lần "Tính lại và lưu" kế tiếp đồng bộ lại từ sheet.
 * Mọi thao tác ghi đều so vân tay nội dung với lần người dùng đang xem; khác → dừng, yêu cầu xem lại.
 */

import type { LibrarySnapshot } from "../domain/library/types";
import { normalizeCode, rateToPercent } from "../domain/library/validation";
import { ANALYSIS_COLUMNS } from "../domain/pricing/analysis";
import { QuoteCheckResult, QuoteSnapshot, checkQuote } from "../domain/pricing/quoteCheck";
import { RoundingRule } from "../domain/pricing/rounding";
import { analysisRowsFor } from "../domain/quotation/calculate";
import {
  LineEvaluation,
  QuotationEvaluation,
  completionBlockers,
  evaluateQuotation,
} from "../domain/quotation/evaluate";
import { COST_TYPES, QuoteLine, quoteLines } from "../domain/quotation/lines";
import {
  CostType,
  QuotationItemRecord,
  QuotationRecord,
  newRecord,
} from "../domain/quotation/model";
import { inferMethod, reconcile } from "../domain/quotation/reconcile";
import {
  BREAKDOWN_COLUMNS,
  LINE_ID_HEADER,
  QUOTE_COLUMNS,
  QuoteColumnKey,
  extensionHeader,
} from "../domain/quoteTemplate";
import { PricingGateway } from "./pricingGateway";
import {
  LineCellWrite,
  QuotationGateway,
  RecordChangedError,
  RecordRead,
  RecordUnreadableError,
  RowGuard,
} from "./quotationGateway";
import { TargetChangedError } from "./workbookGateway";

export type QuotationState =
  "noRecord" | "draft" | "completed" | "modifiedAfterCompletion" | "unreadable";

export interface QuotationView {
  tableName: string;
  sheetName: string;
  /** Cột đầu tiên của bảng trên sheet (từ 0), để "Đi tới" chọn đúng ô. */
  firstColumnIndex: number;
  record: RecordRead;
  evaluation: QuotationEvaluation;
  check: QuoteCheckResult;
  state: QuotationState;
  /** Việc "Tính lại và lưu" sẽ làm, để hiển thị trước cho người dùng. */
  pending: { assignIds: number; removeItems: number; writeBreakdown: number };
  blockers: string[];
}

export type WriteOutcome<T> =
  | ({ status: "done" } & T)
  /** Workbook đã đổi so với lúc xem: không ghi gì (hoặc dừng ở bước kiểm tra), cần xem lại. */
  | { status: "changed" }
  | { status: "blocked"; reasons: string[] };

export interface RecalcSummary {
  assigned: number;
  copied: number;
  removed: number;
  breakdownWritten: number;
  /** Báo giá đang "hoàn tất" bị đưa về nháp vì nội dung đã đổi. */
  completionCleared: boolean;
}

export interface LibraryUpdateSummary {
  analysisCells: number;
  unitPriceCells: number;
  /** Số dòng báo giá dùng chung khối phân tích (cùng mã) bị ảnh hưởng. */
  affectedLines: number;
  /** Báo giá đang "hoàn tất" bị đưa về nháp vì nội dung đã đổi. */
  completionCleared: boolean;
}

interface Workspace {
  snapshot: QuoteSnapshot;
  unitPriceRule: RoundingRule;
  record: RecordRead;
  library: LibrarySnapshot | undefined;
}

export interface QuotationDeps {
  now: () => Date;
  newId: () => string;
  /** Thư viện hiện tại để phát hiện thay đổi so với snapshot; không có thì bỏ qua phần so sánh. */
  loadLibrary?: () => Promise<LibrarySnapshot | undefined>;
}

const header = (key: QuoteColumnKey) => QUOTE_COLUMNS.find((c) => c.key === key)!.header;
const ANALYSIS_PRICE_HEADER = ANALYSIS_COLUMNS.find((c) => c.key === "price")!.header;
const ANALYSIS_SOURCE_HEADER = ANALYSIS_COLUMNS.find((c) => c.key === "source")!.header;

export class QuotationService {
  constructor(
    private readonly pricing: PricingGateway,
    private readonly gateway: QuotationGateway,
    private readonly deps: QuotationDeps
  ) {}

  private stamp(): string {
    return this.deps.now().toISOString();
  }

  private async read(tableName: string, withLibrary = true): Promise<Workspace> {
    // Tuần tự: mỗi lệnh là một Excel.run riêng.
    const snapshot = await this.pricing.readQuoteSnapshot(tableName);
    const rounding = await this.pricing.readRounding();
    const record = await this.gateway.readRecord(tableName);
    let library: LibrarySnapshot | undefined;
    if (withLibrary && this.deps.loadLibrary) {
      try {
        library = await this.deps.loadLibrary();
      } catch {
        // Không đọc được thư viện (IndexedDB): vẫn đánh giá được báo giá, chỉ bỏ phần so sánh thư viện.
        library = undefined;
      }
    }
    return { snapshot, unitPriceRule: rounding.unitPrice, record, library };
  }

  private evaluate(ws: Workspace, record: QuotationRecord | null) {
    const check = checkQuote(ws.snapshot, { library: ws.library });
    const evaluation = evaluateQuotation({
      snapshot: ws.snapshot,
      record,
      check,
      unitPriceRule: ws.unitPriceRule,
      library: ws.library,
      now: this.stamp(),
    });
    return { check, evaluation };
  }

  async load(tableName: string): Promise<QuotationView> {
    const ws = await this.read(tableName);
    const record = ws.record.kind === "ok" ? ws.record.record : null;
    const { check, evaluation } = this.evaluate(ws, record);
    // Chạy thử (không ghi) để báo trước số việc sẽ làm; mã tạm chỉ cần khác nhau.
    let dryRunId = 0;
    const dryRun = reconcile(quoteLines(ws.snapshot).lines, record, {
      tableName,
      now: this.stamp(),
      newId: () => `dry-run-${++dryRunId}`,
    });
    let state: QuotationState;
    if (ws.record.kind === "unreadable") {
      state = "unreadable";
    } else if (!record) {
      state = "noRecord";
    } else if (record.status === "completed") {
      state =
        record.completedFingerprint === evaluation.fingerprint
          ? "completed"
          : "modifiedAfterCompletion";
    } else {
      state = "draft";
    }
    const blockers = completionBlockers(evaluation);
    if (ws.record.kind === "unreadable") {
      blockers.unshift(ws.record.message);
    }
    return {
      tableName,
      sheetName: ws.snapshot.quote.sheetName,
      firstColumnIndex: ws.snapshot.quote.firstColumnIndex,
      record: ws.record,
      evaluation,
      check,
      state,
      pending: {
        assignIds: evaluation.hasLineIds ? dryRun.assignments.length : 0,
        removeItems: dryRun.removed.length,
        writeBreakdown: evaluation.lines.filter((l) => l.breakdownWrite !== null).length,
      },
      blockers,
    };
  }

  /** Ghi kết quả tính mới nhất vào hồ sơ và lưu; đưa báo giá về nháp nếu nội dung khác lúc hoàn tất. */
  private async persist(
    tableName: string,
    record: QuotationRecord,
    expectedUpdatedAt: string | null
  ): Promise<{ completionCleared: boolean; evaluation: QuotationEvaluation }> {
    const ws = await this.read(tableName);
    const { evaluation } = this.evaluate(ws, record);
    const now = this.stamp();
    const byId = new Map(evaluation.lines.filter((l) => l.item).map((l) => [l.item!.id, l]));
    const items = record.items.map((item): QuotationItemRecord => {
      const line = byId.get(item.id);
      if (!line) {
        return item;
      }
      return {
        ...item,
        result: line.result,
        writtenBreakdown: writtenBreakdownOf(line, item),
        updatedAt: now,
      };
    });
    const completionCleared =
      record.status === "completed" && record.completedFingerprint !== evaluation.fingerprint;
    const next: QuotationRecord = {
      ...record,
      items,
      updatedAt: now,
      ...(completionCleared
        ? { status: "draft" as const, completedAt: null, completedFingerprint: null }
        : {}),
    };
    await this.gateway.saveRecord(next, expectedUpdatedAt);
    return { completionCleared, evaluation };
  }

  private async guarded<T>(task: () => Promise<WriteOutcome<T>>): Promise<WriteOutcome<T>> {
    try {
      return await task();
    } catch (error) {
      if (error instanceof TargetChangedError || error instanceof RecordChangedError) {
        return { status: "changed" };
      }
      throw error;
    }
  }

  /**
   * Tính lại và lưu: gán Mã dòng cho dòng chưa có/dòng sao chép, ghi đơn giá thành phần cho dòng phân
   * tích, cập nhật hồ sơ (bỏ mục của dòng đã xóa), lưu kết quả tính của từng dòng.
   */
  async recalculate(
    tableName: string,
    expectedFingerprint: string
  ): Promise<WriteOutcome<RecalcSummary>> {
    return this.guarded<RecalcSummary>(async () => {
      const ws = await this.read(tableName);
      if (ws.record.kind === "unreadable") {
        return { status: "blocked", reasons: [ws.record.message] };
      }
      const current = ws.record.kind === "ok" ? ws.record.record : null;
      const expectedUpdatedAt = current?.updatedAt ?? null;
      const first = this.evaluate(ws, current).evaluation;
      if (first.fingerprint !== expectedFingerprint) {
        return { status: "changed" };
      }
      if (!first.hasLineIds) {
        return {
          status: "blocked",
          reasons: ["Bảng chưa có cột Mã dòng: bấm Bổ sung cột quản lý theo dòng trước."],
        };
      }
      const lines = quoteLines(ws.snapshot).lines;
      const rec = reconcile(lines, current, {
        tableName,
        now: this.stamp(),
        newId: this.deps.newId,
      });
      if (rec.assignments.length > 0) {
        const byRow = new Map(lines.map((l) => [l.row, l]));
        const writes: LineCellWrite[] = rec.assignments.map((a) => ({
          row: a.row,
          header: LINE_ID_HEADER,
          value: a.lineId,
          expected: byRow.get(a.row)!.lineId ?? "",
        }));
        await this.gateway.writeLineCells(
          tableName,
          writes,
          rec.assignments.map((a) => identityGuard(ws.snapshot, byRow.get(a.row)!))
        );
      }

      // Đơn giá thành phần theo dữ liệu vừa ghi mã dòng.
      const ws2 = await this.read(tableName);
      const second = this.evaluate(ws2, rec.record).evaluation;
      const breakdownWrites = breakdownCellWrites(second.lines);
      if (breakdownWrites.writes.length > 0) {
        await this.gateway.writeLineCells(
          tableName,
          breakdownWrites.writes,
          breakdownWrites.guards
        );
      }
      const saved = await this.persist(tableName, rec.record, expectedUpdatedAt);
      return {
        status: "done",
        assigned: rec.assignments.filter((a) => a.reason === "missing").length,
        copied: rec.copied,
        removed: rec.removed.length,
        breakdownWritten: breakdownWrites.lines,
        completionCleared: saved.completionCleared,
      };
    });
  }

  /** Đánh dấu hoàn tất: chỉ khi không còn dòng lỗi, lỗi bảng, và hồ sơ đã đồng bộ với sheet. */
  async complete(
    tableName: string,
    expectedFingerprint: string
  ): Promise<WriteOutcome<{ completedAt: string }>> {
    return this.guarded<{ completedAt: string }>(async () => {
      const ws = await this.read(tableName);
      if (ws.record.kind !== "ok") {
        return {
          status: "blocked",
          reasons: [
            ws.record.kind === "unreadable"
              ? ws.record.message
              : "Báo giá chưa có hồ sơ: bấm Tính lại và lưu trước.",
          ],
        };
      }
      const record = ws.record.record;
      const { evaluation } = this.evaluate(ws, record);
      if (evaluation.fingerprint !== expectedFingerprint) {
        return { status: "changed" };
      }
      const blockers = completionBlockers(evaluation);
      if (blockers.length > 0) {
        return { status: "blocked", reasons: blockers };
      }
      const now = this.stamp();
      const byId = new Map(evaluation.lines.map((l) => [l.item?.id, l]));
      await this.gateway.saveRecord(
        {
          ...record,
          status: "completed",
          completedAt: now,
          completedFingerprint: evaluation.fingerprint,
          updatedAt: now,
          items: record.items.map((item) => {
            const line = byId.get(item.id);
            return line ? { ...item, result: line.result, updatedAt: now } : item;
          }),
        },
        record.updatedAt
      );
      return { status: "done", completedAt: now };
    });
  }

  /** Mở lại để sửa: trạng thái về nháp (không đổi dữ liệu trên sheet). */
  async reopen(tableName: string): Promise<WriteOutcome<{ reopenedAt: string }>> {
    return this.guarded<{ reopenedAt: string }>(async () => {
      const read = await this.gateway.readRecord(tableName);
      if (read.kind !== "ok") {
        return {
          status: "blocked",
          reasons: [read.kind === "unreadable" ? read.message : "Báo giá chưa có hồ sơ."],
        };
      }
      const now = this.stamp();
      await this.gateway.saveRecord(
        {
          ...read.record,
          status: "draft",
          completedAt: null,
          completedFingerprint: null,
          updatedAt: now,
        },
        read.record.updatedAt
      );
      return { status: "done", reopenedAt: now };
    });
  }

  /**
   * Cập nhật một dòng theo thư viện hiện tại (người dùng chủ động bấm, sau khi xem thay đổi):
   * - dòng lấy từ thư viện: ghi đơn giá mới vào ô Đơn giá;
   * - dòng phân tích: ghi giá nguồn mới lên sheet phân tích (dùng chung cho mọi dòng cùng mã), rồi
   *   ghi đơn giá công tác do Excel tính lại vào các dòng cùng mã.
   */
  async applyLibraryUpdate(
    tableName: string,
    lineId: string,
    expectedFingerprint: string
  ): Promise<WriteOutcome<LibraryUpdateSummary>> {
    return this.guarded<LibraryUpdateSummary>(async () => {
      const ws = await this.read(tableName);
      if (ws.record.kind !== "ok") {
        return {
          status: "blocked",
          reasons: ["Báo giá chưa có hồ sơ: bấm Tính lại và lưu trước."],
        };
      }
      const record = ws.record.record;
      const { evaluation } = this.evaluate(ws, record);
      if (evaluation.fingerprint !== expectedFingerprint) {
        return { status: "changed" };
      }
      const target = evaluation.lines.find((l) => l.line.lineId === lineId && l.item);
      const plan = target?.plan;
      if (!target || !plan) {
        return {
          status: "blocked",
          reasons: ["Dòng này không có thay đổi nào từ thư viện để cập nhật."],
        };
      }
      const now = this.stamp();
      const unitPriceHeader = header("unitPrice");

      if (plan.kind === "library") {
        await this.gateway.writeLineCells(
          tableName,
          [
            {
              row: target.line.row,
              header: unitPriceHeader,
              value: plan.newPrice,
              expected: target.line.unitPrice.value,
            },
          ],
          [identityGuard(ws.snapshot, target.line)]
        );
        const items = record.items.map((item) =>
          item.id === lineId && item.libraryPrice
            ? {
                ...item,
                libraryPrice: { ...item.libraryPrice, unitPrice: plan.newPrice },
                updatedAt: now,
              }
            : item
        );
        const saved = await this.persist(
          tableName,
          { ...record, items, updatedAt: now },
          record.updatedAt
        );
        return {
          status: "done",
          analysisCells: 0,
          unitPriceCells: 1,
          affectedLines: 1,
          completionCleared: saved.completionCleared,
        };
      }

      // Dòng phân tích: giá nguồn trên sheet phân tích.
      const rows = analysisRowsFor(ws.snapshot.analysis ?? [], target.line.code);
      const analysisWrites = plan.prices.flatMap((update) =>
        rows
          .filter((r) => normalizeCode(r.resourceCode) === normalizeCode(update.resourceCode))
          .flatMap((r) => [
            {
              rowIndex: r.rowIndex,
              header: ANALYSIS_PRICE_HEADER,
              value: update.newPrice,
              expected: r.price,
            },
            {
              rowIndex: r.rowIndex,
              header: ANALYSIS_SOURCE_HEADER,
              value: `'${updatedSource(update, target.item!, now)}`,
              expected: r.source,
            },
          ])
      );
      if (analysisWrites.length === 0) {
        return {
          status: "blocked",
          reasons: [
            "Không tìm thấy dòng tài nguyên tương ứng trên sheet phân tích (có thể đã bị sửa mã).",
          ],
        };
      }
      await this.gateway.writeAnalysisCells(analysisWrites);

      // Excel đã tính lại đơn giá công tác: ghi vào mọi dòng báo giá cùng mã.
      const ws2 = await this.read(tableName, false);
      const fresh = analysisRowsFor(ws2.snapshot.analysis ?? [], target.line.code).find(
        (r) => r.unitPriceType !== "Error"
      );
      const sameCode = quoteLines(ws2.snapshot).lines.filter(
        (l) =>
          normalizeCode(l.code) === normalizeCode(target.line.code) &&
          inferMethod(l.notes) === "norm"
      );
      let unitPriceCells = 0;
      if (fresh && typeof fresh.unitPrice === "number") {
        const writes = sameCode
          .filter((l) => l.unitPrice.value !== fresh.unitPrice)
          .map((l) => ({
            row: l.row,
            header: unitPriceHeader,
            value: fresh.unitPrice as number,
            expected: l.unitPrice.value,
          }));
        if (writes.length > 0) {
          await this.gateway.writeLineCells(
            tableName,
            writes,
            writes.map((w) =>
              identityGuard(
                ws2.snapshot,
                sameCode.find((l) => l.row === w.row)!
              )
            )
          );
          unitPriceCells = writes.length;
        }
      }

      // Snapshot giá trong hồ sơ của mọi dòng dùng chung khối phân tích.
      const code = normalizeCode(target.line.code);
      const sharing = new Set(
        quoteLines(ws2.snapshot)
          .lines.filter((l) => normalizeCode(l.code) === code && l.lineId)
          .map((l) => l.lineId!)
      );
      const items = record.items.map((item) => {
        if (!sharing.has(item.id) || item.pricingMethod !== "norm") {
          return item;
        }
        const components = item.components.map((component) => {
          const update = plan.prices.find(
            (p) => normalizeCode(p.resourceCode) === normalizeCode(component.resourceCodeSnapshot)
          );
          return update
            ? {
                ...component,
                priceId: update.priceId,
                unitPriceSnapshot: update.newPrice,
                currency: update.currency,
                sourceReference: updatedSource(update, item, now),
              }
            : component;
        });
        return { ...item, components, updatedAt: now };
      });
      // Đơn giá thành phần của các dòng này được ghi lại theo phân tích mới.
      const ws3 = await this.read(tableName, false);
      const third = this.evaluate(ws3, { ...record, items }).evaluation;
      const breakdownWrites = breakdownCellWrites(
        third.lines.filter((l) => l.item && sharing.has(l.item.id))
      );
      if (breakdownWrites.writes.length > 0) {
        await this.gateway.writeLineCells(
          tableName,
          breakdownWrites.writes,
          breakdownWrites.guards
        );
      }
      const saved = await this.persist(
        tableName,
        { ...record, items, updatedAt: now },
        record.updatedAt
      );
      return {
        status: "done",
        analysisCells: analysisWrites.length / 2,
        unitPriceCells,
        affectedLines: sharing.size,
        completionCleared: saved.completionCleared,
      };
    });
  }

  /**
   * Ghi nhận dòng vừa chèn (sau khi ghi sheet thành công). Lỗi ở đây không làm mất dòng đã ghi; lần
   * Tính lại và lưu kế tiếp sẽ tạo mục hồ sơ từ sheet (thiếu phần truy vết nguồn).
   */
  async registerInsertedLine(
    tableName: string,
    item: QuotationItemRecord
  ): Promise<{ saved: true } | { saved: false; reason: string }> {
    try {
      // Bảng cũ không có cột Mã dòng (hoặc dòng đã bị sửa ngay sau khi ghi): không tạo mục hồ sơ mồ côi.
      const lines = quoteLines(await this.pricing.readQuoteSnapshot(tableName)).lines;
      if (!lines.some((l) => l.lineId === item.id)) {
        return { saved: false, reason: "notOnSheet" };
      }
      const read = await this.gateway.readRecord(tableName);
      if (read.kind === "unreadable") {
        return { saved: false, reason: read.message };
      }
      const now = this.stamp();
      const current =
        read.kind === "ok" ? read.record : newRecord(this.deps.newId(), tableName, now);
      const items = [...current.items.filter((i) => i.id !== item.id), item];
      // Thêm dòng làm nội dung khác lúc hoàn tất: về nháp.
      const next: QuotationRecord = {
        ...current,
        items,
        updatedAt: now,
        ...(current.status === "completed"
          ? { status: "draft" as const, completedAt: null, completedFingerprint: null }
          : {}),
      };
      await this.gateway.saveRecord(next, read.kind === "ok" ? read.record.updatedAt : null);
      return { saved: true };
    } catch (error) {
      return {
        saved: false,
        reason:
          error instanceof RecordUnreadableError || error instanceof RecordChangedError
            ? error.message
            : String((error as Error)?.message ?? error),
      };
    }
  }

  async inspectColumns(tableName: string) {
    return this.gateway.inspectExtensionColumns(tableName);
  }

  async addColumns(tableName: string): Promise<string[]> {
    return this.gateway.addExtensionColumns(tableName);
  }
}

function rawValue(snapshot: QuoteSnapshot, row: number, headerText: string): unknown {
  const index = snapshot.quote.headers.indexOf(headerText);
  return index < 0 ? undefined : snapshot.quote.rows[row]?.values[index];
}

/** Dòng phải còn đúng Mã công tác, Nội dung, Mã dòng như lúc đọc (người dùng có thể vừa chèn/xóa dòng). */
function identityGuard(snapshot: QuoteSnapshot, line: QuoteLine): RowGuard {
  const expected: Record<string, unknown> = {};
  for (const h of [header("code"), header("description"), LINE_ID_HEADER]) {
    const value = rawValue(snapshot, line.row, h);
    if (value !== undefined) {
      expected[h] = value;
    }
  }
  return { row: line.row, expected };
}

function breakdownCellWrites(lines: readonly LineEvaluation[]): {
  writes: LineCellWrite[];
  guards: RowGuard[];
  lines: number;
} {
  const writes: LineCellWrite[] = [];
  const guards: RowGuard[] = [];
  let count = 0;
  for (const l of lines) {
    if (!l.breakdownWrite || !l.line.breakdown || !l.line.lineId) {
      continue;
    }
    count++;
    for (const t of COST_TYPES) {
      writes.push({
        row: l.line.row,
        header: extensionHeader(BREAKDOWN_COLUMNS[t]),
        value: l.breakdownWrite[t],
        expected: l.line.breakdown[t].value,
      });
    }
    guards.push({ row: l.line.row, expected: { [LINE_ID_HEADER]: l.line.lineId } });
  }
  return { writes, guards, lines: count };
}

/** Giá trị đơn giá thành phần trên sheet do add-in ghi (để nhận ra người dùng sửa tay về sau). */
function writtenBreakdownOf(
  line: LineEvaluation,
  item: QuotationItemRecord
): Record<CostType, number | null> | null {
  const cells = line.line.breakdown;
  if (!cells || item.pricingMethod !== "norm") {
    return item.writtenBreakdown;
  }
  if (line.breakdownWrite) {
    // Lần lưu vừa ghi các giá trị này (đọc lại trong persist nên thường đã khớp ô).
    return Object.fromEntries(
      COST_TYPES.map((t) => [
        t,
        line.breakdownWrite![t] === "" ? null : (line.breakdownWrite![t] as number),
      ])
    ) as Record<CostType, number | null>;
  }
  const totals = line.breakdown?.totals;
  if (totals && COST_TYPES.every((t) => cells[t].value === totals[t])) {
    return { ...totals };
  }
  return item.writtenBreakdown;
}

/** Chữ "Nguồn giá" sau khi cập nhật theo thư viện; giữ ghi chú hao hụt như lúc chèn. */
function updatedSource(
  update: { source: string; currency: string; resourceCode: string },
  item: QuotationItemRecord,
  now: string
): string {
  const day = now.slice(0, 10).split("-").reverse().join("/");
  const component = item.components.find(
    (c) => normalizeCode(c.resourceCodeSnapshot) === normalizeCode(update.resourceCode)
  );
  const parts = [update.source || "Không ghi nguồn", update.currency];
  if (component && component.appliedConsumption !== component.baseConsumption) {
    parts.push(
      `hao phí gồm hao hụt ${rateToPercent(component.wasteRate)}% (cơ sở ${component.baseConsumption})`
    );
  }
  parts.push(`cập nhật theo thư viện ${day}`);
  if (item.source?.normCode) {
    parts.push(`định mức ${item.source.normCode} v${item.source.normVersion}`);
  }
  return parts.join("; ");
}
