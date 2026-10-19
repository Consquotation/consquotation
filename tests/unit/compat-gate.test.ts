import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const gatePath = require.resolve("../../src/compat/compat-gate.js");
const gate = require(gatePath) as {
  isUnsupportedWebview: (userAgent: string) => boolean;
  MESSAGE_HTML: string;
};

// User agent tiêu biểu của từng webview.
const UA = {
  ie11Trident:
    "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; .NET4.0C; .NET4.0E; ms-office; MSOffice 16) like Gecko",
  edgeHtml:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041",
  webView2:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  macWkWebView:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("compat-gate: isUnsupportedWebview", () => {
  it("chặn Internet Explorer 11 (Trident) của Excel 2016/2019 volume", () => {
    expect(gate.isUnsupportedWebview(UA.ie11Trident)).toBe(true);
  });

  it("chặn Edge Legacy (EdgeHTML)", () => {
    expect(gate.isUnsupportedWebview(UA.edgeHtml)).toBe(true);
  });

  it.each([
    ["WebView2 (Edge Chromium)", UA.webView2],
    ["WKWebView trên Mac", UA.macWkWebView],
    ["Chrome (Excel trên web)", UA.chrome],
  ])("cho phép %s", (_name, ua) => {
    expect(gate.isUnsupportedWebview(ua)).toBe(false);
  });

  it("không lỗi khi user agent rỗng hoặc undefined", () => {
    expect(gate.isUnsupportedWebview("")).toBe(false);
    expect(gate.isUnsupportedWebview(undefined as unknown as string)).toBe(false);
  });

  it("thông báo tiếng Việt có hướng dẫn khắc phục", () => {
    expect(gate.MESSAGE_HTML).toContain("Phiên bản Excel chưa tương thích");
    expect(gate.MESSAGE_HTML).toContain("WebView2");
  });
});

describe("compat-gate: giữ cú pháp ES5", () => {
  const source = readFileSync(gatePath, "utf8")
    // Bỏ comment để không bắt nhầm từ khóa trong chú thích.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it.each([
    ["let", /\blet\s/],
    ["const", /\bconst\s/],
    ["arrow function", /=>/],
    ["template string", /`/],
    ["class", /\bclass\s/],
  ])("không dùng %s", (_name, pattern) => {
    expect(source).not.toMatch(pattern);
  });
});
