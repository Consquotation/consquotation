import { afterEach, describe, expect, it, vi } from "vitest";
import { TargetChangedError } from "../../src/application/workbookGateway";
import { RecordChangedError, RecordUnreadableError } from "../../src/application/quotationGateway";
import { ExcelOpError } from "../../src/domain/excel/errors";
import { describeOfficeError } from "../../src/office/officeErrors";
import { GatewayMap, handleDialogMessage } from "../../src/taskpane/dialog/hostBridge";
import {
  decodeSnapshot,
  deserializeError,
  encodeSnapshot,
  serializeError,
} from "../../src/taskpane/dialog/protocol";
import { LOST_BRIDGE_MESSAGE, RemoteClient } from "../../src/taskpane/dialog/remoteClient";
import { dialogUrl, isDialogMode } from "../../src/taskpane/dialog/appDialog";

/** Nối hộp thoại và task pane bằng hàng đợi trong bộ nhớ, đi qua JSON như tin nhắn thật. */
function connect(gateways: Partial<GatewayMap>, opened: string[] = [], timeoutMs?: number) {
  let toDialog: (message: string) => void = () => undefined;
  const client = new RemoteClient(
    {
      send: (message) =>
        void handleDialogMessage(message, {
          gateways: gateways as GatewayMap,
          reply: (reply) => toDialog(reply),
          openUrl: (url) => opened.push(url),
        }),
      onMessage: (handler) => {
        toDialog = handler;
      },
    },
    timeoutMs
  );
  return { client, push: (message: string) => toDialog(message) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("lỗi qua cầu nối", () => {
  it("giữ đúng lớp lỗi mà giao diện kiểm bằng instanceof", () => {
    const round = (e: Error) => deserializeError(JSON.parse(JSON.stringify(serializeError(e))));
    const op = round(new ExcelOpError("tableNotFound", "Không thấy bảng"));
    expect(op).toBeInstanceOf(ExcelOpError);
    expect((op as ExcelOpError).kind).toBe("tableNotFound");
    expect(round(new TargetChangedError())).toBeInstanceOf(TargetChangedError);
    expect(round(new RecordChangedError())).toBeInstanceOf(RecordChangedError);
    expect(round(new RecordUnreadableError("hỏng")).message).toBe("hỏng");
  });

  it("giữ mã lỗi Office để thông báo tiếng Việt không đổi", () => {
    const office = Object.assign(new Error("denied"), { name: "RichApi.Error", code: "AccessDenied" });
    const back = deserializeError(serializeError(office));
    expect(describeOfficeError(back)).toBe(describeOfficeError(office));
    expect(serializeError("chuỗi")).toEqual({ name: "Error", message: "chuỗi" });
  });
});

describe("RemoteClient ↔ handleDialogMessage", () => {
  it("gọi phương thức gateway thật, trả đúng kết quả và tham số", async () => {
    const workbook = { listSheets: vi.fn(async (a: number, b: string) => [{ name: `${b}${a}` }]) };
    const { client } = connect({ workbook });
    const remote = client.gateway<typeof workbook>("workbook");
    await expect(remote.listSheets(2, "S")).resolves.toEqual([{ name: "S2" }]);
    expect(workbook.listSheets).toHaveBeenCalledWith(2, "S");
  });

  it("phương thức trả undefined vẫn là undefined ở hộp thoại", async () => {
    const { client } = connect({ layout: { removeTerms: async () => undefined } });
    await expect(client.call("layout", "removeTerms", [])).resolves.toBeUndefined();
  });

  it("lỗi của gateway thật về tới hộp thoại với mã lỗi", async () => {
    const pricing = {
      goTo: async () => {
        throw Object.assign(new Error("x"), { code: "ItemNotFound" });
      },
    };
    const { client } = connect({ pricing });
    await expect(client.call("pricing", "goTo", [])).rejects.toMatchObject({ code: "ItemNotFound" });
  });

  it("từ chối gateway hoặc phương thức không có, và constructor", async () => {
    const { client } = connect({ workbook: { listSheets: async () => [] } });
    await expect(client.call("workbook", "nope", [])).rejects.toThrow("workbook.nope");
    await expect(client.call("workbook", "constructor", [])).rejects.toThrow("constructor");
    await expect(client.call("pricing", "goTo", [])).rejects.toThrow("pricing.goTo");
  });

  it("đối tượng đại diện không bị coi là Promise", async () => {
    const { client } = connect({});
    const remote = client.gateway<object>("workbook");
    expect((remote as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(remote)).resolves.toBe(remote);
  });

  it("báo vùng chọn thay đổi; hủy đăng ký thì thôi nhận", () => {
    const { client, push } = connect({});
    const handler = vi.fn();
    const off = client.onSelection(handler);
    push(JSON.stringify({ t: "selection" }));
    off();
    push(JSON.stringify({ t: "selection" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("chỉ mở đường dẫn https", () => {
    const opened: string[] = [];
    const { client } = connect({}, opened);
    client.openUrl("https://mail.google.com/x");
    client.openUrl("javascript:alert(1)");
    expect(opened).toEqual(["https://mail.google.com/x"]);
  });

  it("mất cầu nối: lời gọi bị từ chối sau thời hạn", async () => {
    vi.useFakeTimers();
    const client = new RemoteClient({ send: () => undefined, onMessage: () => undefined }, 1000);
    const call = client.call("workbook", "listSheets", []);
    vi.advanceTimersByTime(1000);
    await expect(call).rejects.toThrow(LOST_BRIDGE_MESSAGE);
  });
});

describe("URL hộp thoại", () => {
  const snapshot = {
    info: { host: "Excel", platform: "PC", version: "16.0" },
    sets: { "ExcelApi@1.8": true },
  };

  it("chuyển tiếp màn hình/phần từ task pane, URL ngắn", () => {
    const url = dialogUrl("?view=library&section=norms&_host_Info=x", "https://h");
    expect(url).toBe("https://h/taskpane.html?dialog=1&view=library&section=norms");
    expect(isDialogMode(new URL(url).search)).toBe(true);
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("môi trường hỏng hoặc thiếu → null", () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot("{xx")).toBeNull();
    expect(decodeSnapshot(encodeSnapshot({ ...snapshot, sets: undefined as never }))).toBeNull();
    expect(isDialogMode("?view=quote")).toBe(false);
  });
});
