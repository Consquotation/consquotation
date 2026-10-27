/**
 * Bảng diễn giải đơn giá từ định mức để xuất ra Excel (ADR-0013). Thuần TypeScript.
 *
 * Ghi vào một SHEET MỚI (không ghi đè dữ liệu có sẵn). Mỗi dòng thành phần có công thức Excel
 * (hao phí tính toán = F × (1 + G); thành tiền = H × I) để người dùng truy vết; phần tổng hợp có cả
 * công thức Excel và cột "Kết quả add-in" (giá trị do bộ máy tính) để đối chiếu.
 */

import { CellInput } from "../excel/matrix";
import { formatIsoDate } from "../library/dates";
import { Norm, RESOURCE_TYPES, ResourceType } from "../library/types";
import { RESOURCE_TYPE_TEXT } from "./composition";
import { NormCalcResult } from "./normCalc";
import { NORM_UI } from "../../shared/strings.norms.vi";

export const EXPLANATION_HEADERS = [
  "STT",
  "Loại",
  "Mã tài nguyên",
  "Tên tài nguyên",
  "Đơn vị",
  "Hao phí cơ sở",
  "Hao hụt",
  "Hao phí tính toán",
  "Đơn giá",
  "Thành tiền",
  "Nguồn giá",
  "Ghi chú kiểm tra",
] as const;

/** Định dạng số theo cột (chỉ đổi cách hiển thị). */
export const EXPLANATION_FORMATS: readonly string[] = [
  "General",
  "General",
  "General",
  "General",
  "General",
  "General",
  "0.00%",
  "General",
  "#,##0",
  "#,##0",
  "General",
  "General",
];

export const EXPLANATION_WIDTHS: readonly number[] = [
  30, 70, 75, 180, 50, 70, 55, 80, 85, 95, 150, 200,
];

/** Hàng (tính từ 0) của tiêu đề bảng thành phần. */
export const EXPLANATION_HEADER_ROW = 5;

export interface ExplanationSheet {
  /** Tên gợi ý cho sheet mới (add-in thêm (2), (3)… nếu trùng). */
  sheetName: string;
  /** Ma trận ghi bằng chế độ công thức, bắt đầu tại A1. */
  rows: CellInput[][];
  columnCount: number;
  headerRow: number;
  componentRows: number;
  /** Hàng đầu và số hàng của phần tổng hợp. */
  summaryRow: number;
  summaryRows: number;
}

function sourceText(norm: Norm): string {
  return norm.sourceType === "document"
    ? NORM_UI.sourceDocument(norm.source, norm.sourceVerified)
    : NORM_UI.sourceUser;
}

export function buildExplanationSheet(
  norm: Norm,
  result: NormCalcResult,
  today: string
): ExplanationSheet {
  const width = EXPLANATION_HEADERS.length;
  const blankRow = (): CellInput[] => Array.from({ length: width }, () => null);
  const line = (text: string): CellInput[] => {
    const row = blankRow();
    row[0] = text;
    return row;
  };
  const rows: CellInput[][] = [
    line("DIỄN GIẢI ĐƠN GIÁ TỪ ĐỊNH MỨC"),
    line(
      `Định mức ${norm.code} phiên bản ${norm.version}: ${norm.name}. Đơn vị công tác: ${norm.unit}.`
    ),
    line(
      `Trạng thái: ${NORM_UI.status[norm.status]}. Nguồn: ${sourceText(norm)}. ${norm.wasteIncluded ? "Hao phí đã gồm hao hụt." : ""}`.trim()
    ),
    line(
      `Giá theo hiệu lực ngày ${formatIsoDate(today)}. ${NORM_UI.result.formula} Không làm tròn. Dữ liệu do người dùng cung cấp; ConsQuotation không xác nhận tính pháp lý.`
    ),
    blankRow(),
    [...EXPLANATION_HEADERS],
  ];
  const first = EXPLANATION_HEADER_ROW + 2; // số hàng Excel (tính từ 1) của thành phần đầu tiên
  const issuesFor = (componentId: string) =>
    result.issues
      .filter((i) => i.componentId === componentId)
      .map((i) => i.message)
      .join(" ");
  result.components.forEach((c, i) => {
    const r = first + i;
    rows.push([
      i + 1,
      RESOURCE_TYPE_TEXT[c.type],
      c.resourceCode,
      c.resourceName,
      c.resourceUnit,
      c.baseConsumption,
      c.wasteApplied ? c.wasteRate : 0,
      `=F${r}*(1+G${r})`,
      c.unitPrice,
      c.unitPrice === null ? null : `=H${r}*I${r}`,
      c.priceSource,
      issuesFor(c.componentId) || null,
    ]);
  });
  const last = first + Math.max(result.components.length, 1) - 1;
  rows.push(blankRow());
  const summaryRow = rows.length;
  const summaryHeader = blankRow();
  summaryHeader[8] = "Tổng hợp";
  summaryHeader[9] = "Công thức Excel";
  summaryHeader[10] = "Kết quả add-in";
  rows.push(summaryHeader);
  const sumRow = (label: string, formula: string, value: number | null): CellInput[] => {
    const row = blankRow();
    row[8] = label;
    row[9] = formula;
    row[10] = value;
    return row;
  };
  const typeLabel: Record<ResourceType, string> = {
    material: NORM_UI.result.material,
    labor: NORM_UI.result.labor,
    machine: NORM_UI.result.machine,
    other: NORM_UI.result.other,
  };
  for (const type of RESOURCE_TYPES) {
    // SUMIF với tiêu chí là chữ cố định (không chứa * ? ~), cộng thành tiền cùng loại.
    rows.push(
      sumRow(
        typeLabel[type],
        `=SUMIF(B${first}:B${last},"${RESOURCE_TYPE_TEXT[type]}",J${first}:J${last})`,
        result.totalsByType[type]
      )
    );
  }
  rows.push(
    sumRow(
      `${NORM_UI.result.unitPrice(norm.unit)}${result.currency ? ` (${result.currency})` : ""}`,
      `=SUM(J${first}:J${last})`,
      result.unitPrice
    )
  );
  const warnings = result.issues.filter((i) => !i.componentId).map((i) => i.message);
  if (warnings.length > 0) {
    rows.push(blankRow());
    rows.push(line(`${NORM_UI.result.issuesTitle}: ${warnings.join(" ")}`));
  }
  return {
    sheetName: `Diễn giải ${norm.code} v${norm.version}`,
    rows,
    columnCount: width,
    headerRow: EXPLANATION_HEADER_ROW,
    componentRows: result.components.length,
    summaryRow,
    summaryRows: RESOURCE_TYPES.length + 2,
  };
}
