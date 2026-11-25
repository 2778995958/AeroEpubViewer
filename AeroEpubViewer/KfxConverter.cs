using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using AeroEpub;

namespace AeroEpubViewer
{
    /// <summary>
    /// 以子行程呼叫程式目錄下的 Kfx2Epub\kfx2epub.exe，把 KFX 轉成 EPUB。
    /// CLI 契約見 D:\git\kfx2epub\CLI_CONTRACT.md。
    /// </summary>
    internal static class KfxConverter
    {
        const int TimeoutMs = 180000;
        const int CapabilitiesTimeoutMs = 15000;

        static readonly Regex PercentRegex = new Regex("\"percent\"\\s*:\\s*(null|-?\\d+)", RegexOptions.Compiled);
        static bool? progressSupported;

        /// <summary>是否為本程式支援的 KFX 檔名。</summary>
        public static bool IsKfx(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".kfx":
                case ".kfx-zip":
                case ".kfxzip":
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>
        /// 轉換器位置。預設為 &lt;exe 目錄&gt;\Kfx2Epub\kfx2epub.exe；
        /// 可用 UserSettings\general.txt 的 Kfx2EpubPath 改成資料夾或直接指定 exe。
        /// </summary>
        public static string LocateExe()
        {
            string configured = (UserSettings.kfx2EpubPath ?? "").Trim().Trim('"');
            string exe;

            if (configured.Length == 0)
            {
                exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Kfx2Epub", "kfx2epub.exe");
            }
            else
            {
                try
                {
                    string path = Environment.ExpandEnvironmentVariables(configured);
                    if (!Path.IsPathRooted(path))
                        path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, path);
                    path = Path.GetFullPath(path);

                    // 允許指定資料夾，或直接指定 kfx2epub.exe。
                    bool looksLikeFile = path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || File.Exists(path);
                    exe = looksLikeFile ? path : Path.Combine(path, "kfx2epub.exe");
                }
                catch (Exception e)
                {
                    throw new EpubErrorException(
                        "Kfx2EpubPath 設定無效：\n" + configured + "\n\n" + e.Message);
                }
            }

            if (!File.Exists(exe))
                throw new EpubErrorException(
                    "找不到 KFX 轉換器：\n" + exe +
                    "\n\n請自行取得 kfx2epub（framework-dependent 版），" +
                    "將 kfx2epub.exe 與其相依檔案放到程式目錄下的 Kfx2Epub 資料夾，" +
                    "或修改 UserSettings\\general.txt 的 Kfx2EpubPath 指向正確位置。");
            return exe;
        }

        /// <summary>
        /// 取得快取中的 EPUB；沒有快取就啟動子行程轉換。
        /// onProgress 可能收到 null（總量未知，顯示不確定進度）。
        /// </summary>
        public static string Convert(string kfxPath, Action<int?> onProgress, CancellationToken ct)
        {
            if (ct.IsCancellationRequested)
                throw new OperationCanceledException(ct);
            if (!File.Exists(kfxPath))
                throw new EpubErrorException("文件不存在:\n" + kfxPath);
            kfxPath = Path.GetFullPath(kfxPath);   // 確保以絕對路徑傳給轉換器與快取鍵

            // 先確認轉換器存在，避免轉換器缺失時還建立空的 Cache 目錄。
            string exe = LocateExe();

            // 等啟動清理做完，避免和 ephemeral\ 的新轉換互相競爭。
            KfxCache.WaitForSweep();

            string cacheDir = KfxCache.GetDirectory();
            string target = Path.Combine(cacheDir, KfxCache.GetKey(kfxPath) + ".epub");
            if (UserSettings.kfxCacheEnabled && File.Exists(target))
            {
                KfxCache.Touch(target);
                return target;
            }

            // 先確認 CLI 能力，再建立目錄；轉換器版本過舊時不會留下空的 Cache。
            bool ndjson = SupportsProgress(exe, ct);

            try
            {
                Directory.CreateDirectory(cacheDir);
            }
            catch (Exception e)
            {
                throw new EpubErrorException("無法建立 KFX 快取目錄：\n" + cacheDir + "\n\n" + e.Message);
            }

            ProcessStartInfo psi = new ProcessStartInfo(exe)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                WorkingDirectory = Path.GetDirectoryName(exe),
            };

            // .NET Framework 沒有 ProcessStartInfo.ArgumentList，必須自行加引號。
            StringBuilder arguments = new StringBuilder();
            arguments.Append("convert ").Append(Quote(kfxPath));
            arguments.Append(" --out ").Append(Quote(target));
            arguments.Append(" --force --no-pause");
            arguments.Append(ndjson ? " --progress=ndjson" : " --json");
            psi.Arguments = arguments.ToString();

            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();

            using (Process process = new Process { StartInfo = psi })
            using (ct.Register(delegate { TryKill(process); }))
            {
                process.OutputDataReceived += delegate (object sender, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    stdout.AppendLine(e.Data);
                    if (ndjson && onProgress != null) ReportPercent(e.Data, onProgress);
                };
                process.ErrorDataReceived += delegate (object sender, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    lock (stderr) stderr.AppendLine(e.Data);
                };

                try
                {
                    process.Start();
                }
                catch (Exception e)
                {
                    throw new EpubErrorException("無法啟動 KFX 轉換器：\n" + exe + "\n\n" + e.Message);
                }

                // 關閉 stdin：即使轉換器想等待輸入也會立刻得到 EOF，不會卡住。
                try { process.StandardInput.Close(); }
                catch (Exception) { }

                // 兩個串流都要非同步讀，否則大書會因 pipe 緩衝區滿而卡死。
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                // 沒有進度事件時仍讓覆蓋層顯示「處理中…」。
                if (!ndjson && onProgress != null) onProgress(null);

                if (!process.WaitForExit(TimeoutMs))
                {
                    TryKill(process);
                    throw new EpubErrorException("KFX 轉換逾時（超過 " + (TimeoutMs / 1000) + " 秒）。");
                }
                process.WaitForExit();   // 確保非同步輸出事件已送完

                if (ct.IsCancellationRequested)
                    throw new OperationCanceledException(ct);

                if (process.ExitCode != 0)
                    throw BuildError(process.ExitCode, stdout.ToString(), stderr.ToString());
            }

            if (!File.Exists(target))
                throw new EpubErrorException("KFX 轉換沒有產生輸出檔：\n" + target);

            return target;
        }

        /// <summary>以 capabilities 判斷轉換器是否支援 --progress=ndjson（同一行程只問一次）。</summary>
        static bool SupportsProgress(string exe, CancellationToken ct)
        {
            if (progressSupported.HasValue) return progressSupported.Value;

            string stdout;
            string stderr;
            int code = RunCapture(exe, "capabilities --json --no-pause", CapabilitiesTimeoutMs, ct, out stdout, out stderr);
            ct.ThrowIfCancellationRequested();

            if (code != 0 || string.IsNullOrEmpty(stdout))
                throw new EpubErrorException(
                    "KFX 轉換器無法使用（capabilities 結束碼 " + code + "）。\n" +
                    "請更新 Kfx2Epub 的 CLI 版本（需支援 capabilities 子命令）。\n\n" +
                    (TrimForMessage(stderr) + "\n" + TrimForMessage(stdout)).Trim());

            progressSupported = Regex.IsMatch(stdout, "\"progress_ndjson\"\\s*:\\s*true");
            return progressSupported.Value;
        }

        static int RunCapture(string exe, string arguments, int timeoutMs, CancellationToken ct, out string stdout, out string stderr)
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe)
            {
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
                WorkingDirectory = Path.GetDirectoryName(exe),
            };

            using (Process process = new Process { StartInfo = psi })
            {
                process.Start();

                // 關閉 stdin，避免舊版轉換器停下來等 Enter。
                try { process.StandardInput.Close(); }
                catch (Exception) { }

                System.Threading.Tasks.Task<string> so = process.StandardOutput.ReadToEndAsync();
                System.Threading.Tasks.Task<string> se = process.StandardError.ReadToEndAsync();

                using (ct.Register(delegate { TryKill(process); }))
                {
                    if (!process.WaitForExit(timeoutMs))
                    {
                        TryKill(process);
                        stdout = "";
                        stderr = "";
                        return -1;
                    }
                    process.WaitForExit();
                }

                stdout = so.Result;
                stderr = se.Result;
                return process.ExitCode;
            }
        }

        static void ReportPercent(string line, Action<int?> report)
        {
            Match match = PercentRegex.Match(line);
            if (!match.Success) return;

            if (match.Groups[1].Value == "null")
            {
                report(null);
                return;
            }

            int value;
            if (!int.TryParse(match.Groups[1].Value, out value)) return;
            if (value < 0) value = 0;
            if (value > 100) value = 100;
            report(value);
        }

        static EpubErrorException BuildError(int code, string stdout, string stderr)
        {
            if (code == unchecked((int)0x80008096))
                return new EpubErrorException(
                    "開啟 KFX 需要 .NET Desktop Runtime 8.0 或更新版本。\n" +
                    "請到 https://dotnet.microsoft.com/download/dotnet 安裝後再試。");

            string detail = ExtractJsonString(stdout, "message");
            if (string.IsNullOrEmpty(detail)) detail = LastNonEmptyLine(stderr);
            if (string.IsNullOrEmpty(detail)) detail = LastNonEmptyLine(stdout);

            string reason;
            switch (code)
            {
                case 10: reason = "KFX 檔案無效或無法辨識。"; break;
                case 11: reason = "不支援的 KFX 格式或版本，請更新 Kfx2Epub。"; break;
                case 12: reason = "此書受 DRM 保護，無法轉換。"; break;
                case 13: reason = "KFX 檔案損壞。"; break;
                case 20: reason = "寫入快取檔案失敗（權限或磁碟空間不足）。"; break;
                case 40: reason = "KFX 轉換已取消。"; break;
                case 2: reason = "KFX 轉換器參數錯誤（閱讀器與轉換器版本可能不相符）。"; break;
                case 1: reason = "KFX 轉換器發生內部錯誤。"; break;
                default: reason = "KFX 轉換失敗（結束碼 " + code + "）。"; break;
            }

            if (!string.IsNullOrEmpty(detail) && detail.IndexOf(reason, StringComparison.Ordinal) < 0)
                return new EpubErrorException(reason + "\n\n" + detail);
            return new EpubErrorException(reason);
        }

        static string ExtractJsonString(string json, string name)
        {
            if (string.IsNullOrEmpty(json)) return null;
            Match match = Regex.Match(json, "\"" + name + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            if (!match.Success) return null;
            try { return Regex.Unescape(match.Groups[1].Value); }
            catch (Exception) { return match.Groups[1].Value; }
        }

        static string LastNonEmptyLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            string[] lines = text.Replace("\r", "").Split('\n');
            for (int i = lines.Length - 1; i >= 0; i--)
            {
                if (!string.IsNullOrEmpty(lines[i].Trim())) return lines[i].Trim();
            }
            return null;
        }

        static string TrimForMessage(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            text = text.Trim();
            if (text.Length > 800) text = text.Substring(0, 800) + "…";
            return text;
        }

        static void TryKill(Process process)
        {
            try
            {
                if (!process.HasExited) process.Kill();
            }
            catch (Exception) { }
        }

        /// <summary>Windows 命令列引號規則（支援空白、Unicode 與結尾反斜線）。</summary>
        static string Quote(string argument)
        {
            if (string.IsNullOrEmpty(argument)) return "\"\"";
            if (argument.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0) return argument;

            StringBuilder sb = new StringBuilder();
            sb.Append('"');
            int backslashes = 0;
            foreach (char c in argument)
            {
                if (c == '\\')
                {
                    backslashes++;
                    continue;
                }
                if (c == '"')
                {
                    sb.Append('\\', backslashes * 2 + 1);
                    sb.Append('"');
                    backslashes = 0;
                    continue;
                }
                sb.Append('\\', backslashes);
                backslashes = 0;
                sb.Append(c);
            }
            sb.Append('\\', backslashes * 2);
            sb.Append('"');
            return sb.ToString();
        }
    }
}
