/**
 * Khu vực "Ghi chú và điều khoản" dưới bảng báo giá (prompts/02 thông tin tùy chọn, prompts/11).
 * Người dùng chọn mục nào cần và tự nhập nội dung — add-in KHÔNG soạn sẵn điều khoản nào.
 * Bố cục giống khối thông tin: nhãn ở cột đầu của bảng, nội dung ở cột "Nội dung công việc"
 * (cột rộng, xuống dòng). Vùng được đánh dấu bằng tên CQ_Terms_<n> để tìm lại sau khi dòng bị dời.
 */

import { asLiteralText } from "./workItemDraft";

export type TermsKey = "scope" | "assumptions" | "exclusions" | "commercial" | "notes";

export const TERMS_SECTIONS: readonly { key: TermsKey; label: string }[] = [
  { key: "scope", label: "Phạm vi công việc:" },
  { key: "assumptions", label: "Giả định:" },
  { key: "exclusions", label: "Phần loại trừ:" },
  { key: "commercial", label: "Điều khoản thương mại:" },
  { key: "notes", label: "Ghi chú:" },
];

export const TERMS_TITLE = "GHI CHÚ VÀ ĐIỀU KHOẢN";
/** Cột nội dung (tính từ cột đầu của bảng báo giá) = cột "Nội dung công việc". */
export const TERMS_TEXT_COLUMN_OFFSET = 3;
/** Giới hạn ký tự một ô Excel. */
export const TERMS_MAX_LENGTH = 32_000;

export interface TermsSection {
  key: TermsKey;
  text: string;
}

export function termsNameFor(quoteTableName: string): string {
  return quoteTableName.replace(/^CQ_Quote_/, "CQ_Terms_");
}

function labelOf(key: TermsKey): string {
  return TERMS_SECTIONS.find((s) => s.key === key)!.label;
}

/** Chuẩn hóa xuống dòng (Excel dùng \n trong ô). */
export function normalizeTermsText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function validateTerms(
  sections: readonly TermsSection[]
): { key: TermsKey; message: string }[] {
  return sections
    .filter((s) => normalizeTermsText(s.text).length > TERMS_MAX_LENGTH)
    .map((s) => ({ key: s.key, message: `Nội dung quá dài (tối đa ${TERMS_MAX_LENGTH} ký tự).` }));
}

/** Các mục có nội dung, theo thứ tự chuẩn. Mục để trống không được ghi. */
export function termsToWrite(sections: readonly TermsSection[]): TermsSection[] {
  return TERMS_SECTIONS.map((def) => sections.find((s) => s.key === def.key))
    .filter((s): s is TermsSection => s !== undefined && normalizeTermsText(s.text) !== "")
    .map((s) => ({ key: s.key, text: normalizeTermsText(s.text) }));
}

/**
 * Hai cột ghi vào sheet: cột nhãn (cột đầu bảng) và cột nội dung. Dòng đầu là tiêu đề khu vực.
 * Chữ có tiền tố ' để Excel không hiểu "=…", "10%", "1/2"… thành công thức/số/ngày.
 */
export function termsRows(sections: readonly TermsSection[]): { label: string; text: string }[] {
  return [
    { label: TERMS_TITLE, text: "" },
    ...termsToWrite(sections).map((s) => ({ label: labelOf(s.key), text: asLiteralText(s.text) })),
  ];
}

/** Đọc lại nội dung từ sheet (người dùng có thể đã sửa trực tiếp). Nhãn không khớp → bỏ qua. */
export function parseTermsBlock(
  labels: readonly unknown[],
  texts: readonly unknown[]
): TermsSection[] {
  const normalize = (v: unknown) =>
    String(v ?? "")
      .trim()
      .replace(/:$/, "")
      .toLocaleLowerCase("vi-VN");
  const result: TermsSection[] = [];
  labels.forEach((label, i) => {
    const def = TERMS_SECTIONS.find((s) => normalize(s.label) === normalize(label));
    if (def && !result.some((r) => r.key === def.key)) {
      result.push({ key: def.key, text: String(texts[i] ?? "") });
    }
  });
  return result;
}
