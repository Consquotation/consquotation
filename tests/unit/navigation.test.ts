import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TAB_VIEWS, parseInitialView } from "../../src/taskpane/navigation";
import { defaultInsertPosition, preferredTable } from "../../src/application/quoteTableSelection";
import { QuoteTableInfo } from "../../src/application/workbookGateway";

describe("parseInitialView", () => {
  it.each([
    ["", "overview"],
    ["?view=quote", "quote"],
    ["?view=settings", "settings"],
    ["?view=help", "help"],
    ["?view=library", "library"],
    ["?view=import", "overview"],
    ["?view=QUOTE", "overview"],
    ["?other=1&view=quote", "quote"],
  ])("'%s' → %s", (search, view) => {
    expect(parseInitialView(search)).toBe(view);
  });

  it("chỉ có các tab đã triển khai (prompts/05)", () => {
    expect(TAB_VIEWS).toEqual(["overview", "quote", "library", "settings"]);
  });
});

describe("manifest dev: lệnh Ribbon", () => {
  const manifest = readFileSync("manifest/manifest.dev.xml", "utf8");

  it("chỉ có các lệnh đã triển khai", () => {
    const controls = [...manifest.matchAll(/<Control xsi:type="Button" id="([^"]+)"/g)].map((m) => m[1]);
    expect(controls).toEqual(["CQ.OpenTaskpane", "CQ.CreateQuote", "CQ.OpenLibrary", "CQ.OpenHelp"]);
  });

  it("mọi nút mở cùng một task pane và trỏ tới màn hình mà task pane hiểu được", () => {
    const paneIds = [...manifest.matchAll(/<TaskpaneId>([^<]+)<\/TaskpaneId>/g)].map((m) => m[1]);
    expect(new Set(paneIds)).toEqual(new Set(["CQ.MainTaskpane"]));
    const views = [...manifest.matchAll(/taskpane\.html\?view=([a-z]+)/g)].map((m) => m[1]);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(parseInitialView(`?view=${view}`)).toBe(view);
    }
  });

  it("mọi resid được tham chiếu đều có định nghĩa trong Resources", () => {
    const referenced = new Set([...manifest.matchAll(/resid="([^"]+)"/g)].map((m) => m[1]));
    const defined = new Set([...manifest.matchAll(/<bt:(?:Image|Url|String) id="([^"]+)"/g)].map((m) => m[1]));
    for (const id of referenced) {
      expect(defined.has(id), id).toBe(true);
    }
  });
});

describe("preferredTable", () => {
  const table = (name: string, extra: Partial<QuoteTableInfo> = {}): QuoteTableInfo => ({
    tableName: name,
    sheetName: "S",
    dataRowCount: 1,
    headersMatch: true,
    containsSelection: false,
    selectedSheetRow: null,
    ...extra,
  });

  it("ưu tiên bảng đang chứa vùng chọn trong Excel", () => {
    expect(preferredTable([table("A"), table("B", { containsSelection: true })], "A")).toBe("B");
  });

  it("giữ lựa chọn hiện tại khi vùng chọn không nằm trong bảng nào", () => {
    expect(preferredTable([table("A"), table("B")], "B")).toBe("B");
  });

  it("mặc định chọn bảng đúng mẫu đầu tiên; danh sách rỗng → chuỗi rỗng", () => {
    expect(preferredTable([table("A", { headersMatch: false }), table("B")], "")).toBe("B");
    expect(preferredTable([], "A")).toBe("");
  });
});

describe("defaultInsertPosition", () => {
  const base = { tableName: "A", sheetName: "S", dataRowCount: 3, headersMatch: true };

  it("đang chọn ô trong bảng → chèn ngay dưới dòng đang chọn", () => {
    expect(defaultInsertPosition({ ...base, containsSelection: true, selectedSheetRow: 13 })).toBe("belowSelection");
  });

  it("vùng chọn ngoài bảng hoặc chưa có bảng → cuối bảng", () => {
    expect(defaultInsertPosition({ ...base, containsSelection: false, selectedSheetRow: null })).toBe("end");
    expect(defaultInsertPosition(undefined)).toBe("end");
  });
});
