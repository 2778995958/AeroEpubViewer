using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.IO;
using System.Web;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Resources;
using System.Reflection;
using CefSharp;
using CefSharp.WinForms;
using CefSharp.Web;
using CefSharp.Handler;
using AeroEpub;
namespace AeroEpubViewer
{
    public class AeroEpubSchemeHandlerFactory : ISchemeHandlerFactory
    {
        public const string SchemeName = "aeroepub";
        Assembly assembly = Assembly.GetExecutingAssembly();

        static string imagePageSizeAttribute;
        public static void ResetBookState()
        {
            imagePageSizeAttribute = null;
        }
        public IResourceHandler Create(IBrowser browser, IFrame frame, string schemeName, IRequest request)
        {
            var uri = new Uri(request.Url);
            Log.log(request.Url);
            var route = uri.AbsolutePath.Split('/')[1];
            switch (route)
            {
                case "book":
                    {
                        if (uri.Query.Contains("footnote"))
                        {
                            return ResourceHandler.FromString("");
                        }
                        var epubItemPath = uri.AbsolutePath.Substring("/book/".Length);
                        if (epubItemPath[0] == '/') epubItemPath = epubItemPath.Substring(1);
                        Item i = Program.epub.GetItem(epubItemPath);
                        if (i != null)
                        {
                            if (i.mediaType == "application/xhtml+xml")
                            {
                                string content = (i.GetFile() as TextEpubFileEntry).text;
                                content = HtmlHack.Hack(content);
                                return ResourceHandler.FromString(content, null, true, i.mediaType);
                            }
                            if (i.mediaType == "text/css")
                            {
                                //html里的其实也应该处理……
                                string content = (i.GetFile() as TextEpubFileEntry).text;
                                content = CssHack.Hack(content);
                                return ResourceHandler.FromString(content, null, true, i.mediaType);
                            }
                            if (i.mediaType.StartsWith("image"))
                            {
                                //Image warm color process
                                if (uri.Query.Contains("warm"))
                                {
                                    switch (i.mediaType)
                                    {
                                        case "image/heic":
                                        case "image/webp":
                                            byte[] imageData = i.GetFile().GetBytes();
                                            var decoded = ImageHack.TryDecode(imageData);
                                            if (decoded != null)
                                            {
                                                return ResourceHandler.FromByteArray(ImageHack.Warmer(decoded), "image/bmp");
                                            }
                                            else//local decoder not found 
                                            {
                                                return ResourceHandler.FromByteArray(imageData, i.mediaType);
                                            }
                                        default:
                                            return ResourceHandler.FromByteArray(ImageHack.Warmer(i.GetFile().GetBytes()), "image/bmp");
                                    }
                                }
                                //do not return image but  a html page 
                                if (uri.Query.Contains("page"))
                                {
                                    if (imagePageSizeAttribute == null)
                                    {
                                        if (Program.epub.spine.pageProgressionDirection == "rtl")
                                        { imagePageSizeAttribute = "height=\"100%\""; }
                                        else
                                        { imagePageSizeAttribute = "width=\"100%\""; }
                                    }
                                    string imageSrc = "aeroepub://domain" + uri.AbsolutePath + "?g=" + EpubViewer.bookGen;
                                    imageSrc = imageSrc.Replace("&", "&amp;").Replace("\"", "&quot;");
                                    return ResourceHandler.FromString("<html><head><link href=\"aeroepub://domain/viewer/viewer-inject.css\" rel=\"stylesheet\" type=\"text/css\"/></head><body><img " + imagePageSizeAttribute + " src=\"" + imageSrc + "\"/><script src=\"aeroepub://domain/viewer/viewer-inject.js\"></script></body></html>");
                                }
                                //normally return image data. Decode use system decoder for some format
                                switch (i.mediaType)
                                {
                                    case "image/heic":
                                        byte[] imageData = i.GetFile().GetBytes();
                                        var decoded = ImageHack.TryDecode(imageData);
                                        if (decoded != null)
                                        {
                                            return ResourceHandler.FromByteArray(decoded, "image/bmp");
                                        }
                                        else//local decoder not found 
                                        {
                                            return ResourceHandler.FromByteArray(imageData, i.mediaType);
                                        }
                                    default:
                                        return ResourceHandler.FromByteArray(i.GetFile().GetBytes(), i.mediaType);

                                }

                            }
                            return ResourceHandler.FromByteArray(i.GetFile().GetBytes(), i.mediaType);

                        }
                        else
                        {
                            Log.log("[Error]Cannot get " + uri);
                        }

                    }
                    break;
                case "viewer":
                    {
                        var filename = uri.AbsolutePath.Substring("/viewer/".Length).Replace("/", ".");
                        Stream fs = assembly.GetManifestResourceStream("AeroEpubViewer.Res." + filename);
                        string mime = Util.GetMimeType(filename);
                        if (mime != null)
                            return ResourceHandler.FromStream(fs, mime);
                        return ResourceHandler.FromStream(fs);
                    } //break;
                case "app":
                    {
                        string[] args = uri.AbsolutePath.Substring("/app/".Length).Split('/');
                        switch (args[0])
                        {
                            case "pos":
                                ResizeManage.SetPara(args);
                                return ResourceHandler.FromString("OK");
                            case "bookfontsize":
                                UserSettings.bookFontSize = int.Parse(args[1]);
                                UserSettings.WriteSettings();
                                EpubViewer.chromium.LoadingStateChanged += EpubViewer.SendDataWhenLoad;
                                EpubViewer.chromium.Reload(true);
                                return ResourceHandler.FromString("OK");
                            case "screentest":
                                CssHack.SetScreenTest(args);
                                return ResourceHandler.FromString("OK");
                            case "inspector":
                                EpubViewer.chromium.ShowDevTools();
                                return ResourceHandler.FromString("OK");
                            case "theme":
                                UserSettings.theme = args[1];
                                UserSettings.WriteSettings();
                                return ResourceHandler.FromString("OK");
                            case "lang":
                                {
                                    string code = args.Length > 1 ? args[1] : "ja";
                                    if (code != "ja" && code != "zh-TW" && code != "zh-CN" && code != "en") code = "ja";
                                    UserSettings.uiLanguage = code;
                                    UserSettings.WriteSettings();
                                    return ResourceHandler.FromString("OK");
                                }
                            case "paged":
                                {
                                    bool value;
                                    if (args.Length < 2 || !bool.TryParse(args[1], out value))
                                        return ResourceHandler.FromString("Invalid paged value");
                                    UserSettings.paged = value;
                                    UserSettings.WriteSettings();
                                    return ResourceHandler.FromString("OK");
                                }
                            case "ImageQuickView":
                                return ResourceHandler.FromString(SpecialPageService.ImageQuickView());
                            case "ImageAlbum":
                                return ResourceHandler.FromString(SpecialPageService.ImageAlbum());
                            case "BookInfo":
                                return ResourceHandler.FromString(SpecialPageService.BookInfo());
                            case "StartSearch":
                                {
                                    var t = uri.AbsolutePath.Substring("/app/".Length);
                                    int i = t.IndexOf('/');
                                    var word = Uri.UnescapeDataString(t.Substring(i + 1));
                                    SearchService.Start(word);
                                    Log.log(word);
                                    return ResourceHandler.FromString("OK");
                                }
                            case "CheckSearchResult":
                                return ResourceHandler.FromString(SearchService.GetResult(int.Parse(args[1])));
                            case "CopyImage":
                                CopyImageToClipboard(uri.AbsolutePath.Substring("/app/CopyImage/".Length));
                                return ResourceHandler.FromString("OK");
                            case "UserBookCss":
                                return ResourceHandler.FromString(UserSettings.userBookCssContent, null, true, "text/css");
                            case "UserBookCssRtl":
                                return ResourceHandler.FromString(UserSettings.userBookCssContent_rtl, null, true, "text/css");
                            case "UserBookCssLtr":
                                return ResourceHandler.FromString(UserSettings.userBookCssContent_ltr, null, true, "text/css");
                            case "External":
                                System.Diagnostics.Process.Start("explorer.exe", Uri.UnescapeDataString(args[1]));
                                return ResourceHandler.FromString("OK");
                            case "open":
                                {
                                    var ui = EpubViewer.chromium;
                                    if (ui != null && !ui.IsDisposed && ui.IsHandleCreated)
                                        ui.BeginInvoke((Action)EpubViewer.PromptOpenBook);
                                    return ResourceHandler.FromString("OK");
                                }
                            case "focus":
                                {
                                    var ui = EpubViewer.chromium;
                                    if (ui != null && !ui.IsDisposed && ui.IsHandleCreated)
                                        ui.BeginInvoke((Action)(() => { try { ui.Focus(); } catch (Exception) { } }));
                                    return ResourceHandler.FromString("OK");
                                }
                        }


                    }
                    break;


            }
            return null;
        }

        static void CopyImageToClipboard(string path)
        {
            try
            {
                int q = path.IndexOf('?');
                if (q >= 0) path = path.Substring(0, q);
                path = Uri.UnescapeDataString(path);
                AeroEpub.EpubFileEntry file;
                try { file = Program.epub.GetFile(path); }
                catch (AeroEpub.EpubErrorException)
                {
                    Log.log("[Error]CopyImage missing " + path);
                    return;
                }
                var bmp = BitmapFrom(file.GetBytes());
                if (bmp == null)
                {
                    Log.log("[Error]CopyImage decode " + path);
                    return;
                }
                var ui = EpubViewer.chromium;
                if (ui == null || ui.IsDisposed || !ui.IsHandleCreated)
                {
                    bmp.Dispose();
                    return;
                }
                ui.BeginInvoke((Action)(() =>
                {
                    try { System.Windows.Forms.Clipboard.SetImage(bmp); }
                    catch (Exception ex) { Log.log("[Error]CopyImage " + ex.Message); }
                    finally { bmp.Dispose(); }
                }));
            }
            catch (Exception ex)
            {
                Log.log("[Error]CopyImage " + ex);
            }
        }

        static System.Drawing.Bitmap BitmapFrom(byte[] data)
        {
            try
            {
                using (var stm = new MemoryStream(data, false))
                using (var img = System.Drawing.Image.FromStream(stm))
                    return new System.Drawing.Bitmap(img);
            }
            catch (Exception)
            {
                byte[] decoded = ImageHack.TryDecode(data);
                if (decoded == null) return null;
                using (var stm = new MemoryStream(decoded, false))
                using (var img = System.Drawing.Image.FromStream(stm))
                    return new System.Drawing.Bitmap(img);
            }
        }
    }
}
