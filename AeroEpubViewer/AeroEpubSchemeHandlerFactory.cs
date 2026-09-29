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
                        if (i == null)
                        {
                            Log.log("[book] GetItem returned null for: " + epubItemPath);
                        }
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
                        var subPath = uri.AbsolutePath.Substring("/viewer/".Length);
                        if (subPath == "spread-svg")
                        {
                            var qs = new Dictionary<string, string>();
                            string rawQuery = uri.Query.TrimStart('?');
                            foreach (var part in rawQuery.Split('&'))
                            {
                                if (part.Length == 0) continue;
                                int eq = part.IndexOf('=');
                                if (eq < 0) continue;
                                qs[part.Substring(0, eq)] = Uri.UnescapeDataString(part.Substring(eq + 1));
                            }
                            string Get(string key) { string v; return qs.TryGetValue(key, out v) ? v : ""; }

                            int li, ri;
                            if (!int.TryParse(Get("li"), out li) || !int.TryParse(Get("ri"), out ri))
                            {
                                Log.log("[spread-svg] Invalid indices: li=" + Get("li") + " ri=" + Get("ri"));
                                return ResourceHandler.FromString("<html><body>Invalid indices</body></html>", null, true, "text/html");
                            }

                            double lw = 0, lh = 0, rw = 0, rh = 0;
                            double.TryParse(Get("lw"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out lw);
                            double.TryParse(Get("lh"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out lh);
                            double.TryParse(Get("rw"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out rw);
                            double.TryParse(Get("rh"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out rh);

                            int linearCount = 0;
                            Itemref leftRef = null, rightRef = null;
                            foreach (Itemref r in Program.epub.spine)
                            {
                                if (!r.linear) continue;
                                if (linearCount == li) leftRef = r;
                                if (linearCount == ri) rightRef = r;
                                linearCount++;
                                if (leftRef != null && rightRef != null) break;
                            }

                            if (leftRef == null || rightRef == null)
                            {
                                Log.log("[spread-svg] Index out of range: li=" + li + " ri=" + ri + " linearCount=" + linearCount);
                                return ResourceHandler.FromString("<html><body>Index out of range</body></html>", null, true, "text/html");
                            }

                            string leftUrl = leftRef.href;
                            string rightUrl = rightRef.href;

                            // 從 XHTML 頁面提取圖片路徑，或直接使用圖片 item
                            string ExtractImagePath(string xhtmlPath)
                            {
                                Item item = Program.epub.GetItem(xhtmlPath);
                                if (item == null) return null;

                                // 如果 spine item 本身就是圖片，直接回傳
                                if (item.mediaType != null && item.mediaType.StartsWith("image"))
                                {
                                    return item.href;
                                }

                                // 否則從 XHTML 中提取圖片路徑
                                if (item.mediaType != "application/xhtml+xml") return null;
                                string content = (item.GetFile() as TextEpubFileEntry).text;

                                // 尋找 <image xlink:href="..." 或 href="..."
                                var hrefMatch = System.Text.RegularExpressions.Regex.Match(content, @"<image[^>]+(?:xlink:)?href=[""']([^""']+)[""']");
                                if (!hrefMatch.Success)
                                {
                                    // 嘗試匹配 <img src="..."
                                    hrefMatch = System.Text.RegularExpressions.Regex.Match(content, @"<img[^>]+src=[""']([^""']+)[""']");
                                    if (!hrefMatch.Success) return null;
                                }
                                string imgHref = hrefMatch.Groups[1].Value;
                                // 解析相對路徑：../image/xxx.jpg 相對於 item/xhtml/p-004.xhtml
                                // xhtmlPath = "item/xhtml/p-004.xhtml"
                                // imgHref = "../image/P000c.jpg"
                                // 結果應該是 "item/image/P000c.jpg"
                                int lastSlash = xhtmlPath.LastIndexOf('/');
                                if (lastSlash < 0) return imgHref; // 沒有目錄，直接回傳
                                string dir = xhtmlPath.Substring(0, lastSlash); // "item/xhtml"
                                // 處理每個 "../" - 每次回退一層目錄
                                while (imgHref.StartsWith("../"))
                                {
                                    imgHref = imgHref.Substring(3); // 去掉 "../"
                                    lastSlash = dir.LastIndexOf('/');
                                    if (lastSlash < 0)
                                    {
                                        dir = ""; // 已到根目錄
                                        break;
                                    }
                                    dir = dir.Substring(0, lastSlash); // 回退一層
                                }
                                // 組合最終路徑
                                if (dir.Length > 0)
                                    return dir + "/" + imgHref;
                                else
                                    return imgHref;
                            }

                            string leftImagePath = ExtractImagePath(leftUrl);
                            string rightImagePath = ExtractImagePath(rightUrl);

                            if (leftImagePath == null || rightImagePath == null)
                            {
                                Log.log("[spread-svg] Failed to extract image paths: left=" + leftUrl + " right=" + rightUrl);
                                return ResourceHandler.FromString("<html><body>Cannot extract image from XHTML</body></html>", null, true, "text/html");
                            }

                            string lHref = NormBookUrl(leftImagePath);
                            string rHref = NormBookUrl(rightImagePath);
                            bool rtl = Program.epub != null && Program.epub.spine.pageProgressionDirection == "rtl";
                            double totalW = lw + rw;
                            double totalH = Math.Max(lh, rh);
                            if (totalW <= 0) totalW = 1;
                            if (totalH <= 0) totalH = 1;

                            // 使用 Canvas 合成圖片以消除 SVG 的次像素縫隙
                            string canvasScript = @"
<canvas id='c' width='" + totalW.ToString(System.Globalization.CultureInfo.InvariantCulture) + @"' height='" + totalH.ToString(System.Globalization.CultureInfo.InvariantCulture) + @"' style='width:100%;height:100%;display:block;'></canvas>
<script>
(function(){
    var c = document.getElementById('c');
    var ctx = c.getContext('2d', {alpha: false});
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);

    var leftImg = new Image();
    var rightImg = new Image();
    var loaded = 0;

    function draw() {
        loaded++;
        if (loaded === 2) {
            ctx.drawImage(leftImg, 0, 0, " + lw.ToString(System.Globalization.CultureInfo.InvariantCulture) + @", " + lh.ToString(System.Globalization.CultureInfo.InvariantCulture) + @");
            ctx.drawImage(rightImg, " + lw.ToString(System.Globalization.CultureInfo.InvariantCulture) + @", 0, " + rw.ToString(System.Globalization.CultureInfo.InvariantCulture) + @", " + rh.ToString(System.Globalization.CultureInfo.InvariantCulture) + @");
        }
    }

    leftImg.onload = draw;
    rightImg.onload = draw;
    leftImg.src = '" + lHref + @"';
    rightImg.src = '" + rHref + @"';
})();
</script>";

                            string html = "<html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}</style></head><body>" + canvasScript + "<script src=\"aeroepub://domain/viewer/viewer-inject.js\"></script></body></html>";
                            Log.log("[spread-canvas] total=" + totalW + "x" + totalH + " rtl=" + rtl + " left=" + lHref + " right=" + rHref);
                            return ResourceHandler.FromString(html, null, true, "text/html");
                        }
                        var filename = subPath.Replace("/", ".");
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
                            case "CopyCanvasImage":
                                CopyCanvasImageToClipboard();
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

        // 只產生不含 query 的絕對網址；theme 與 cache-busting 參數統一由
        // viewer-inject.js 的 AppendThemeQuery 附加，避免重複加上 "?"。
        static string NormBookUrl(string path)
        {
            if (string.IsNullOrEmpty(path)) return "aeroepub://domain/book/";
            if (path.StartsWith("aeroepub://"))
            {
                int q = path.IndexOf('?');
                return q < 0 ? path : path.Substring(0, q);
            }
            if (path[0] == '/') path = path.Substring(1);
            return "aeroepub://domain/book/" + path;
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
                Log.log("[Error]CopyImage " + ex.ToString());
            }
        }

        static void CopyCanvasImageToClipboard()
        {
            try
            {
                var ui = EpubViewer.chromium;
                if (ui == null || ui.IsDisposed || !ui.IsHandleCreated)
                {
                    Log.log("[Error]CopyCanvasImage no UI");
                    return;
                }

                ui.BeginInvoke((Action)(async () =>
                {
                    try
                    {
                        // 從 JavaScript 端讀取暫存的 Canvas 資料
                        var result = await ui.EvaluateScriptAsync("window.__canvasImageData");
                        if (!result.Success || result.Result == null)
                        {
                            Log.log("[Error]CopyCanvasImage no data");
                            return;
                        }

                        string dataUrl = result.Result.ToString();

                        // 清除暫存
                        await ui.EvaluateScriptAsync("delete window.__canvasImageData");

                        // 解析 data:image/png;base64,xxxxx
                        if (!dataUrl.StartsWith("data:image/"))
                        {
                            Log.log("[Error]CopyCanvasImage invalid data URL");
                            return;
                        }

                        int commaIndex = dataUrl.IndexOf(',');
                        if (commaIndex < 0)
                        {
                            Log.log("[Error]CopyCanvasImage no comma in data URL");
                            return;
                        }

                        string base64Data = dataUrl.Substring(commaIndex + 1);
                        byte[] imageBytes = System.Convert.FromBase64String(base64Data);

                        var bmp = BitmapFrom(imageBytes);
                        if (bmp == null)
                        {
                            Log.log("[Error]CopyCanvasImage decode failed");
                            return;
                        }

                        try { System.Windows.Forms.Clipboard.SetImage(bmp); }
                        catch (Exception ex) { Log.log("[Error]CopyCanvasImage clipboard " + ex.Message); }
                        finally { bmp.Dispose(); }
                    }
                    catch (Exception ex)
                    {
                        Log.log("[Error]CopyCanvasImage " + ex.ToString());
                    }
                }));
            }
            catch (Exception ex)
            {
                Log.log("[Error]CopyCanvasImage " + ex.ToString());
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
