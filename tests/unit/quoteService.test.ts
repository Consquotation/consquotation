import { describe, expect, it } from "vitest";
import { executeAppend, executeTemplate, planAppend, planTemplate } from "../../src/application/quoteService";
import {
  AppendInspection,
  InsertPosition,
  TargetChangedError,
  TargetInspection,
  TemplateTarget,
  WorkbookGateway,
} from "../../src/application/workbookGateway";

/** Excel giả lập: ghi lại mọi lần gọi ghi để kiểm chứng "không ghi khi chưa xác nhận". */
class FakeGateway implements WorkbookGateway {
  writes: { target: TemplateTarget; initialRows: number; fingerprint: string }[] = [];
  appends: { tableName: string; rows: (string | number)[][]; insertIndex: number | null }[] = [];
  inspectedPositions: InsertPosition[] = [];
  inspectedNewSheetNames: string[] = [];
  selectionInspection: TargetInspection = inspection({ kind: "atCell", sheetName: "Sheet1", rowIndex: 1, columnIndex: 1 });
  appendInspection: AppendInspection = {
    tableName: "CQ_Quote_1",
    sheetName: "Báo giá",
    cellsBelow: { count: 0, sample: [] },
    blockers: [],
    insertIndex: null,
    fingerprint: "fp-append",
  };
  /** Mô phỏng người dùng sửa sheet trong lúc hộp xác nhận đang mở. */
  changedBeforeWrite = false;

  async readContext() {
    return { workbookName: "Book1.xlsx", sheetName: "Sheet1", selectionAddress: "B2", sheetProtected: false };
  }
  async inspectAtSelection() {
    return this.selectionInspection;
  }
  async inspectTarget(target: TemplateTarget) {
    if (target.kind === "newSheet") {
      this.inspectedNewSheetNames.push(target.baseName);
    }
    return target.kind === "newSheet" ? inspection(target, "Báo giá", "A1:I16") : this.selectionInspection;
  }
  async writeTemplate(target: TemplateTarget, initialRows: number, fingerprint: string) {
    if (this.changedBeforeWrite) {
      throw new TargetChangedError();
    }
    this.writes.push({ target, initialRows, fingerprint });
    return { sheetName: "Báo giá", tableName: "CQ_Quote_1", address: "A1:I16" };
  }
  async listQuoteTables() {
    return [];
  }
  async selectQuoteTable() {}
  async wasLibraryUsed() {
    return false;
  }
  async markLibraryUsed() {}
  async listSheets() {
    return { sheets: [], activeSheet: "Sheet1" };
  }
  async readSheet(sheetName: string) {
    return { table: { label: sheetName, firstRowNumber: 1, firstColumnIndex: 0, rows: [] }, totalRows: 0 };
  }
  async openNewWorkbook() {}
  async readQuoteInfo() {
    return { sheetName: "S", sheetProtected: false, cells: [], fingerprint: "" };
  }
  async writeQuoteInfo() {}
  async inspectAppend(_tableName: string, position: InsertPosition) {
    this.inspectedPositions.push(position);
    return this.appendInspection;
  }
  async appendRows(
    tableName: string,
    rows: (string | number)[][],
    _fingerprint: string,
    insertIndex: number | null
  ) {
    if (this.changedBeforeWrite) {
      throw new TargetChangedError();
    }
    this.appends.push({ tableName, rows, insertIndex });
    return { tableName, sheetName: "Báo giá", address: "A16:I16" };
  }
}

function inspection(target: TemplateTarget, sheetName = "Sheet1", address = "B2:J17"): TargetInspection {
  return {
    target,
    sheetName,
    address,
    occupied: { count: 0, sample: [] },
    blockers: [],
    fingerprint: "fp-1",
    skippedChecks: [],
  };
}

describe("planTemplate / executeTemplate", () => {
  it("sheet mới: sẵn sàng ghi ngay, không cần xác nhận", async () => {
    const gateway = new FakeGateway();
    const plan = await planTemplate(gateway, "newSheet", 5);
    expect(plan.status).toBe("ready");
    const result = await executeTemplate(gateway, plan, 5, { overwrite: false });
    expect(result.status).toBe("created");
    expect(gateway.writes).toHaveLength(1);
  });

  it("vùng trống trên sheet có sẵn: phải hiển thị vị trí để xác nhận", async () => {
    const gateway = new FakeGateway();
    const plan = await planTemplate(gateway, "atSelection", 5);
    expect(plan.status).toBe("needsLocationConfirmation");
    expect(gateway.writes).toHaveLength(0);
  });

  it("vùng có dữ liệu: không ghi khi chưa xác nhận ghi đè", async () => {
    const gateway = new FakeGateway();
    gateway.selectionInspection = {
      ...gateway.selectionInspection,
      occupied: { count: 3, sample: ["B2", "C5", "D9"] },
    };
    const plan = await planTemplate(gateway, "atSelection", 5);
    expect(plan.status).toBe("needsOverwriteConfirmation");
    await expect(executeTemplate(gateway, plan, 5, { overwrite: false })).rejects.toThrow();
    expect(gateway.writes).toHaveLength(0);

    const result = await executeTemplate(gateway, plan, 5, { overwrite: true });
    expect(result.status).toBe("created");
    expect(gateway.writes[0].fingerprint).toBe("fp-1");
  });

  it("sheet bị khóa hoặc chồng Table: chặn hẳn, kể cả khi người dùng muốn ghi đè", async () => {
    const gateway = new FakeGateway();
    gateway.selectionInspection = {
      ...gateway.selectionInspection,
      occupied: { count: 2, sample: ["B2", "B3"] },
      blockers: [{ kind: "protected" }, { kind: "tableOverlap", tableNames: ["Table1"] }],
    };
    const plan = await planTemplate(gateway, "atSelection", 5);
    expect(plan.status).toBe("blocked");
    await expect(executeTemplate(gateway, plan, 5, { overwrite: true })).rejects.toThrow();
    expect(gateway.writes).toHaveLength(0);
  });

  it("ghi vào vị trí đã cố định lúc kiểm tra, không theo vùng chọn mới", async () => {
    const gateway = new FakeGateway();
    const plan = await planTemplate(gateway, "atSelection", 5);
    gateway.selectionInspection = inspection({ kind: "atCell", sheetName: "Sheet2", rowIndex: 40, columnIndex: 0 });
    await executeTemplate(gateway, plan, 5, { overwrite: false });
    expect(gateway.writes[0].target).toEqual({ kind: "atCell", sheetName: "Sheet1", rowIndex: 1, columnIndex: 1 });
  });

  it("workbook đổi trong lúc chờ xác nhận: báo 'changed', không ghi", async () => {
    const gateway = new FakeGateway();
    const plan = await planTemplate(gateway, "atSelection", 5);
    gateway.changedBeforeWrite = true;
    const result = await executeTemplate(gateway, plan, 5, { overwrite: false });
    expect(result.status).toBe("changed");
    expect(gateway.writes).toHaveLength(0);
  });

  it("số dòng ban đầu được giới hạn trước khi ghi", async () => {
    const gateway = new FakeGateway();
    const plan = await planTemplate(gateway, "newSheet", 99_999);
    await executeTemplate(gateway, plan, 99_999, { overwrite: false });
    expect(gateway.writes[0].initialRows).toBe(500);
  });
});

describe("planAppend / executeAppend", () => {
  const row = ["=ROW()", "BT-01", "", "Đổ bê tông", "m3", 1, 2, "=x", ""];

  it("không có dữ liệu bên dưới bảng: thêm ngay", async () => {
    const gateway = new FakeGateway();
    const plan = await planAppend(gateway, "CQ_Quote_1");
    expect(plan.status).toBe("ready");
    const result = await executeAppend(gateway, plan, [row], { shift: false });
    expect(result.status).toBe("appended");
    expect(gateway.appends).toEqual([{ tableName: "CQ_Quote_1", rows: [row], insertIndex: null }]);
  });

  it("có dữ liệu bên dưới bảng: cần xác nhận đẩy xuống", async () => {
    const gateway = new FakeGateway();
    gateway.appendInspection = { ...gateway.appendInspection, cellsBelow: { count: 4, sample: ["A20"] } };
    const plan = await planAppend(gateway, "CQ_Quote_1");
    expect(plan.status).toBe("needsShiftConfirmation");
    await expect(executeAppend(gateway, plan, [row], { shift: false })).rejects.toThrow();
    expect(gateway.appends).toHaveLength(0);
    await executeAppend(gateway, plan, [row], { shift: true });
    expect(gateway.appends).toHaveLength(1);
  });

  it("tiêu đề cột bị đổi: chặn", async () => {
    const gateway = new FakeGateway();
    gateway.appendInspection = { ...gateway.appendInspection, blockers: [{ kind: "headersChanged" }] };
    const plan = await planAppend(gateway, "CQ_Quote_1");
    expect(plan.status).toBe("blocked");
    await expect(executeAppend(gateway, plan, [row], { shift: true })).rejects.toThrow();
  });

  it("bảng đổi trong lúc chờ xác nhận: báo 'changed', không ghi", async () => {
    const gateway = new FakeGateway();
    const plan = await planAppend(gateway, "CQ_Quote_1");
    gateway.changedBeforeWrite = true;
    expect((await executeAppend(gateway, plan, [row], { shift: false })).status).toBe("changed");
    expect(gateway.appends).toHaveLength(0);
  });
});

describe("prompts/06: tên sheet và vị trí chèn", () => {
  it("sheet mới dùng tên người dùng chọn; mặc định là 'Báo giá'", async () => {
    const gateway = new FakeGateway();
    await planTemplate(gateway, "newSheet", 5, "Báo giá nhà xưởng");
    await planTemplate(gateway, "newSheet", 5);
    expect(gateway.inspectedNewSheetNames).toEqual(["Báo giá nhà xưởng", "Báo giá"]);
  });

  it("chèn dưới dòng đang chọn: hỏi đúng vị trí và ghi tại insertIndex đã cố định lúc kiểm tra", async () => {
    const gateway = new FakeGateway();
    gateway.appendInspection = { ...gateway.appendInspection, insertIndex: 2 };
    const plan = await planAppend(gateway, "CQ_Quote_1", { kind: "belowSelection" });
    expect(gateway.inspectedPositions).toEqual([{ kind: "belowSelection" }]);
    // Người dùng click chỗ khác trước khi ghi — vị trí ghi vẫn là vị trí đã kiểm tra.
    gateway.appendInspection = { ...gateway.appendInspection, insertIndex: 7 };
    await executeAppend(gateway, plan, [["x"]], { shift: false });
    expect(gateway.appends[0].insertIndex).toBe(2);
  });

  it("vùng chọn ngoài bảng khi chọn 'dưới dòng đang chọn': chặn, không ghi", async () => {
    const gateway = new FakeGateway();
    gateway.appendInspection = {
      ...gateway.appendInspection,
      blockers: [{ kind: "selectionOutsideTable" }],
    };
    const plan = await planAppend(gateway, "CQ_Quote_1", { kind: "belowSelection" });
    expect(plan.status).toBe("blocked");
    await expect(executeAppend(gateway, plan, [["x"]], { shift: true })).rejects.toThrow();
    expect(gateway.appends).toHaveLength(0);
  });

  it("mặc định chèn cuối bảng", async () => {
    const gateway = new FakeGateway();
    await planAppend(gateway, "CQ_Quote_1");
    expect(gateway.inspectedPositions).toEqual([{ kind: "end" }]);
  });
});
