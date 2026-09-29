using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using CefSharp;
using CefSharp.WinForms;
using CefSharp.Web;
using CefSharp.Handler;
using AeroEpub;
namespace AeroEpubViewer
{
    public class EpubViewer : Form
    {
        public static ChromiumWebBrowser chromium;
        public static EpubViewer instance;
        public static int bookGen = 0;
        static bool opening;

        public EpubViewer()
        {
            instance = this;
            InitializeComponent();
            this.Text = string.Format("AeroEpubViewer - {0}", Program.epub.title);
            this.BackColor = ThemeColor();
            chromium = new ChromiumWebBrowser("aeroepub://domain/viewer/viewer.html");
            chromium.BrowserSettings.WebSecurity = CefState.Disabled;
            chromium.BrowserSettings.BackgroundColor = ThemeBackgroundColor();
            Controls.Add(chromium);
            chromium.Dock = DockStyle.Fill;
            chromium.Bounds = new Rectangle(0, 0, ClientSize.Width, ClientSize.Height);
            PerformLayout();
            chromium.IsBrowserInitializedChanged += OnLoad;
            chromium.LoadingStateChanged += SendDataWhenLoad;

            {
                string[] temp;
                if (UserSettings.fontFamilySettings.TryGetValue(Util.TrimLanguageCode(Program.epub.language), out temp))
                {
                    chromium.BrowserSettings.SerifFontFamily = temp[1];
                    chromium.BrowserSettings.SansSerifFontFamily = temp[2];
                }
            }

            ResizeEnd += (e, arg) =>
            {
                if (Size.Equals(ResizeManage.lastSize)) return;
                chromium.Reload(true); chromium.LoadingStateChanged += SendDataWhenLoad;
                ResizeManage.lastSize = Size;
            };
            Resize += (e, arg) =>
            {
                if (WindowState == FormWindowState.Maximized)
                {
                    chromium.Reload(true); chromium.LoadingStateChanged += SendDataWhenLoad;
                    ResizeManage.lastSize = Size;
                }
            };
        }
        static Color ThemeColor()
        {
            switch (UserSettings.theme)
            {
                case "dark": return Color.Black;
                case "warm":
                    string hex = UserSettings.warmColor;
                    if (!string.IsNullOrEmpty(hex) && hex[0] == '#') hex = hex.Substring(1);
                    int n;
                    if (int.TryParse(hex, System.Globalization.NumberStyles.HexNumber, System.Globalization.CultureInfo.InvariantCulture, out n) && hex.Length == 6)
                        return Color.FromArgb(255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
                    return Color.FromArgb(255, 0xff, 0xe6, 0xa0);
                default: return Color.White;
            }
        }
        static uint ThemeBackgroundColor()
        {
            Color c = ThemeColor();
            return Cef.ColorSetARGB(255, c.R, c.G, c.B);
        }
        private void OnLoad(Object sender, EventArgs e)
        {
            //chromium.ShowDevTools();

            refreshForm = new RefreshForm(() =>
            {
                Activate();
                Focus();
            });
            Invoke(refreshForm);
        }
        public delegate void RefreshForm();
        public RefreshForm refreshForm;


        public static void SendDataWhenLoad(Object sender, LoadingStateChangedEventArgs e)
        {
#if !DEBUG
            try
            {
#endif
            if (e.IsLoading == true) return;
            chromium.ExecuteScriptAsync("document.bookGen=" + bookGen + ";");
            if (Program.epub.IsRtl)
            {
                chromium.ExecuteScriptAsync("direction = direction_rtl;");
            }
            chromium.ExecuteScriptAsync(Program.epub.IsFixedLayout()
                ? "document.bookFixedLayout=true;"
                : "document.bookFixedLayout=false;");
            chromium.ExecuteScriptAsync(Program.epub.ShouldDualPage()
                ? "dualPage=true;document.dualPage=true;"
                : "dualPage=false;document.dualPage=false;");
            chromium.ExecuteScriptAsync(UserSettings.paged
                ? "paged=true;document.paged=true;"
                : "paged=false;document.paged=false;");
            string userDataCmd = string.Format("LoadUserSettings({0});", UserSettings.GetJson());
            string initCmd = "";
            string spreadDataCmd = "";
            string lengthDataCmd = "";
            foreach (Itemref i in Program.epub.spine)
            {
                if (!i.linear) continue;
                initCmd += string.Format(",'{0}'", "aeroepub://domain/book/" + i.ToString());
                int l;
                if (i.item.mediaType == "application/xhtml+xml")
                {
                    l = (i.item.GetFile() as TextEpubFileEntry).text.Length;
                }
                else if (i.item.mediaType.Contains("image")) { l = 10; }
                else
                {
                    throw new Exception(i.href + "\nCannot Handle type in spine: " + i.item.mediaType);
                }

                lengthDataCmd += "," + l;
                spreadDataCmd += "," + Util.ToJson(i.properties);
            }
            if (lengthDataCmd.Length == 0) throw new Exception("Spine is empty.");
            lengthDataCmd = $"LoadScrollBar([{ lengthDataCmd.Substring(1)}],{new TocManager().GetPlainStructJSON()});";
            initCmd = string.Format("Init([{0}],{1},{2},\"\",[{3}]);", initCmd.Substring(1), ResizeManage.index, ResizeManage.percent, spreadDataCmd.Substring(1));
            chromium.ExecuteScriptAsync(userDataCmd + lengthDataCmd + initCmd);

            if (Program.epub.toc != null)
            {
                switch (Program.epub.toc.mediaType)
                {
                    case "application/x-dtbncx+xml":
                        {
                            string toc = (Program.epub.toc.GetFile() as TextEpubFileEntry).text;
                            Match m = Regex.Match(toc, "<navMap>([\\s\\S]*?)</navMap>");
                            if (m.Success)
                            {
                                chromium.ExecuteScriptAsync("LoadTocNcx", m.Groups[1], Path.GetDirectoryName(Program.epub.toc.href));
                            }
                            else
                            {
                                Log.log("[Error]at TOC loading:" + Program.epub.toc);
                            }
                        }
                        break;
                    case "application/xhtml+xml":
                        {
                            string toc = (Program.epub.toc.GetFile() as TextEpubFileEntry).text;
                            toc = toc.Replace(" href=\"", " hraf=\"");
                            Match m = Regex.Match(toc, "<body[\\s\\S]*?>([\\s\\S]*?)</body>");
                            if (m.Success)
                            {
                                chromium.ExecuteScriptAsync("LoadTocNav", m.Groups[1], Path.GetDirectoryName(Program.epub.toc.href).Replace('\\', '/'));
                            }
                            else
                            {
                                Log.log("[Error]at TOC loading:" + Program.epub.toc);
                            }
                        }
                        break;

                }

            }
            chromium.LoadingStateChanged -= SendDataWhenLoad;
#if !DEBUG
            }
            catch (Exception exc)
            {
                MessageBox.Show(exc.ToString());
                Application.Exit();
            }
#endif
        }

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(EpubViewer));
            this.SuspendLayout();
            var size = new System.Drawing.Size(
                Screen.PrimaryScreen.WorkingArea.Width * 4 / 5,
                Screen.PrimaryScreen.WorkingArea.Height * 4 / 5);
            // 
            // EpubViewer
            // 
            this.ClientSize = size;
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.Name = "EpubViewer";
            this.ResumeLayout(false);
            ResizeManage.lastSize = Size;

        }

        public static void PromptOpenBook()
        {
            if (opening) return;
            opening = true;
            string path = null;
            try
            {
                var dlg = new OpenFileDialog();
                dlg.Multiselect = false;
                dlg.Title = "请选择书";
                dlg.Filter = Program.BookFilter;
                if (Program.epub != null && !string.IsNullOrEmpty(Program.epub.path))
                {
                    try { dlg.InitialDirectory = Path.GetDirectoryName(Program.epub.path); } catch (Exception) { }
                }
                if (dlg.ShowDialog() == DialogResult.OK) path = dlg.FileName;
            }
            catch (Exception)
            {
            }
            if (path == null) { opening = false; return; }
            OpenAnotherBook(path);
        }

        public static void OpenAnotherBook(string path)
        {
            var ui = chromium;
            var form = instance;
            if (ui == null || form == null || ui.IsDisposed || form.IsDisposed) { opening = false; return; }
            opening = true;
            ui.ExecuteScriptAsync("if(typeof ShowOpenMask==='function')ShowOpenMask();");
            Task.Run(() =>
            {
                try { return (object)Program.OpenEpubFile(path); }
                catch (Exception ex) { return ex; }
            }).ContinueWith(t =>
            {
                if (form.IsDisposed || ui.IsDisposed) { opening = false; return; }
                form.BeginInvoke((Action)(() =>
                {
                    try
                    {
                        var result = t.Exception != null ? (object)t.Exception.GetBaseException() : t.Result;
                        var err = result as Exception;
                        if (err != null)
                        {
                            ui.ExecuteScriptAsync("if(typeof HideOpenMask==='function')HideOpenMask();");
                            Program.ShowEpubError(path, err is EpubErrorException || err is IOException ? err.Message : err.ToString());
                            return;
                        }
                        var book = (EpubFile)result;
                        SearchService.Stop();
                        Program.epub = book;
                        bookGen++;
                        ResizeManage.index = "0";
                        ResizeManage.percent = 0;
                        AeroEpubSchemeHandlerFactory.ResetBookState();
                        HtmlHack.LoadUser();
                        try
                        {
                            TocManage.Parse();
                        }
                        catch (EpubErrorException e)
                        {
                            Program.ShowEpubError(path, e.Message);
                        }
                        catch (Exception e)
                        {
                            Program.ShowEpubError(path, e.ToString());
                        }
                        form.Text = string.Format("AeroEpubViewer - {0}", Program.epub.title);
                        form.BackColor = ThemeColor();
                        try { ui.BrowserSettings.BackgroundColor = ThemeBackgroundColor(); } catch (Exception) { }
                        ui.LoadingStateChanged -= SendDataWhenLoad;
                        ui.LoadingStateChanged += SendDataWhenLoad;
                        ui.Reload(true);
                    }
                    finally
                    {
                        opening = false;
                    }
                }));
            });
        }
    }


}