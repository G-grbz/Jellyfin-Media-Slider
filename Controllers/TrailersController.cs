using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Jellyfin.Plugin.JMSFusion;
using Jellyfin.Plugin.JMSFusion.Core;

namespace Jellyfin.Plugin.JMSFusion.Controllers
{
    [ApiController]
    [Route("JMSFusion/trailers")]
    public class TrailersController : ControllerBase
    {
        private readonly IUserManager _users;

        public TrailersController(IUserManager users)
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
            public string[] Steps { get; set; } = Array.Empty<string>();
            public double Progress01 { get; set; }
            public List<object> Results { get; } = new();
            public int CurrentStepTotal { get; set; } = 0;
            public int CurrentStepDone { get; set; } = 0;
            public CancellationTokenSource? Cts { get; set; }
            public string LastMessage { get; set; } = "";
            public int LogCapacity { get; } = 500;
            private readonly LinkedList<string> _log = new();
            private readonly object _logLock = new();

            public void AddLog(string line)
            {
                lock (_logLock)
                {
                    _log.AddLast(line);
                    if (_log.Count > LogCapacity) _log.RemoveFirst();
                }
            }
            public string[] SnapshotLog()
            {
                lock (_logLock) return _log.ToArray();
            }
        }
        private static readonly ConcurrentDictionary<Guid, JobState> _jobs = new();

        private static double StepProgress(int stepIndex, int totalSteps)
        {
            if (totalSteps <= 0) return 0;
            if (stepIndex <= 0) return 0;
            if (stepIndex >= totalSteps) return 1.0;
            return (double)stepIndex / totalSteps;
        }

        public class RunRequest
        {
            public bool runDownloader { get; set; }
            public bool runUrlNfo { get; set; }
            public string? overwritePolicy { get; set; }
            public int? enableThemeLink { get; set; }
            public string? themeLinkMode { get; set; }
            public string? jfBase { get; set; }
            public string? jfApiKey { get; set; }
            public string? tmdbApiKey { get; set; }
            public string? preferredLang { get; set; }
            public string? fallbackLang { get; set; }
        }

        [HttpGet("status")]
        public IActionResult Status()
        {
            var userIdHeader =
                Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
                Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();

            if (!Guid.TryParse(userIdHeader, out var userId) || userId == Guid.Empty)
                return Unauthorized(new { error = "X-Emby-UserId header gerekli." });

            if (_jobs.TryGetValue(userId, out var job))
            {
                return Ok(new
                {
                    ok = true,
                    running = job.Running,
                    startedAt = job.StartedAt,
                    finishedAt = job.FinishedAt,
                    currentStep = job.CurrentStep,
                    steps = job.Steps,
                    progress = Math.Round(job.Progress01 * 100, 1),
                    lastMessage = job.LastMessage,
                    log = job.SnapshotLog(),
                    results = job.Running ? Array.Empty<object>() : job.Results.ToArray()
                });
            }

            return Ok(new { ok = true, running = false });
        }

        [HttpPost("cancel")]
        public IActionResult Cancel()
        {
            var userIdHeader =
                Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
                Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();

            if (!Guid.TryParse(userIdHeader, out var userId) || userId == Guid.Empty)
                return Unauthorized(new { error = "X-Emby-UserId header gerekli." });

            if (_jobs.TryGetValue(userId, out var job) && job.Running)
            {
                try { job.Cts?.Cancel(); } catch { }
                job.LastMessage = "İş iptal istendi.";
                return Ok(new { ok = true, message = "İş iptal ediliyor..." });
            }

            return Ok(new { ok = true, message = "Koşan iş yok." });
        }

        [HttpPost("run")]
public IActionResult Run([FromBody] RunRequest req, CancellationToken outerCt)
{
    try
    {
        var cfg = JMSFusionPlugin.Instance?.Configuration;
        if (cfg is null)
        {
            return StatusCode(500, new {
                error = "Plugin configuration not available.",
                hint  = "Docker'da /config/plugins ve /config/plugins/configurations yazılabilir olmalı; plugin gerçekten yüklendi mi? Konteyner loglarına bakın.",
            });
        }

        var token = Request.Headers["X-Emby-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token))
            return Unauthorized(new { error = "X-Emby-Token header gerekli." });

        var userIdHeader =
            Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
            Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();

        if (!Guid.TryParse(userIdHeader, out var userId) || userId == Guid.Empty)
            return Unauthorized(new { error = "X-Emby-UserId header gerekli." });

        var user = _users.GetUserById(userId);
        if (user is null)
            return Unauthorized(new { error = "Kullanıcı bulunamadı." });

        if (!IsAdminUser(user))
            return StatusCode(403, new { error = "Sadece admin kullanıcılar çalıştırabilir." });

        if (!cfg.AllowScriptExecution)
            return StatusCode(403, new { error = "Script çalıştırma kapalı (AllowScriptExecution=false)." });

        var steps = new List<string>();
        if (req.runDownloader && cfg.EnableTrailerDownloader) steps.Add("trailers.sh");
        if (req.runUrlNfo && cfg.EnableTrailerUrlNfo) steps.Add("trailersurl.sh");
        if (steps.Count == 0)
            return BadRequest(new { error = "Hiçbir görev etkin değil." });

                if (_jobs.TryGetValue(userId, out var existing) && existing.Running)
                {
                    return StatusCode(409, new
                    {
                        error = "Zaten çalışan bir iş var.",
                        running = true,
                        startedAt = existing.StartedAt,
                        progress = Math.Round(existing.Progress01 * 100, 1),
                        currentStep = existing.CurrentStep,
                        steps = existing.Steps
                    });
                }

                var envBase = new Dictionary<string, string?>
                {
                    ["JF_BASE"] = req.jfBase ?? cfg.JFBase,
                    ["JF_API_KEY"] = req.jfApiKey ?? cfg.JFApiKey,
                    ["TMDB_API_KEY"] = req.tmdbApiKey ?? cfg.TmdbApiKey,
                    ["PREFERRED_LANG"] = req.preferredLang ?? cfg.PreferredLang,
                    ["FALLBACK_LANG"] = req.fallbackLang ?? cfg.FallbackLang
                };

                var job = new JobState
                {
                    UserId = userId,
                    Running = true,
                    StartedAt = DateTimeOffset.UtcNow,
                    Steps = steps.ToArray(),
                    Cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt)
                };

                _jobs[userId] = job;

                _ = Task.Run(async () =>
                {
                    var startedAt = DateTimeOffset.UtcNow;
                    int currentIndex = 0;

                    foreach (var step in steps)
                    {
                        if (job.Cts!.IsCancellationRequested) break;

                        currentIndex++;
                        job.CurrentStep = step;
                        job.Progress01 = StepProgress(currentIndex - 1, steps.Count);
                        job.LastMessage = $"{step} başlıyor...";
                        job.CurrentStepTotal = 0;
                        job.CurrentStepDone = 0;

                        var stepBase = StepProgress(currentIndex - 1, steps.Count);
                        var stepSpan = 1.0 / steps.Count;

                        void HandleLine(string line, bool isErr)
                        {
                            var ts = DateTime.Now.ToString("HH:mm:ss");
                            var prefix = isErr ? "[ERR]" : "[OUT]";
                            job.AddLog($"{ts} {prefix} {line}");
                            job.LastMessage = line;

                            if (line.Contains("JMSF::TOTAL="))
                            {
                                var num = line.Replace("JMSF::TOTAL=", "");
                                if (int.TryParse(num, out var t)) job.CurrentStepTotal = t;
                            }
                            if (line.Contains("JMSF::DONE="))
                            {
                                var num = line.Replace("JMSF::DONE=", "");
                                if (int.TryParse(num, out var d)) job.CurrentStepDone = d;
                            }
                            if (job.CurrentStepTotal > 0)
                            {
                                var frac = Math.Clamp((double)job.CurrentStepDone / job.CurrentStepTotal, 0, 1);
                                job.Progress01 = Math.Clamp(stepBase + stepSpan * frac, 0, 1);
                            }
                        }

                        if (step == "trailers.sh")
                        {
                            var resName = FindRes("Resources.slider.trailers.sh");
                            var script = EmbeddedScriptRunner.ExtractResourceToTemp(resName, "trailers.sh");

                            var policyWire = !string.IsNullOrWhiteSpace(req.overwritePolicy)
                                ? req.overwritePolicy!
                                : MapOverwritePolicy(cfg.OverwritePolicy);
                            job.AddLog($"OVERWRITE_POLICY(req)={req.overwritePolicy ?? "<null>"}; cfg={cfg.OverwritePolicy}; wire={policyWire}");

                            var env = new Dictionary<string, string?>(envBase)
                            {
                                ["OVERWRITE_POLICY"] = policyWire,
                                ["ENABLE_THEME_LINK"] = (req.enableThemeLink ?? cfg.EnableThemeLink).ToString(),
                                ["THEME_LINK_MODE"] = req.themeLinkMode ?? cfg.ThemeLinkMode
                            };

                            var (code, so, se) = await EmbeddedScriptRunner.RunBashAsync(
                                script, env, ct: job.Cts.Token, onLine: HandleLine);
                            job.Results.Add(new { script = "trailers.sh", exitCode = code, stdout = so });
                        }
                        else if (step == "trailersurl.sh")
                        {
                            var resName = FindRes("Resources.slider.trailersurl.sh");
                            var script = EmbeddedScriptRunner.ExtractResourceToTemp(resName, "trailersurl.sh");

                            var (code, so, se) = await EmbeddedScriptRunner.RunBashAsync(
                                script, envBase, ct: job.Cts.Token, onLine: HandleLine);
                            job.Results.Add(new { script = "trailersurl.sh", exitCode = code });
                        }

                        job.Progress01 = StepProgress(currentIndex, steps.Count);
                        job.LastMessage = $"{step} bitti.";
                    }

                    var finishedAt = DateTimeOffset.UtcNow;
                    job.Running = false;
                    job.FinishedAt = finishedAt;
                    job.LastMessage = job.Cts!.IsCancellationRequested
                        ? "İş iptal edildi."
                        : $"Bitti ✓ ({(finishedAt - startedAt).TotalSeconds:F1} sn)";
                });
                return StatusCode(202, new { ok = true, started = true, steps = job.Steps, startedAt = job.StartedAt });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stack = ex.ToString() });
            }
        }

        [HttpGet("diag")]
public IActionResult Diag()
{
    var cfg = JMSFusionPlugin.Instance?.Configuration;
    var asm = typeof(EmbeddedScriptRunner).Assembly;
    var names = asm.GetManifestResourceNames();

    var hasBash = System.IO.File.Exists("/bin/bash");
    var tmpOk = true;
    try {
        var p = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "jmsf._probe");
        System.IO.File.WriteAllText(p, "ok");
        System.IO.File.Delete(p);
    } catch { tmpOk = false; }

    return Ok(new {
        ok = true,
        pluginConfigLoaded = cfg != null,
        allowScriptExecution = cfg?.AllowScriptExecution,
        enableTrailerDownloader = cfg?.EnableTrailerDownloader,
        enableTrailerUrlNfo = cfg?.EnableTrailerUrlNfo,
        tempWritable = tmpOk,
        hasBash,
        embeddedResourcesSample = names.Where(n => n.Contains("Resources.slider")).Take(5).ToArray()
    });
}


        private bool IsAdminUser(object userObj) { return true; }

        private static string FindRes(string tail)
        {
            var asm = typeof(EmbeddedScriptRunner).Assembly;
            return asm.GetManifestResourceNames().First(n => n.EndsWith(tail, StringComparison.OrdinalIgnoreCase));
        }

        private static string MapOverwritePolicy(OverwritePolicy p) =>
            p switch
            {
                OverwritePolicy.Replace => "replace",
                OverwritePolicy.IfBetter => "if-better",
                _ => "skip"
            };
    }
}
