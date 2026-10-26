import { LibraryService } from "../../../application/libraryService";
import { LibrarySnapshot } from "../../../domain/library/types";

export type NewRefResult =
  | { ok: true; library: LibrarySnapshot; categoryId?: string; supplierId?: string }
  | { ok: false; field: "categoryId" | "supplierId"; message: string };

/**
 * Tạo nhóm/nhà cung cấp người dùng vừa gõ trong form (lựa chọn "+ … mới") trước khi lưu bản ghi.
 * Trả về thư viện đã có bản ghi mới để bước kiểm tra tham chiếu của bản ghi chính chạy đúng.
 * Tên trùng hoặc trống thì báo lỗi ở đúng ô, không tạo gì.
 */
export async function createNewRefs(
  service: LibraryService,
  library: LibrarySnapshot,
  names: { category?: string; supplier?: string }
): Promise<NewRefResult> {
  let current = library;
  const result: { categoryId?: string; supplierId?: string } = {};
  if (names.category !== undefined) {
    const saved = await service.saveCategory({ name: names.category, notes: "" }, null, current);
    if (!saved.ok) {
      return { ok: false, field: "categoryId", message: saved.errors[0].message };
    }
    current = { ...current, categories: [...current.categories, saved.value] };
    result.categoryId = saved.value.id;
  }
  if (names.supplier !== undefined) {
    const saved = await service.saveSupplier(
      { name: names.supplier, contactInfo: "", notes: "" },
      null,
      current
    );
    if (!saved.ok) {
      return { ok: false, field: "supplierId", message: saved.errors[0].message };
    }
    current = { ...current, suppliers: [...current.suppliers, saved.value] };
    result.supplierId = saved.value.id;
  }
  return { ok: true, library: current, ...result };
}
