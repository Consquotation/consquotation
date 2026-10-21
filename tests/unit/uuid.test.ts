import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../../src/shared/uuid";

describe("randomId (prompts/14: Safari < 15.4 không có crypto.randomUUID)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("dùng crypto.randomUUID khi có", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-from-browser", getRandomValues: () => new Uint8Array(16) });
    expect(randomId()).toBe("uuid-from-browser");
  });

  it("dự phòng bằng getRandomValues: đúng dạng UUID v4, không trùng", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) });
    const ids = new Set(Array.from({ length: 200 }, () => randomId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
