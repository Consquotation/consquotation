using System.IO;
using System.Windows.Forms;

namespace ConsQuotation.Ui
{
    /// <summary>Hỏi xác nhận, báo lỗi, chọn file. Giao diện chỉ dùng interface này để test không phải bấm hộp thoại.</summary>
    public interface IPrompts
    {
        /// <summary>Hỏi xác nhận; extra là control phụ dưới nội dung (ví dụ ô chọn nơi chuyển bản ghi).</summary>
        bool Confirm(IWin32Window owner, string title, string body, string confirmLabel, string cancelLabel, Control? extra = null);
        void ShowError(IWin32Window owner, string text);
        void ShowInfo(IWin32Window owner, string text);
        /// <summary>Đường dẫn người dùng chọn để lưu, hoặc null nếu hủy.</summary>
        string? SaveFile(IWin32Window owner, string fileName, string filter, string initialDirectory);
        string? OpenFile(IWin32Window owner, string filter);
    }

    public sealed class DialogPrompts : IPrompts
    {
        public bool Confirm(IWin32Window owner, string title, string body, string confirmLabel, string cancelLabel, Control? extra = null)
        {
            using (var dialog = new ConfirmDialog(title, body, confirmLabel, cancelLabel, extra))
            {
                var ok = dialog.ShowDialog(owner) == DialogResult.OK;
                // Gỡ control phụ trước khi hủy hộp thoại để người gọi còn đọc được lựa chọn.
                extra?.Parent?.Controls.Remove(extra);
                return ok;
            }
        }

        public void ShowError(IWin32Window owner, string text) =>
            MessageBox.Show(owner, text, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);

        public void ShowInfo(IWin32Window owner, string text) =>
            MessageBox.Show(owner, text, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);

        public string? SaveFile(IWin32Window owner, string fileName, string filter, string initialDirectory)
        {
            using (var dialog = new SaveFileDialog { FileName = fileName, Filter = filter, OverwritePrompt = true })
            {
                if (Directory.Exists(initialDirectory))
                {
                    dialog.InitialDirectory = initialDirectory;
                }
                return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.FileName : null;
            }
        }

        public string? OpenFile(IWin32Window owner, string filter)
        {
            using (var dialog = new OpenFileDialog { Filter = filter, CheckFileExists = true })
            {
                return dialog.ShowDialog(owner) == DialogResult.OK ? dialog.FileName : null;
            }
        }
    }

    /// <summary>Hộp xác nhận có nút ghi rõ việc sẽ làm ("Xóa", "Nhập"), mặc định chọn nút hủy.</summary>
    public sealed class ConfirmDialog : Form
    {
        public ConfirmDialog(string title, string body, string confirmLabel, string cancelLabel, Control? extra = null)
        {
            Text = title;
            Font = Ux.Font;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterParent;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;

            var root = Ux.Stack(Ux.Px(420));
            root.Padding = new Padding(Ux.Px(12));
            root.Controls.Add(Ux.Text(body));
            if (extra != null)
            {
                root.Controls.Add(extra);
            }
            var confirm = Ux.Button(confirmLabel, (_, __) => DialogResult = DialogResult.OK);
            var cancel = Ux.Button(cancelLabel, (_, __) => DialogResult = DialogResult.Cancel);
            root.Controls.Add(Ux.ButtonRow(confirm, cancel));
            Controls.Add(root);
            CancelButton = cancel;
            ActiveControl = cancel;
        }
    }
}
