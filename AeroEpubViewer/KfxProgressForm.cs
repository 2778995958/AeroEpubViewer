using System;
using System.Drawing;
using System.Runtime.ExceptionServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AeroEpubViewer
{
    /// <summary>KFX 轉換時的置中進度卡片：百分比、進度條與取消鈕。</summary>
    public class KfxProgressForm : Form
    {
        readonly Label titleLabel = new Label();
        readonly Label percentLabel = new Label();
        readonly ProgressBar progressBar = new ProgressBar();
        readonly Button cancelButton = new Button();
        readonly CancellationTokenSource cts = new CancellationTokenSource();
        bool finished;

        public CancellationToken Token
        {
            get { return cts.Token; }
        }

        public KfxProgressForm(Form owner)
        {
            Text = "KFX 轉換";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = owner != null ? FormStartPosition.CenterParent : FormStartPosition.CenterScreen;
            ShowInTaskbar = owner == null;
            TopMost = owner == null;
            MinimizeBox = false;
            MaximizeBox = false;
            ControlBox = false;
            ClientSize = new Size(380, 172);
            BackColor = SystemColors.Window;
            Font = SystemFonts.MessageBoxFont;

            titleLabel.Text = "正在轉換 KFX…";
            titleLabel.Location = new Point(20, 18);
            titleLabel.Size = new Size(340, 24);
            titleLabel.Font = new Font(Font.FontFamily, 10.5f, FontStyle.Bold);
            titleLabel.TextAlign = ContentAlignment.MiddleLeft;

            percentLabel.Text = "處理中…";
            percentLabel.Location = new Point(20, 48);
            percentLabel.Size = new Size(340, 34);
            percentLabel.Font = new Font(Font.FontFamily, 18f, FontStyle.Bold);
            percentLabel.TextAlign = ContentAlignment.MiddleCenter;

            progressBar.Location = new Point(20, 92);
            progressBar.Size = new Size(340, 18);
            progressBar.Minimum = 0;
            progressBar.Maximum = 100;
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;

            cancelButton.Text = "取消";
            cancelButton.Location = new Point(285, 126);
            cancelButton.Size = new Size(75, 28);
            cancelButton.Click += CancelClick;

            Controls.Add(titleLabel);
            Controls.Add(percentLabel);
            Controls.Add(progressBar);
            Controls.Add(cancelButton);
        }

        /// <summary>
        /// 顯示卡片、執行 work，直到完成或取消。
        /// 啟動時（尚無訊息迴圈）也能用：以 DoEvents 維持卡片可操作。
        /// </summary>
        public string Run(Func<Action<int?>, CancellationToken, string> work)
        {
            string result = null;
            Exception error = null;

            Task task = Task.Run(delegate
            {
                try { result = work(Report, cts.Token); }
                catch (Exception e) { error = e; }
            });

            Show();
            Application.DoEvents();

            while (!task.IsCompleted)
            {
                Application.DoEvents();
                Thread.Sleep(15);
            }
            task.Wait();

            Finish();
            if (!IsDisposed) Hide();

            if (error != null) ExceptionDispatchInfo.Capture(error).Throw();
            return result;
        }

        /// <summary>背景執行緒回報進度；null 代表總量未知。</summary>
        public void Report(int? percent)
        {
            if (finished || IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke((Action)delegate { Apply(percent); });
            }
            catch (Exception) { }
        }

        /// <summary>轉換結束（成功或失敗）後關閉卡片前呼叫，避免 Close 觸發取消。</summary>
        public void Finish()
        {
            finished = true;
        }

        void Apply(int? percent)
        {
            if (finished || IsDisposed) return;

            if (percent.HasValue)
            {
                if (progressBar.Style != ProgressBarStyle.Continuous)
                    progressBar.Style = ProgressBarStyle.Continuous;

                int value = percent.Value;
                if (value < 0) value = 0;
                if (value > 100) value = 100;
                progressBar.Value = value;
                percentLabel.Text = value + "%";
            }
            else
            {
                if (progressBar.Style != ProgressBarStyle.Marquee)
                    progressBar.Style = ProgressBarStyle.Marquee;
                progressBar.MarqueeAnimationSpeed = 30;
                percentLabel.Text = "處理中…";
            }
        }

        void CancelClick(object sender, EventArgs e)
        {
            if (finished) return;
            cancelButton.Enabled = false;
            cancelButton.Text = "正在取消…";
            titleLabel.Text = "正在取消 KFX 轉換…";
            try { cts.Cancel(); }
            catch (Exception) { }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!finished)
            {
                try { cts.Cancel(); }
                catch (Exception) { }
            }
            base.OnFormClosing(e);
        }

        protected override void Dispose(bool disposing)
        {
            // 還沒完成就被丟棄（例如主視窗關閉）時，順便中止子行程。
            if (disposing && !finished)
            {
                try { cts.Cancel(); }
                catch (Exception) { }
            }
            base.Dispose(disposing);
        }
    }
}
