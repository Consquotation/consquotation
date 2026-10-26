// Kịch bản kiểm thử tích hợp lớp src/office/core/ trên Excel thật.
// Chạy bên trong task pane của bản phát triển (npm start) qua DevTools:
//   node tests/integration/run-in-taskpane.mjs tests/integration/excel-core.scenarios.js
// Đây là thân của một hàm async; giá trị trả về là kết quả từng tình huống.
//
// An toàn: chỉ tạo/sửa/xóa các sheet tên bắt đầu bằng "CQ IT " do chính kịch bản tạo, và dừng
// ngay nếu workbook đã có sheet như vậy (không đụng dữ liệu có sẵn). Nên chạy trong workbook
// tạm do npm start mở.

const core = window.__CQ_DEV_EXCEL_CORE__;
if (!core) {
  return { fatal: "Không thấy window.__CQ_DEV_EXCEL_CORE__ — cần bản phát triển (npm start) và task pane đã tải xong." };
}
const PREFIX = "CQ IT ";
const A = PREFIX + "A";
const B = PREFIX + "B";
const results = [];
const run = (fn) => Excel.run(fn);

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, error: `${error.name}: ${error.kind ?? error.code ?? ""} ${error.message}` });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectKind(kind, fn) {
  try {
    await fn();
  } catch (error) {
    if (error.kind === kind || error.code === kind) return error.message;
    throw new Error(`mong đợi ${kind}, nhận ${error.kind ?? error.code ?? error.name}: ${error.message}`);
  }
  throw new Error(`mong đợi lỗi ${kind} nhưng thao tác chạy được`);
}
const usedAddress = (sheet) => run((ctx) => core.usedRangeAddress(ctx, sheet));

// Không chạy nếu đã có sheet "CQ IT …" (có thể là dữ liệu của người dùng).
const before = await run((ctx) => core.listWorksheets(ctx));
if (before.some((s) => s.name.startsWith(PREFIX))) {
  return { fatal: `Workbook đã có sheet bắt đầu bằng "${PREFIX}". Dừng để không đụng dữ liệu có sẵn.` };
}

await check("Thông tin workbook và sheet hiện hành", () =>
  run(async (ctx) => {
    const info = await core.readWorkbookInfo(ctx);
    const active = await core.readActiveWorksheet(ctx);
    assert(info.sheetCount >= 1 && active.name === info.activeSheet, "sheet hiện hành không khớp");
    return { name: info.name, readOnly: info.readOnly, protected: info.structureProtected, active: active.name };
  })
);

await check("Tạo nhiều sheet; liệt kê đủ", () =>
  run(async (ctx) => {
    await core.createWorksheet(ctx, A);
    await core.createWorksheet(ctx, B);
    const sheets = await core.listWorksheets(ctx);
    assert(sheets.length === before.length + 2, "số sheet sai");
    assert(sheets.some((s) => s.name === A) && sheets.some((s) => s.name === B), "thiếu sheet mới");
    return sheets.length;
  })
);

await check("Sheet đích không tồn tại → sheetNotFound", () =>
  expectKind("sheetNotFound", () => run((ctx) => core.requireWorksheet(ctx, PREFIX + "không có")))
);

await check("Sheet đích đã tồn tại: error / reuse / suffix", () =>
  run(async (ctx) => {
    await expectKind("sheetExists", () => core.createWorksheet(ctx, "cq it a"));
    const reused = await core.createWorksheet(ctx, A, "reuse");
    assert(!reused.created && reused.name === A, "reuse sai");
    const suffixed = await core.createWorksheet(ctx, A, "suffix");
    assert(suffixed.created && suffixed.name === A + " (2)", "suffix sai: " + suffixed.name);
    return suffixed.name;
  })
);

await check("Tên sheet không hợp lệ → invalidName; đổi tên trùng → sheetExists; đổi tên hợp lệ", () =>
  run(async (ctx) => {
    await expectKind("invalidName", () => core.createWorksheet(ctx, PREFIX + "a/b"));
    await expectKind("invalidName", () => core.createWorksheet(ctx, "History"));
    await expectKind("sheetExists", () => core.renameWorksheet(ctx, A + " (2)", B.toLowerCase()));
    const renamed = await core.renameWorksheet(ctx, A + " (2)", PREFIX + "C");
    assert(renamed === PREFIX + "C", "đổi tên sai");
    return renamed;
  })
);

await check("Địa chỉ không hợp lệ → invalidAddress", () =>
  expectKind("invalidAddress", () =>
    run((ctx) => core.writeRange(ctx, { sheetName: A, address: "A:A" }, [[1]], { mode: "values" }))
  )
);

await check("Ma trận không khớp vùng → sizeMismatch, không ghi gì", async () => {
  await expectKind("sizeMismatch", () =>
    run((ctx) => core.writeRange(ctx, { sheetName: A, address: "A1:C2" }, [[1, 2], [3, 4]], { mode: "values" }))
  );
  assert((await usedAddress(A)) === null, "sheet không còn trống");
  return "sheet vẫn trống";
});

await check("Dữ liệu sai kiểu (Date, NaN) → invalidData, không ghi gì", async () => {
  await expectKind("invalidData", () =>
    run((ctx) => core.writeRange(ctx, { sheetName: A, address: "A1:B1" }, [[new Date(), 1]], { mode: "values" }))
  );
  await expectKind("invalidData", () =>
    run((ctx) => core.writeRange(ctx, { sheetName: A, address: "A1:B1" }, [[NaN, 1]], { mode: "values" }))
  );
  assert((await usedAddress(A)) === null, "sheet không còn trống");
  return "sheet vẫn trống";
});

const TEXTS = ["Đường ống Ốp lát ữ ặ ỹ", "007", "1/2", "10%", "TRUE", "=1+1", "& < > \" ' # @ [ ] ;"];
await check("Ghi values: tiếng Việt, ký tự đặc biệt, chữ dễ bị đổi kiểu, số 0, ô trống; đọc lại đúng", () =>
  run(async (ctx) => {
    const matrix = [TEXTS, [0, 1.5, -2, 1234567.891, true, null, ""]];
    const written = await core.writeRange(ctx, { sheetName: A, address: "A1:G2" }, matrix, { mode: "values" });
    const read = await core.readRange(ctx, { sheetName: A, address: "A1:G2" });
    TEXTS.forEach((t, c) => assert(read.values[0][c] === t, `ô ${c + 1} hàng 1: ${JSON.stringify(read.values[0][c])}`));
    assert(read.valueTypes[0].every((t) => t === "String"), "chữ bị đổi kiểu: " + read.valueTypes[0].join(","));
    const nums = read.values[1];
    assert(nums[0] === 0 && nums[1] === 1.5 && nums[2] === -2 && nums[3] === 1234567.891 && nums[4] === true, "số sai");
    assert(nums[5] === "" && nums[6] === "", "ô trống sai");
    assert(read.summary.emptyCells === 2 && read.summary.errorCount === 0, "tóm tắt sai");
    return { address: written.address, types: read.valueTypes[1].join(",") };
  })
);

await check("Vùng đã có dữ liệu: không vân tay → targetNotEmpty; vân tay cũ → targetChanged; vân tay đúng → ghi", async () => {
  const target = { sheetName: A, address: "A1:B1" };
  await expectKind("targetNotEmpty", () => run((ctx) => core.writeRange(ctx, target, [["x", "y"]], { mode: "values" })));
  const inspection = await run((ctx) => core.inspectRange(ctx, target));
  assert(inspection.occupied.count === 2, "đếm ô có dữ liệu sai");
  // Người dùng sửa ô sau khi kiểm tra.
  await run(async (ctx) => {
    ctx.workbook.worksheets.getItem(A).getRange("B1").values = [["người dùng sửa"]];
    await ctx.sync();
  });
  await expectKind("targetChanged", () =>
    run((ctx) => core.writeRange(ctx, target, [["x", "y"]], { mode: "values", expectedFingerprint: inspection.fingerprint }))
  );
  const unchanged = await run((ctx) => core.readRange(ctx, target));
  assert(unchanged.values[0][1] === "người dùng sửa", "dữ liệu người dùng bị ghi đè");
  const fresh = await run((ctx) => core.inspectRange(ctx, target));
  await run((ctx) => core.writeRange(ctx, target, [["x", "y"]], { mode: "values", expectedFingerprint: fresh.fingerprint }));
  const after = await run((ctx) => core.readRange(ctx, target));
  assert(after.values[0][0] === "x" && after.values[0][1] === "y", "không ghi được sau xác nhận");
  return "ok";
});

await check("Công thức hợp lệ được Excel tính; công thức lỗi được nhận diện; ô ngoài vùng không đổi", () =>
  run(async (ctx) => {
    await core.writeRange(
      ctx,
      { sheetName: B, address: "A1:A5" },
      [[2], [3], ["=SUM(A1:A2)"], ['=IF(A1="","",A1*A2)'], ["=A1/0"]],
      { mode: "formulas" }
    );
    const read = await core.readRange(ctx, { sheetName: B, address: "A1:B6" });
    assert(read.values[2][0] === 5 && read.formulas[2][0] === "=SUM(A1:A2)", "SUM sai");
    assert(read.values[3][0] === 6, "IF sai");
    assert(read.summary.errorCount === 1 && read.summary.errorCells[0].address === "A5", "không nhận ra ô lỗi");
    assert(read.values.every((row) => row[1] === "") && read.values[5][0] === "", "ghi ra ngoài vùng");
    return read.summary.errorCells;
  })
);

await check("Chế độ values không chạy công thức người dùng gõ", () =>
  run(async (ctx) => {
    await core.writeRange(ctx, { sheetName: B, address: "C1" }, [["=A1+A2"]], { mode: "values" });
    const read = await core.readRange(ctx, { sheetName: B, address: "C1" });
    assert(read.values[0][0] === "=A1+A2" && read.valueTypes[0][0] === "String", "chuỗi bị chạy như công thức");
    return "giữ là chữ";
  })
);

await check("Đọc vượt giới hạn → tooLarge trước khi tải dữ liệu", () =>
  expectKind("tooLarge", () => run((ctx) => core.readRange(ctx, { sheetName: A, address: "A1:Z5000" }, 1000)))
);

const T = "CQ_IT_Test";
await check("Tạo Table; tạo lại → tableExists; tên không có CQ_ → invalidName; chồng bảng → unavailable", () =>
  run(async (ctx) => {
    await core.writeRange(
      ctx,
      { sheetName: B, address: "E1:G4" },
      [["Mã", "Tên", "Tiền"], ["M1", "Một", 10], ["M2", "Hai", 0], ["M2", "Hai bis", null]],
      { mode: "values" }
    );
    const table = await core.createTable(ctx, { sheetName: B, address: "E1:G4", name: T });
    assert(table.headers.join("|") === "Mã|Tên|Tiền" && table.values.length === 3, "bảng sai");
    await expectKind("tableExists", () => core.createTable(ctx, { sheetName: B, address: "I1:J2", name: T.toLowerCase() }));
    await expectKind("invalidName", () => core.createTable(ctx, { sheetName: B, address: "I1:J2", name: "Bang_Thu" }));
    await expectKind("unavailable", () => core.createTable(ctx, { sheetName: B, address: "F2:H3", name: "CQ_IT_Overlap" }));
    return table.address;
  })
);

await check("Tiêu đề trùng hoặc trống → invalidData (không để Excel tự đổi tên)", () =>
  run(async (ctx) => {
    await core.writeRange(ctx, { sheetName: B, address: "I20:J21" }, [["Mã", "mã"], [1, 2]], { mode: "values" });
    await expectKind("invalidData", () => core.createTable(ctx, { sheetName: B, address: "I20:J21", name: "CQ_IT_Dup" }));
    return "chặn";
  })
);

await check("Thêm dòng; cập nhật dòng khớp duy nhất; khớp nhiều → ambiguousMatch; không khớp → noMatch", () =>
  run(async (ctx) => {
    const added = await core.addTableRows(ctx, T, [["M3", "Ba", 30]]);
    const updated = await core.updateTableRows(ctx, T, { column: "Mã", equals: "M1" }, { Tiền: 11, Tên: "Một (sửa)" });
    assert(updated === 1, "cập nhật sai số dòng");
    await expectKind("ambiguousMatch", () => core.updateTableRows(ctx, T, { column: "Mã", equals: "M2" }, { Tiền: 1 }));
    await expectKind("noMatch", () => core.updateTableRows(ctx, T, { column: "Mã", equals: "M9" }, { Tiền: 1 }));
    await expectKind("invalidData", () => core.updateTableRows(ctx, T, { column: "Không có", equals: "M1" }, { Tiền: 1 }));
    const table = await core.readTable(ctx, T);
    assert(table.values[0][1] === "Một (sửa)" && table.values[0][2] === 11, "giá trị cập nhật sai");
    assert(table.values[3][0] === "M3", "dòng thêm sai");
    return added.address;
  })
);

await check("Dữ liệu bên dưới bảng: thêm dòng bị chặn nếu chưa xác nhận; xác nhận thì Excel đẩy xuống", () =>
  run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getItem(B);
    sheet.getRange("F9").values = [["mốc dưới bảng"]];
    await ctx.sync();
    const message = await expectKind("targetNotEmpty", () => core.addTableRows(ctx, T, [["M4", "Bốn", 40]]));
    const before = await core.readTable(ctx, T);
    assert(before.values.length === 4, "đã ghi dù bị chặn");
    await core.addTableRows(ctx, T, [["M4", "Bốn", 40]], { allowShiftDown: true });
    const marker = sheet.getRange("F10");
    marker.load("values");
    await ctx.sync();
    assert(marker.values[0][0] === "mốc dưới bảng", "mốc không bị đẩy xuống như mong đợi");
    await core.deleteTableRows(ctx, T, { column: "Mã", equals: "M4" });
    sheet.getRange("F7:F12").clear("Contents");
    await ctx.sync();
    return message;
  })
);

await check("Xóa dòng theo tiêu chí khớp chính xác; khớp nhiều cần allowMultiple", () =>
  run(async (ctx) => {
    await expectKind("ambiguousMatch", () => core.deleteTableRows(ctx, T, { column: "Mã", equals: "M2" }));
    const deleted = await core.deleteTableRows(ctx, T, { column: "Mã", equals: "M2" }, { allowMultiple: true });
    const table = await core.readTable(ctx, T);
    assert(deleted === 2 && table.values.map((r) => r[0]).join(",") === "M1,M3", "xóa sai: " + table.values.map((r) => r[0]));
    return table.values.length;
  })
);

await check("Thêm cột: trùng tên → duplicateColumn; có dữ liệu bên phải → targetNotEmpty; hợp lệ → thêm", () =>
  run(async (ctx) => {
    await expectKind("duplicateColumn", () => core.addTableColumn(ctx, T, "tiền"));
    await core.addTableColumn(ctx, T, "Ghi chú", ["ghi chú 1", "=F3&\"!\""]);
    const table = await core.readTable(ctx, T);
    assert(table.headers.join("|") === "Mã|Tên|Tiền|Ghi chú", "tiêu đề sai: " + table.headers.join("|"));
    assert(table.values[1][3] === "Ba!", "công thức cột mới sai: " + table.values[1][3]);
    // Mốc ở xa bên phải (cột L), trong hàng của bảng: Excel sẽ đẩy nó sang phải nên phải chặn.
    const sheet = ctx.workbook.worksheets.getItem(B);
    sheet.getRange("L2").values = [["mốc bên phải"]];
    await ctx.sync();
    const message = await expectKind("targetNotEmpty", () => core.addTableColumn(ctx, T, "Cột 5"));
    const marker = sheet.getRange("L2:M2");
    marker.load("values");
    const after = await core.readTable(ctx, T);
    assert(marker.values[0][0] === "mốc bên phải" && after.headers.length === 4, "đã thêm cột hoặc dời mốc");
    sheet.getRange("L2").clear("Contents");
    await ctx.sync();
    return message;
  })
);

await check("Table rỗng: dòng đầu ghi vào dòng trống, không để lại dòng trống", () =>
  run(async (ctx) => {
    await core.writeRange(ctx, { sheetName: A, address: "A10:B11" }, [["Cột 1", "Cột 2"], [null, null]], { mode: "values" });
    const empty = await core.createTable(ctx, { sheetName: A, address: "A10:B11", name: "CQ_IT_Empty" });
    assert(empty.isEmpty && empty.values.length === 1, "bảng không rỗng");
    const result = await core.addTableRows(ctx, "CQ_IT_Empty", [["a", 1], ["b", 2]]);
    const table = await core.readTable(ctx, "CQ_IT_Empty");
    assert(result.filledBlankRow && table.values.length === 2 && table.values[0][0] === "a", "dòng trống còn lại");
    return result.address;
  })
);

await check("Bảng không phải của ConsQuotation chỉ được đọc → notOwned, dữ liệu không đổi", async () => {
  await run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getItem(A);
    sheet.getRange("D20:E21").values = [["K", "V"], ["k1", 1]];
    sheet.tables.add(`'${A}'!D20:E21`, true).name = "ITUserTable";
    await ctx.sync();
  });
  await expectKind("notOwned", () => run((ctx) => core.updateTableRows(ctx, "ITUserTable", { column: "K", equals: "k1" }, { V: 2 })));
  await expectKind("notOwned", () => run((ctx) => core.deleteTableRows(ctx, "ITUserTable", { column: "K", equals: "k1" })));
  await expectKind("notOwned", () => run((ctx) => core.addTableRows(ctx, "ITUserTable", [["k2", 2]])));
  const read = await run((ctx) => core.readTable(ctx, "ITUserTable"));
  assert(read.values.length === 1 && read.values[0][1] === 1, "bảng của người dùng bị sửa");
  return "đọc được, không sửa";
});

await check("Table không tồn tại → tableNotFound", () =>
  expectKind("tableNotFound", () => run((ctx) => core.readTable(ctx, "CQ_IT_Khong_Co")))
);

await check("Định dạng theo schema: số tiền đổi hiển thị, giá trị giữ nguyên; cố định tiêu đề; cột lạ không đổi", () =>
  run(async (ctx) => {
    const schema = {
      title: "IT",
      columns: [
        { key: "code", header: "Mã", kind: "code", required: false },
        { key: "name", header: "Tên", kind: "text", required: true },
        { key: "money", header: "Tiền", kind: "money", required: false },
      ],
    };
    await core.updateTableRows(ctx, T, { column: "Mã", equals: "M1" }, { Tiền: 1234567.891 });
    const result = await core.formatTableBySchema(ctx, T, schema);
    const body = ctx.workbook.tables.getItem(T).getDataBodyRange();
    body.load("values,numberFormat,text");
    const frozen = ctx.workbook.worksheets.getItem(B).freezePanes.getLocationOrNullObject();
    frozen.load("address");
    await ctx.sync();
    assert(body.numberFormat[0][2] === "#,##0", "định dạng tiền sai: " + body.numberFormat[0][2]);
    assert(body.values[0][2] === 1234567.891, "giá trị bị đổi: " + body.values[0][2]);
    assert(result.untouchedColumns.join() === "Ghi chú", "cột lạ: " + result.untouchedColumns);
    assert(!frozen.isNullObject, "chưa cố định hàng tiêu đề");
    return { text: body.text[0][2], frozen: frozen.address };
  })
);

await check("Tự điều chỉnh độ rộng có giới hạn", () =>
  run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getItem(A);
    sheet.getRange("H1").values = [["x".repeat(300)]];
    const range = sheet.getRange("H1");
    await core.autofitColumnsClamped(ctx, range, 1, 30, 120);
    range.format.load("columnWidth");
    await ctx.sync();
    assert(range.format.columnWidth <= 120.5, "vượt giới hạn: " + range.format.columnWidth);
    return range.format.columnWidth;
  })
);

await check("Sheet bị bảo vệ: kiểm tra trước → protected; Excel từ chối → AccessDenied (lỗi Office giữ nguyên mã)", async () => {
  await run(async (ctx) => {
    ctx.workbook.worksheets.getItem(B).protection.protect();
    await ctx.sync();
  });
  try {
    await expectKind("protected", () =>
      run((ctx) => core.writeRange(ctx, { sheetName: B, address: "K1" }, [[1]], { mode: "values" }))
    );
    await expectKind("protected", () => run((ctx) => core.addTableRows(ctx, T, [["M9", "Chín", 9, ""]])));
    const code = await expectKind("AccessDenied", () =>
      run(async (ctx) => {
        ctx.workbook.worksheets.getItem(B).getRange("K1").values = [[1]];
        await ctx.sync();
      })
    );
    return code;
  } finally {
    await run(async (ctx) => {
      ctx.workbook.worksheets.getItem(B).protection.unprotect();
      await ctx.sync();
    });
  }
});

await check("Xóa nội dung cần vân tay đúng; giữ định dạng", () =>
  run(async (ctx) => {
    const target = { sheetName: A, address: "A1:G2" };
    await expectKind("targetChanged", () => core.clearRangeContents(ctx, target, "sai"));
    const inspection = await core.inspectRange(ctx, target);
    await core.clearRangeContents(ctx, target, inspection.fingerprint);
    const read = await core.readRange(ctx, target);
    assert(read.summary.emptyCells === 14, "chưa xóa hết");
    return "đã xóa";
  })
);

// Dọn: xóa đúng các sheet kịch bản đã tạo.
await run(async (ctx) => {
  const sheets = ctx.workbook.worksheets;
  sheets.load("items/name");
  await ctx.sync();
  sheets.items.filter((s) => s.name.startsWith(PREFIX)).forEach((s) => s.delete());
  await ctx.sync();
});
const after = await run((ctx) => core.listWorksheets(ctx));

return {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  cleanedUp: after.length === before.length,
  results,
};
