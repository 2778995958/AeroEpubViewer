using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using AeroEpub;
using SharpCompress.Archives;

namespace AeroEpubViewer
{
    class ImageArchive
    {
        class Page
        {
            public string name;
            public string ext;
            public byte[] data;
        }

        public static bool IsArchive(string path)
        {
            string ext = Path.GetExtension(path);
            if (ext == null) return false;
            switch (ext.ToLowerInvariant())
            {
                case ".zip":
                case ".cbz":
                case ".rar":
                case ".cbr":
                    return true;
            }
            return false;
        }

        public static EpubFile Open(string path)
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            var pages = new List<Page>();
            using (var archive = ArchiveFactory.Open(path))
            {
                foreach (var entry in archive.Entries)
                {
                    if (entry.IsDirectory || string.IsNullOrEmpty(entry.Key)) continue;
                    string name = entry.Key.Replace('\\', '/');
                    if (name.StartsWith("__MACOSX/", StringComparison.OrdinalIgnoreCase) || name.IndexOf("/__MACOSX/", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                    string file = Path.GetFileName(name);
                    if (file.Length == 0 || file[0] == '.') continue;
                    string ext = Path.GetExtension(file).ToLowerInvariant();
                    if (Mime(ext) == null) continue;
                    using (var stream = entry.OpenEntryStream())
                    using (var copy = new MemoryStream())
                    {
                        stream.CopyTo(copy);
                        pages.Add(new Page { name = name, ext = ext, data = copy.ToArray() });
                    }
                }
            }
            if (pages.Count == 0) throw new EpubErrorException(path + "\n壓縮檔裡沒有圖片。");
            pages.Sort((a, b) => CompareNatural(a.name, b.name));

            var book = new EpubFile();
            book.path = path;
            book.filename = Path.GetFileNameWithoutExtension(path);
            var opf = new StringBuilder();
            var spine = new StringBuilder();
            opf.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            opf.Append("<package version=\"3.0\" unique-identifier=\"id\" xmlns=\"http://www.idpf.org/2007/opf\">\n");
            opf.Append("<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n");
            opf.Append("<dc:identifier id=\"id\">image-archive</dc:identifier>\n");
            opf.Append("<dc:title>").Append(Xml(book.filename)).Append("</dc:title>\n");
            opf.Append("<dc:language>ja</dc:language>\n");
            opf.Append("</metadata>\n<manifest>\n");
            spine.Append("<spine page-progression-direction=\"rtl\">\n");
            for (int i = 0; i < pages.Count; i++)
            {
                string id = "p" + i.ToString("D5");
                string href = "img/" + id + pages[i].ext;
                book.entries.Add(new EpubFileEntry("OPS/" + href, pages[i].data));
                string spread = (i == 0) ? "page-spread-center" : ((i % 2 == 1) ? "page-spread-right" : "page-spread-left");
                opf.Append("<item id=\"").Append(id).Append("\" href=\"").Append(href).Append("\" media-type=\"").Append(Mime(pages[i].ext)).Append("\"/>\n");
                spine.Append("<itemref idref=\"").Append(id).Append("\" linear=\"yes\" properties=\"").Append(spread).Append("\"/>\n");
            }
            opf.Append("</manifest>\n");
            opf.Append(spine);
            opf.Append("</spine>\n</package>\n");
            book.entries.Add(new TextEpubFileEntry("META-INF/container.xml", "<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OPS/book.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>"));
            book.entries.Add(new TextEpubFileEntry("OPS/book.opf", opf.ToString()));
            return book;
        }

        static string Mime(string ext)
        {
            switch (ext)
            {
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".png": return "image/png";
                case ".gif": return "image/gif";
                case ".bmp": return "image/bmp";
                case ".webp": return "image/webp";
                case ".heic": return "image/heic";
            }
            return null;
        }

        static string Xml(string s)
        {
            return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
        }

        static int CompareNatural(string a, string b)
        {
            int i = 0, j = 0;
            while (i < a.Length && j < b.Length)
            {
                if (char.IsDigit(a[i]) && char.IsDigit(b[j]))
                {
                    int c = CompareDigits(a, ref i, b, ref j);
                    if (c != 0) return c;
                }
                else
                {
                    int c = char.ToUpperInvariant(a[i]).CompareTo(char.ToUpperInvariant(b[j]));
                    if (c != 0) return c;
                    i++;
                    j++;
                }
            }
            return a.Length.CompareTo(b.Length);
        }

        static int CompareDigits(string a, ref int i, string b, ref int j)
        {
            int a0 = i, b0 = j;
            while (i < a.Length && char.IsDigit(a[i])) i++;
            while (j < b.Length && char.IsDigit(b[j])) j++;
            int as_ = a0, bs = b0;
            while (as_ < i && a[as_] == '0') as_++;
            while (bs < j && b[bs] == '0') bs++;
            int la = i - as_, lb = j - bs;
            if (la != lb) return la.CompareTo(lb);
            for (int k = 0; k < la; k++)
            {
                int c = a[as_ + k].CompareTo(b[bs + k]);
                if (c != 0) return c;
            }
            return 0;
        }
    }
}
