/**
 * Cấu trúc tham khảo của một dòng báo giá có tách đơn giá vật liệu / nhân công / máy thi công.
 *
 * Đây là khai báo cho lớp tích hợp Excel và khu vực Kiểm thử Excel, CHƯA phải mẫu báo giá chính
 * thức: mẫu đang dùng khi tạo bảng báo giá vẫn là QUOTE_COLUMNS trong domain/quoteTemplate.ts
 * (ADR-0009). Khi thống nhất mẫu có tách đơn giá, mẫu mới sẽ dựa trên schema này.
 * Không chứa công thức định mức hay cách tính đơn giá tổng hợp (thuộc giai đoạn tính giá).
 */

import { TableSchema } from "./tableSchema";

export type QuoteLineKey =
  | "stt"
  | "code"
  | "description"
  | "unit"
  | "quantity"
  | "materialPrice"
  | "laborPrice"
  | "machinePrice"
  | "unitPrice"
  | "amount"
  | "notes";

export const QUOTE_LINE_SCHEMA: TableSchema<QuoteLineKey> = {
  title: "Dòng báo giá (tham khảo)",
  columns: [
    { key: "stt", header: "STT", kind: "integer", required: false, computed: true },
    { key: "code", header: "Mã công tác", kind: "code", required: false },
    { key: "description", header: "Tên công tác", kind: "text", required: true },
    { key: "unit", header: "Đơn vị tính", kind: "text", required: false, width: 60 },
    { key: "quantity", header: "Khối lượng", kind: "quantity", required: false, min: 0 },
    { key: "materialPrice", header: "Đơn giá vật liệu", kind: "money", required: false, min: 0 },
    { key: "laborPrice", header: "Đơn giá nhân công", kind: "money", required: false, min: 0 },
    { key: "machinePrice", header: "Đơn giá máy thi công", kind: "money", required: false, min: 0 },
    { key: "unitPrice", header: "Đơn giá tổng hợp", kind: "money", required: false, min: 0 },
    { key: "amount", header: "Thành tiền", kind: "money", required: false, computed: true },
    { key: "notes", header: "Ghi chú", kind: "text", required: false, width: 150 },
  ],
};
