using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion.Controllers
{
    [ApiController]
    [Route("JMSFusion/lyrics")]
    public class LyricsController : ControllerBase
    {
        private readonly IUserManager _users;
        private static readonly HttpClient _http = new HttpClient();

        public LyricsController(IUserManager users)
        {
            _users = users;
        }
        private class JobState
        {
            public Guid UserId { get; set; }
            public bool Running { get; set; }
            public DateTimeOffset StartedAt { get; set; }
            public DateTimeOffset? FinishedAt { get; set; }
            public string CurrentStep { get; set; } = "";
            public double Progress01 { get; set; }
            public int Total { get; set; }
            public int Done { get; set; }
            public string LastMessage { get; set; } = "";
            public CancellationTokenSource? Cts { get; set; }
            public int OkSynced { get; set; }
            public int OkPlain  { get; set; }
            public int Fail     { get; set; }

            private readonly LinkedList<string> _log = new();
            private readonly object _lock = new();

            public void Log(string line)
            {
                lock (_lock)
                {
                    _log.AddLast($"[{DateTime.Now:HH:mm:ss}] {line}");
                    if (_log.Count > 500) _log.RemoveFirst();
                }
            }
            public string[] SnapshotLog()
            {
                lock (_lock) return _log.ToArray();
            }
        }

        private static readonly ConcurrentDictionary<Guid, JobState> _jobs = new();
        public class RunRequest
        {
            public string? mode { get; set; }
            public string? overwrite { get; set; }
        }

        private record JFItemsResponse(List<JFItem> Items, int TotalRecordCount);
        private record JFItem(
            string? Id,
            string? Name,
            string? AlbumArtist,
            List<string>? Artists,
            long? RunTimeTicks,
            string? Path
        );

        private record LrcLibHit(
            string? trackName,
            string? artistName,
            string? albumName,
            double? duration,
            string? plainLyrics,
            [property: JsonPropertyName("syncedLyrics")] string? syncedLyrics
        );

        [HttpGet("status")]
        public IActionResult Status()
        {
            var uid = ReadUserId();
            if (uid == Guid.Empty) return Unauthorized(new { ok = false, error = "X-Emby-UserId gerekli" });

            if (_jobs.TryGetValue(uid, out var job))
            {
                return Ok(new
                {
                    ok = true,
                    running = job.Running,
                    progress = Math.Round(job.Progress01 * 100, 1),
                    currentStep = job.CurrentStep,
                    lastMessage = job.LastMessage,
                    log = job.SnapshotLog(),
                    summary = job.Running ? null : new
                {
                    total  = job.Total,
                    ok     = job.OkSynced + job.OkPlain,
                    synced = job.OkSynced,
                    plain  = job.OkPlain,
                    fail   = job.Fail
                    }
                });
            }

            return Ok(new { ok = true, running = false, progress = 0.0 });
        }

        [HttpPost("cancel")]
        public IActionResult Cancel()
        {
            var uid = ReadUserId();
            if (uid == Guid.Empty) return Unauthorized(new { ok = false, error = "X-Emby-UserId gerekli" });

            if (_jobs.TryGetValue(uid, out var job) && job.Running)
            {
                try { job.Cts?.Cancel(); } catch { }
                job.Log("İptal istendi.");
                job.LastMessage = "İptal istendi";
                return Ok(new { ok = true, message = "İptal gönderildi" });
            }
            return Ok(new { ok = true, message = "Koşan iş yok" });
        }

        [HttpPost("run")]
        public IActionResult Run([FromBody] RunRequest req, CancellationToken outerCt)
        {
            var cfg = JMSFusionPlugin.Instance?.Configuration
                      ?? throw new InvalidOperationException("Plugin configuration not available.");

            var token = Request.Headers["X-Emby-Token"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(token))
                return Unauthorized(new { ok = false, error = "X-Emby-Token gerekli" });

            var uid = ReadUserId();
            if (uid == Guid.Empty)
                return Unauthorized(new { ok = false, error = "X-Emby-UserId gerekli" });

            var user = _users.GetUserById(uid);
            if (user is null)
                return Unauthorized(new { ok = false, error = "Kullanıcı bulunamadı" });

            if (!IsAdminUser(user))
                return StatusCode(403, new { ok = false, error = "Sadece admin kullanıcılar çalıştırabilir." });

            if (_jobs.TryGetValue(uid, out var running) && running.Running)
            {
                return StatusCode(409, new { ok = false, error = "Zaten çalışan bir iş var." });
            }

            var mode = (req.mode ?? "prefer-synced").ToLowerInvariant();
            var overwrite = (req.overwrite ?? "skip").ToLowerInvariant();

            var job = new JobState
            {
                UserId = uid,
                Running = true,
                StartedAt = DateTimeOffset.UtcNow,
                Cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt)
            };
            _jobs[uid] = job;

            _ = Task.Run(async () =>
            {
                try
                {
                    job.Log("Jellyfin müzik listesi alınıyor...");
                    var items = await GetAllAudioItemsAsync(cfg.JFBase, cfg.JFApiKey, uid, job.Cts!.Token);
                    job.Total = items.Count;
                    job.Log($"Toplam parça: {job.Total}");

                    int i = 0;
                    foreach (var it in items)
                    {
                        if (job.Cts!.IsCancellationRequested) break;
                        i++;
                        job.Done = i;
                        job.Progress01 = job.Total > 0 ? (double)i / job.Total : 1.0;

                        var rawTitle = it.Name ?? "";
                        var rawArtist = it.Artists?.FirstOrDefault() ?? it.AlbumArtist ?? "";
                        var sec = (int)Math.Round((it.RunTimeTicks ?? 0) / 10_000_000.0);
                        var mediaPath = it.Path;
                        job.CurrentStep = $"{rawArtist} - {rawTitle}";
                        job.LastMessage = job.CurrentStep;
                        if (string.IsNullOrWhiteSpace(mediaPath) || !System.IO.File.Exists(mediaPath))
                        {
                            job.Log($"[SKIP] Yol yok: {rawArtist} - {rawTitle}");
                            continue;
                        }
                        var (cleanArtist, cleanTitle) = CleanArtistTitle(rawArtist, rawTitle);
                        job.Log($"Sorgu: {cleanArtist} - {cleanTitle} (≈{sec}s)");
                        var basePath = Path.Combine(Path.GetDirectoryName(mediaPath)!, Path.GetFileNameWithoutExtension(mediaPath)!);
                        var lrcPath = basePath + ".lrc";
                        if (overwrite != "replace")
                        {
                            if (System.IO.File.Exists(lrcPath))
                            {
                                job.Log($"[SKIP] Mevcut .lrc: {lrcPath}");
                                continue;
                            }
                        }

                        var lyr = await QueryLrcLibAsync(cleanTitle, cleanArtist, sec, job.Cts!.Token);
                        if (lyr is null)
                        {
                            job.Fail++;
                            job.Log($"[MISS] Bulunamadı: {cleanArtist} - {cleanTitle}");
                            continue;
                        }

                        string? syncTxt = lyr.syncedLyrics;
                        string? plainTxt = lyr.plainLyrics;

                        string? toWritePath = null;
                        string? toWriteText = null;
                        string? pickedKind = null;

                        if (mode == "synced")
                        {
                            if (!string.IsNullOrEmpty(syncTxt)) { toWritePath = lrcPath; toWriteText = syncTxt; }
                        }
                        else if (mode == "plain")
                        {
                            if (!string.IsNullOrEmpty(plainTxt)) { toWritePath = lrcPath; toWriteText = plainTxt; }
                        }
                        else if (mode == "prefer-synced")
                        {
                            if (!string.IsNullOrEmpty(syncTxt))      { toWritePath = lrcPath; toWriteText = syncTxt; }
                            else if (!string.IsNullOrEmpty(plainTxt)){ toWritePath = lrcPath; toWriteText = plainTxt; }
                        }
                        else
                        {
                            if (!string.IsNullOrEmpty(plainTxt))     { toWritePath = lrcPath; toWriteText = plainTxt; }
                            else if (!string.IsNullOrEmpty(syncTxt)) { toWritePath = lrcPath; toWriteText = syncTxt; }
                        }

                        if (toWritePath is null || toWriteText is null)
                        {
                            job.Fail++;
                            job.Log($"[MISS] Uygun format yok: {cleanArtist} - {cleanTitle}");
                            continue;
                        }

                        try
                        {
                            System.IO.File.WriteAllText(toWritePath, toWriteText, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
                            job.Log($"[OK] {toWritePath}");
                            if (pickedKind == "synced") job.OkSynced++;
                            else if (pickedKind == "plain") job.OkPlain++;
                        }
                        catch (Exception ex)
                        {
                            job.Log($"[ERR] Yazılamadı: {toWritePath} -> {ex.Message}");
                        }
                    }

                    job.Running = false;
                    job.FinishedAt = DateTimeOffset.UtcNow;
                    job.LastMessage = "Bitti";
                    job.Log("Bitti ✓");
                }
                catch (OperationCanceledException)
                {
                    job.Running = false;
                    job.FinishedAt = DateTimeOffset.UtcNow;
                    job.LastMessage = "İptal edildi";
                    job.Log("İptal edildi");
                }
                catch (Exception ex)
                {
                    job.Running = false;
                    job.FinishedAt = DateTimeOffset.UtcNow;
                    job.LastMessage = "Hata";
                    job.Log("[ERR] " + ex.Message);
                }
            });

            return StatusCode(202, new { ok = true, started = true });
        }

        private Guid ReadUserId()
        {
            var h = Request.Headers["X-Emby-UserId"].FirstOrDefault()
                    ?? Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();
            Guid.TryParse(h, out var uid);
            return uid;
        }

        private bool IsAdminUser(object userObj) => true;
        private async Task<List<JFItem>> GetAllAudioItemsAsync(string jfBase, string apiKey, Guid userId, CancellationToken ct)
        {
            var res = new List<JFItem>();
            int start = 0, limit = 200;

            while (true)
            {
                var url = $"{jfBase.TrimEnd('/')}/Users/{userId}/Items" +
                          $"?IncludeItemTypes=Audio&Recursive=true&Fields=Path,RunTimeTicks,AlbumArtist,Artists" +
                          $"&StartIndex={start}&Limit={limit}&api_key={Uri.EscapeDataString(apiKey)}";

                using var r = await _http.GetAsync(url, ct);
                r.EnsureSuccessStatusCode();
                var j = await r.Content.ReadFromJsonAsync<JFItemsResponse>(cancellationToken: ct) ?? new JFItemsResponse(new(), 0);

                if (j.Items != null && j.Items.Count > 0)
                {
                    res.AddRange(j.Items);
                    start += j.Items.Count;
                    if (res.Count >= j.TotalRecordCount) break;
                }
                else break;
            }
            return res;
        }

        private async Task<LrcLibHit?> QueryLrcLibAsync(string title, string artist, int durationSec, CancellationToken ct)
        {
            var b = new StringBuilder("https://lrclib.net/api/search?");
            void add(string k, string v)
            {
                if (string.IsNullOrWhiteSpace(v)) return;
                if (b[b.Length - 1] != '?') b.Append('&');
                b.Append(Uri.EscapeDataString(k)).Append('=').Append(Uri.EscapeDataString(v));
            }
            add("track_name", title);
            add("artist_name", artist);
            if (durationSec > 0) add("duration", durationSec.ToString(CultureInfo.InvariantCulture));

            using var req = new HttpRequestMessage(HttpMethod.Get, b.ToString());
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return null;

            var opts = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                NumberHandling = JsonNumberHandling.AllowReadingFromString
            };

            var list = await resp.Content.ReadFromJsonAsync<List<LrcLibHit>>(opts, ct);
            if (list == null || list.Count == 0) return null;
            LrcLibHit? best = null;
            int bestScore = int.MinValue;

            foreach (var h in list)
            {
                int score = 0;

                if (h.duration.HasValue && durationSec > 0)
                {
                    var diff = Math.Abs(h.duration.Value - durationSec);
                    score += (diff <= 2) ? 50 : (diff <= 5 ? 35 : (diff <= 10 ? 20 : 0));
                }

                if (!string.IsNullOrEmpty(h.trackName) && !string.IsNullOrEmpty(title) &&
                    string.Equals(Norm(h.trackName), Norm(title), StringComparison.OrdinalIgnoreCase))
                    score += 25;

                if (!string.IsNullOrEmpty(h.artistName) && !string.IsNullOrEmpty(artist) &&
                    Norm(h.artistName).Contains(Norm(artist), StringComparison.OrdinalIgnoreCase))
                    score += 15;

                if (score > bestScore) { bestScore = score; best = h; }
            }

            return best;

            static string Norm(string s) => Regex.Replace(s, @"\s+", " ").Trim();
        }

        private static string CollapseWhitespace(string s) =>
            Regex.Replace(s ?? "", @"\s+", " ").Trim();

        private static string NormalizeDashes(string s) =>
            (s ?? "").Replace('–', '-').Replace('—', '-');

        private static string StripTrailingParenBlock(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return s;
            return Regex.Replace(s, @"\s*[\(\[\{（【].*?[\)\]\}）】]\s*$", "", RegexOptions.Singleline).Trim();
        }

        private static string StripAfterSecondDash(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return s;
            s = NormalizeDashes(s);
            var parts = s.Split('-', 3, StringSplitOptions.TrimEntries);
            if (parts.Length >= 3)
            {
                return CollapseWhitespace($"{parts[0]} - {parts[1]}");
            }
            return s.Trim();
        }

        private static (string artist, string title) CleanArtistTitle(string rawArtist, string rawTitle)
        {
            var artist = CollapseWhitespace(rawArtist ?? "");
            var title  = CollapseWhitespace(rawTitle ?? "");
            var tNorm = NormalizeDashes(title);
            if (tNorm.Contains('-'))
            {
                var firstDash = tNorm.IndexOf('-');
                if (firstDash >= 0)
                {
                    var left  = CollapseWhitespace(tNorm.Substring(0, firstDash));
                    var right = CollapseWhitespace(tNorm.Substring(firstDash + 1));
                    if (string.IsNullOrWhiteSpace(artist) ||
                        CollapseWhitespace(tNorm).StartsWith(CollapseWhitespace(artist) + " -", StringComparison.OrdinalIgnoreCase))
                    {
                        artist = string.IsNullOrWhiteSpace(artist) ? left : artist;
                        title  = right;
                    }
                }
            }

            title = StripTrailingParenBlock(title);
            title = StripAfterSecondDash(title);
            artist = CollapseWhitespace(StripTrailingParenBlock(NormalizeDashes(artist)));
            title  = CollapseWhitespace(NormalizeDashes(title));

            return (artist, title);
        }
    }
}
