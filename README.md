# ConsQuotation — Excel Add-in Prompt Pack

Bộ prompt để phát triển **ConsQuotation dưới dạng Microsoft Excel Add-in**, không phải ứng dụng desktop độc lập. Excel vẫn là bảng tính chính; add-in bổ sung Ribbon, task pane và nghiệp vụ báo giá.

## Nguyên tắc cốt lõi
- Ưu tiên Office.js + TypeScript, sau khi xác minh nền tảng Excel mục tiêu và khả năng API.
- Mỗi người dùng tự tạo, quản lý, import/export và backup thư viện công tác, định mức, tài nguyên và đơn giá của mình.
- Không yêu cầu thư viện chung cài sẵn; không bịa định mức, đơn giá, thuế suất hoặc quy tắc thương mại.
- Tận dụng Excel native cho ô, công thức, worksheet, copy/paste, undo/redo, định dạng, in và lưu file; không xây dựng grid riêng thay Excel.
- Không ghi đè workbook hoặc gửi dữ liệu ra ngoài khi chưa được thông báo/xác nhận.

## Danh sách prompt
1. `01_MASTER_CONTEXT.md`
2. `02_PRODUCT_REQUIREMENTS.md`
3. `03_PLATFORM_ARCHITECTURE.md`
4. `04_ADDIN_SETUP_MANIFEST.md`
5. `05_RIBBON_TASKPANE_UX.md`
6. `06_WORKBOOK_INTEGRATION.md`
7. `07_QUOTATION_WORKFLOW.md`
8. `08_USER_OWNED_LIBRARY.md`
9. `09_LIBRARY_IMPORT_EXPORT.md`
10. `10_PRICING_FORMULA_ENGINE.md`
11. `11_TEMPLATE_PRINT_EXPORT.md`
12. `12_STORAGE_PRIVACY.md`
13. `13_VALIDATION_ERRORS.md`
14. `14_EXCEL_COMPATIBILITY.md`
15. `15_SECURITY_DEPLOYMENT.md`
16. `16_TESTING_ACCEPTANCE.md`
17. `17_PERFORMANCE_RELIABILITY.md`
18. `18_IMPLEMENTATION_ROADMAP.md`
19. `19_START_SESSION.md`
20. `20_ACCEPTANCE_CHECKLIST.md`
21. `21_README_GENERATION.md`

## Cách sử dụng
Đưa thư mục này vào `prompts/` trong repository. Đọc prompt 01–03 trước; triển khai theo roadmap. Xác minh các API và giới hạn Office.js từ tài liệu Microsoft hiện hành. Ghi rõ nền tảng đã test và chưa test.
