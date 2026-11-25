using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace AeroEpubViewer
{
    /// <summary>
    /// KFX 轉檔快取。位置固定為 exe 目錄下的 Cache\，與 KfxCacheEnabled 無關：
    /// 關閉快取時改用 Cache\ephemeral\，下次啟動整個資料夾刪除。
    /// </summary>
    internal static class KfxCache
    {
        static readonly object sweepLock = new object();
        static Task sweepTask;

        /// <summary>快取根目錄：<exe 目錄>\Cache。</summary>
        public static string Root
        {
            get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Cache"); }
        }

        /// <summary>這次執行要使用的目錄。關閉快取時為 <快取根>\ephemeral。</summary>
        public static string GetDirectory()
        {
            string root = Root;
            return UserSettings.kfxCacheEnabled ? root : Path.Combine(root, "ephemeral");
        }

        /// <summary>
        /// 快取鍵：來源路徑、大小、修改時間，加上轉換器（kfx2epub.exe／.dll）的大小與修改時間。
        /// 取 SHA-256 前 32 碼。
        /// </summary>
        public static string GetKey(string kfxPath)
        {
            FileInfo source = new FileInfo(kfxPath);
            long converterSize = 0;
            long converterTicks = 0;
            try
            {
                FileInfo exe = new FileInfo(KfxConverter.LocateExe());
                converterSize = exe.Length;
                converterTicks = exe.LastWriteTimeUtc.Ticks;

                // 轉換邏輯在 dll；只換 dll 時也必須讓快取失效。
                FileInfo dll = new FileInfo(Path.ChangeExtension(exe.FullName, ".dll"));
                if (dll.Exists)
                {
                    converterSize += dll.Length;
                    converterTicks = Math.Max(converterTicks, dll.LastWriteTimeUtc.Ticks);
                }
            }
            catch (Exception)
            {
                // 轉換器不存在時仍可算出鍵，真正的錯誤由 KfxConverter.Convert 回報。
            }

            string raw = source.FullName.ToLowerInvariant() + "|" + source.Length + "|" + source.LastWriteTimeUtc.Ticks + "|" + converterSize + "|" + converterTicks;
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
                StringBuilder sb = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString(0, 32);
            }
        }

        /// <summary>命中快取時更新時間，作為 LRU 依據。</summary>
        public static void Touch(string path)
        {
            try { File.SetLastWriteTimeUtc(path, DateTime.UtcNow); }
            catch (Exception) { }
        }

        /// <summary>啟動時在背景清理，失敗不影響開書。</summary>
        public static void StartSweep()
        {
            lock (sweepLock)
            {
                if (sweepTask == null)
                    sweepTask = Task.Run(delegate
                    {
                        try { Sweep(); }
                        catch (Exception) { }
                    });
            }
        }

        /// <summary>
        /// 等背景清理結束再動快取。避免啟動清理與第一次轉換同時操作 ephemeral\。
        /// </summary>
        public static void WaitForSweep()
        {
            Task task;
            lock (sweepLock) task = sweepTask;
            if (task == null) return;
            try { task.Wait(); }
            catch (Exception) { }
        }

        /// <summary>
        /// 清理規則：
        /// 1. 刪除 ephemeral\（上次關閉快取時留下的落地檔）。
        /// 2. 刪除超過 1 小時的 .part（中斷殘留）。
        /// 3. 刪除超過 KfxCacheDays 天未使用的項目。
        /// 4. 總量超過 KfxCacheMaxMB 時，由舊到新刪到上限以下。
        /// </summary>
        public static void Sweep()
        {
            string root = Root;
            if (!Directory.Exists(root)) return;

            try
            {
                string ephemeral = Path.Combine(root, "ephemeral");
                if (Directory.Exists(ephemeral)) Directory.Delete(ephemeral, true);
            }
            catch (Exception) { }

            DateTime now = DateTime.UtcNow;
            DateTime partLimit = now.AddHours(-1);
            DateTime ageLimit = now.AddDays(-Math.Max(1, UserSettings.kfxCacheDays));

            try
            {
                foreach (string file in Directory.GetFiles(root, "*.part"))
                {
                    try
                    {
                        if (File.GetLastWriteTimeUtc(file) < partLimit) File.Delete(file);
                    }
                    catch (Exception) { }
                }
            }
            catch (Exception) { }

            List<FileInfo> files = new List<FileInfo>();
            long total = 0;
            try
            {
                foreach (string file in Directory.GetFiles(root, "*.epub"))
                {
                    FileInfo info = new FileInfo(file);
                    total += info.Length;
                    files.Add(info);
                }
            }
            catch (Exception) { return; }

            foreach (FileInfo info in files.ToArray())
            {
                try
                {
                    if (info.LastWriteTimeUtc < ageLimit)
                    {
                        long length = info.Length;
                        info.Delete();
                        total -= length;
                        files.Remove(info);
                    }
                }
                catch (Exception) { }
            }

            long maxBytes = Math.Max(1, UserSettings.kfxCacheMaxMB) * 1024L * 1024L;
            if (total <= maxBytes) return;

            files.Sort(delegate (FileInfo a, FileInfo b) { return a.LastWriteTimeUtc.CompareTo(b.LastWriteTimeUtc); });
            foreach (FileInfo info in files)
            {
                if (total <= maxBytes) break;
                try
                {
                    long length = info.Length;
                    info.Delete();
                    total -= length;
                }
                catch (Exception) { }
            }
        }
    }
}
