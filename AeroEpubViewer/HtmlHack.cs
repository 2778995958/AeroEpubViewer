using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace AeroEpubViewer
{
    class HtmlHack
    {
        const string CssInjectTpl = "<link href=\"aeroepub://domain/viewer/viewer-inject.css?random={0}\" rel=\"stylesheet\" type=\"text/css\"/>";
        const string JsInjectTpl = "<script src=\"aeroepub://domain/viewer/viewer-inject.js?random={0}\"></script>";
        static string extraCss = "";
        static Regex regLink = new Regex("(<link +href=\".*?)(\".*?>)");
        static Regex regScript = new Regex("<script.*?/>");
        public static string Hack(string html)
        {
            int random = Util.RandomRange();
            html = regScript.Replace(html, "");
            html = regLink.Replace(html, "$1?r=" + random + "$2");
            string cssInject = string.Format(CssInjectTpl, random) + extraCss;
            string jsInject = string.Format(JsInjectTpl, random);
            html = html.Replace("</head>", cssInject + "\n</head>").Replace("</body>", jsInject + "\n</body>");
            return html;
        }
        public static void LoadUser()
        {
            extraCss = "";
            if (UserSettings.userBookCssContent != null) extraCss += "<link href=\"aeroepub://domain/app/UserBookCss\" rel=\"stylesheet\" type=\"text/css\"/>";
            if (Program.epub != null && Program.epub.spine.pageProgressionDirection == "rtl")
            {
                if (UserSettings.userBookCssContent_rtl != null) extraCss += "<link href=\"aeroepub://domain/app/UserBookCssRtl\" rel=\"stylesheet\" type=\"text/css\"/>";
            }
            else
            {
                if (UserSettings.userBookCssContent_ltr != null) extraCss += "<link href=\"aeroepub://domain/app/UserBookCssLtr\" rel=\"stylesheet\" type=\"text/css\"/>";
            }
        }
    }
}
