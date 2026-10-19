/*
 * Kiểm tra webview trước khi tải bundle chính (ADR-0001, ADR-0006).
 *
 * File này được chép nguyên trạng (không qua Babel/TypeScript) và PHẢI giữ cú pháp ES5:
 * không dùng let/const, arrow function, template string, class...
 * Excel 2016/2019 bản volume chạy add-in trong Internet Explorer 11 (Trident); bundle React
 * không chạy ở đó, nên file này hiện thông báo tiếng Việt thay vì để task pane trắng.
 */
/* global module, window */
(function (root) {
  "use strict";

  function isUnsupportedWebview(userAgent) {
    var ua = String(userAgent || "");
    // Trident = Internet Explorer 11; "Edge/<số>" = Edge cũ (EdgeHTML). Edge Chromium dùng "Edg/".
    return /Trident\//.test(ua) || /MSIE /.test(ua) || /\sEdge\/\d/.test(ua);
  }

  var MESSAGE_HTML =
    '<div role="alert" style="font-family:Segoe UI,Arial,sans-serif;padding:16px;line-height:1.5;color:#242424">' +
    '<h1 style="font-size:18px;margin:0 0 8px">Phiên bản Excel chưa tương thích</h1>' +
    "<p>ConsQuotation cần Excel dùng trình duyệt nhúng Microsoft Edge (WebView2). " +
    "Excel hiện tại đang dùng trình duyệt nhúng cũ (Internet Explorer hoặc Edge Legacy), " +
    "thường gặp ở Excel 2016/2019 bản cấp phép số lượng lớn (volume).</p>" +
    "<p>Cách khắc phục:</p><ul>" +
    "<li>Cập nhật Office lên Microsoft 365 hoặc Office 2021 trở lên; hoặc</li>" +
    "<li>Với Excel bản bán lẻ (retail) 2016/2019: cập nhật Office và cài Microsoft Edge WebView2 Runtime; hoặc</li>" +
    "<li>Dùng Excel trên web.</li></ul>" +
    "<p>Add-in không thay đổi dữ liệu trong workbook của bạn.</p></div>";

  function showUnsupportedMessage(doc) {
    var container = doc.getElementById("container");
    if (container) {
      container.innerHTML = MESSAGE_HTML;
    }
  }

  var api = {
    isUnsupportedWebview: isUnsupportedWebview,
    MESSAGE_HTML: MESSAGE_HTML,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  if (root && root.navigator && isUnsupportedWebview(root.navigator.userAgent)) {
    root.__CQ_UNSUPPORTED_WEBVIEW__ = true;
    var doc = root.document;
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () {
        showUnsupportedMessage(doc);
      });
    } else {
      showUnsupportedMessage(doc);
    }
  }
})(typeof window !== "undefined" ? window : undefined);
