using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;
using CefSharp;
using CefSharp.Web;
using CefSharp.WinForms;
using AeroEpub;
namespace AeroEpubViewer
{
    public static class Program
    {

        public static EpubFile epub;
        public static string cachePath = Path.GetTempPath() + "AEVCache";
        public static string BookFilter = "电子书与漫画|*.epub;*.zip;*.cbz;*.rar;*.cbr;*.kfx;*.kfx-zip;*.kfxzip|ePUB电子书(*.epub)|*.epub|Kindle KFX(*.kfx;*.kfx-zip;*.kfxzip)|*.kfx;*.kfx-zip;*.kfxzip|图片压缩档(*.zip;*.cbz;*.rar;*.cbr)|*.zip;*.cbz;*.rar;*.cbr";
        /// <summary>
        /// 应用程序的主入口点。
        /// </summary>
        [STAThread]
        static void Main(string[] args)
        {
#if !DEBUG
            try
            {
#endif
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // 快取設定必須在開書前載入；清理在背景執行，不影響啟動。
                try { UserSettings.ReadSettings(); }
                catch (Exception) { }
                KfxCache.StartSweep();

                if (args.Length > 0)
                    if (File.Exists(args[0]))
                    {
                        ReadBook(args[0]);
                    }
                    else { MessageBox.Show("文件不存在:" + args[0]); }
                else
                {
                    OpenFileDialog dialog = new OpenFileDialog();
                    dialog.Multiselect = false;
                    dialog.Title = "请选择书";
                    dialog.Filter = BookFilter;
                    if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                    {
                        ReadBook(dialog.FileName);
                    }
                }
                try
                {
                    Util.DeleteDir(cachePath);
                }
                catch (Exception) { }
#if !DEBUG
            }
            catch (Exception e)
            {
                MessageBox.Show(e.ToString());
            }
#endif
        }
        public static EpubFile OpenEpubFile(string bookPath)
        {
            return ImageArchive.IsArchive(bookPath) ? ImageArchive.Open(bookPath) : new EpubFile(bookPath);
        }

        /// <summary>必要時先把 KFX 轉成快取中的 EPUB，回傳實際要開啟的檔案路徑。</summary>
        public static string PrepareBook(string bookPath, Action<int?> progress, CancellationToken ct)
        {
            return KfxConverter.IsKfx(bookPath) ? KfxConverter.Convert(bookPath, progress, ct) : bookPath;
        }

        static void ReadBook(string bookPath)
        {
            string openPath = bookPath;
            if (KfxConverter.IsKfx(bookPath))
            {
                try
                {
                    using (var progress = new KfxProgressForm(null))
                    {
                        openPath = progress.Run(delegate (Action<int?> report, CancellationToken ct)
                        {
                            return KfxConverter.Convert(bookPath, report, ct);
                        });
                    }
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (EpubErrorException e)
                {
                    ShowEpubError(bookPath, e.Message);
                    return;
                }
                catch (Exception e)
                {
                    ShowEpubError(bookPath, e.ToString());
                    return;
                }
            }

            try
            {
                epub = OpenEpubFile(openPath);
            }
            catch (EpubErrorException e)
            {
                ShowEpubError(bookPath, e.Message);
                return;
            }
            catch (System.IO.IOException e)
            {
                ShowEpubError(bookPath, e.Message);
                return;
            }
            catch (Exception e)
            {
                ShowEpubError(bookPath, e.ToString());
                return;
            }
            if (openPath != bookPath)
            {
                // 資訊頁與下次開檔的預設目錄要指向原始 KFX，而不是快取目錄。
                epub.path = bookPath;
                epub.filename = Path.GetFileNameWithoutExtension(bookPath);
            }
            try
            {
                TocManage.Parse();
            }
            catch (EpubErrorException e)
            {
                ShowEpubError(bookPath, e.Message);
                if (e.Fatal) return;
            }
            catch (Exception e)
            {
                ShowEpubError(bookPath, e.ToString());
                return;
            }
            var settings = new CefSettings();
            if (epub.language != "")
                settings.Locale = Util.TrimLanguageCode(epub.language);

            settings.RegisterScheme(new CefCustomScheme
            {
                SchemeName = "aeroepub",
                SchemeHandlerFactory = new AeroEpubSchemeHandlerFactory()
            });
            settings.CachePath = cachePath;
            Cef.Initialize(settings);
            Cef.EnableHighDPISupport();
            Application.Run(new EpubViewer());
        }
        public static void ShowEpubError(string bookPath, string detail)
        {
            MessageBox.Show("讀取檔案時發生錯誤:\n" + bookPath + "\n\n" + detail);
        }
    }



}
