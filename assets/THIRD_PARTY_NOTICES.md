# Ghi chú bên thứ ba — Icon

Các file `icon-16.png`, `icon-32.png`, `icon-64.png`, `icon-80.png`, `icon-128.png` và `icon-source.svg` được tạo từ biểu tượng **Calculator** (`calculator_16_filled`, `calculator_24_filled`) trong [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) (gói npm `@fluentui/svg-icons` 1.1.344).

Chỉnh sửa: tô màu `#0F6CBD`, thêm nền trắng dưới màn hình và phím, xuất PNG bằng `@resvg/resvg-js`. `icon-16.png` dựng từ bản 16 px; các kích thước khác dựng từ `icon-source.svg` (bản 24 px).

Icon lệnh Ribbon (từ bản 1.13.0) lấy từ bộ icon nhiều màu (`*_color.svg`) của Fluent UI System Icons 1.1.344, giữ màu gốc, nền trong suốt, xuất PNG 16/32/80 px bằng `@resvg/resvg-js` (mỗi kích thước dựng từ bản thiết kế nhỏ nhất không nhỏ hơn kích thước đích):

| File | Icon Fluent |
|---|---|
| `create-quote-*.png` | Document Add (`document_add`) |
| `quote-info-*.png` | Building (`building`) |
| `add-item-*.png` | Add Circle (`add_circle`) |
| `items-*.png` | Text Bullet List Square (`text_bullet_list_square`) |
| `pricing-*.png` | Coin Multiple (`coin_multiple`) |
| `print-*.png` | Document Text (`document_text`) |
| `library-*.png` | Library (`library`) |
| `resources-*.png` | Toolbox (`toolbox`) |
| `norms-*.png` | Clipboard Text Edit (`clipboard_text_edit`) |
| `library-manage-*.png` | Database (`database`) |
| `catalog-*.png` | Apps List (`apps_list`) |
| `library-check-*.png` | Checkmark Circle (`checkmark_circle`) |
| `exchange-*.png` | Arrow Sync (`arrow_sync`) |
| `settings-*.png` | Settings (`settings`) |
| `license-*.png` | Certificate (`certificate`) |
| `help-*.png` | Question Circle (`question_circle`) |

---

MIT License

Copyright (c) 2020 Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
