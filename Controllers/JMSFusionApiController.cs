using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json.Serialization;
using Microsoft.Win32;
using IOFile = System.IO.File;

namespace JMSFusion.Controllers
{
    [ApiController]
    [Route("Plugins/JMSFusion")]
    public class JMSFusionApiController : ControllerBase
    {
        private readonly ILogger<JMSFusionApiController> _logger;
        public JMSFusionApiController(ILogger<JMSFusionApiController> logger) => _logger = logger;

        [HttpGet("Configuration")]
        public ActionResult<JMSFusionConfiguration> GetConfiguration() => Ok(JMSFusionPlugin.Instance.Configuration);

        public sealed class UpdateRequest
        {
            [JsonPropertyName("scriptDirectory")] public string? ScriptDirectory { get; set; }
            [JsonPropertyName("playerSubdir")]    public string? PlayerSubdir { get; set; }
        }

        [HttpPost("Configuration")]
        public IActionResult UpdateConfiguration([FromBody] UpdateRequest req)
        {
            try
            {
                var plugin = JMSFusionPlugin.Instance;
                var cfg = plugin.Configuration;

                if (req.ScriptDirectory != null) cfg.ScriptDirectory = req.ScriptDirectory.Trim();
                if (req.PlayerSubdir != null)    cfg.PlayerSubdir    = req.PlayerSubdir.Trim();

                plugin.UpdateConfiguration(cfg);
                _logger.LogInformation("[JMS-Fusion] CFG SAVED: dir='{dir}', player='{sub}'", cfg.ScriptDirectory, cfg.PlayerSubdir);
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Configuration update failed");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        private sealed class StatusResponse
        {
            [JsonPropertyName("configured")]      public bool Configured { get; set; }
            [JsonPropertyName("directoryExists")] public bool DirectoryExists { get; set; }
            [JsonPropertyName("mainJsExists")]    public bool MainJsExists { get; set; }
            [JsonPropertyName("playerJsExists")]  public bool PlayerJsExists { get; set; }
            [JsonPropertyName("playerPath")]      public string PlayerPath { get; set; } = "";
            [JsonPropertyName("usingEmbedded")]   public bool UsingEmbedded { get; set; }
        }

        [HttpGet("Status")]
        public IActionResult GetStatus()
        {
            var cfg = JMSFusionPlugin.Instance.Configuration;
            var usingEmbedded = string.IsNullOrWhiteSpace(cfg.ScriptDirectory) || !Directory.Exists(cfg.ScriptDirectory);

            var playerDir = string.IsNullOrWhiteSpace(cfg.PlayerSubdir) ? "modules/player" : cfg.PlayerSubdir.Trim().Trim('/');
            var playerPath = usingEmbedded
                ? $"(embedded)/Resources/slider/{playerDir}/main.js"
                : Path.Combine(cfg.ScriptDirectory ?? string.Empty, playerDir, "main.js");

            var res = new StatusResponse
            {
                Configured      = !string.IsNullOrWhiteSpace(cfg.ScriptDirectory),
                DirectoryExists = !string.IsNullOrWhiteSpace(cfg.ScriptDirectory) && Directory.Exists(cfg.ScriptDirectory),
                MainJsExists    = usingEmbedded ? EmbeddedAssetHelper.Exists("Resources.slider.main.js")
                                                : IOFile.Exists(Path.Combine(cfg.ScriptDirectory ?? "", "main.js")),
                PlayerJsExists  = usingEmbedded ? EmbeddedAssetHelper.Exists($"Resources.slider.{playerDir.Replace('/', '.')}.main.js")
                                                : IOFile.Exists(playerPath),
                PlayerPath      = playerPath,
                UsingEmbedded   = usingEmbedded
            };

            return Ok(res);
        }

        [HttpGet("Snippet")]
        public ContentResult GetSnippet()
        {
            var pathBase = HttpContext?.Request.PathBase.Value ?? string.Empty;
            var html = JMSFusionPlugin.Instance.BuildScriptsHtml(pathBase);
            var safe = System.Net.WebUtility.HtmlEncode(html);
            return Content($"<html><body><pre>{safe}</pre></body></html>", "text/html; charset=utf-8");
        }
        private static string? DetectWebRoot()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                static string? Reg(string hivePath, string valueName)
                {
                    try
                    {
                        using var key = Registry.LocalMachine.OpenSubKey(hivePath);
                        var v = key?.GetValue(valueName) as string;
                        return string.IsNullOrWhiteSpace(v) ? null : v;
                    }
                    catch { return null; }
                }

                var install =
                    Reg(@"SOFTWARE\WOW6432Node\Jellyfin\Server", "InstallFolder") ??
                    Reg(@"SOFTWARE\Jellyfin\Server", "InstallFolder");

                if (!string.IsNullOrWhiteSpace(install))
                {
                    var web = Path.Combine(install, "jellyfin-web");
                    if (Directory.Exists(web) && IOFile.Exists(Path.Combine(web, "index.html")))
                        return web;
                }

                string? pf  = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string? pfx = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                foreach (var root in new[] { pf, pfx })
                {
                    try
                    {
                        if (string.IsNullOrWhiteSpace(root)) continue;
                        var web = Path.Combine(root, "Jellyfin", "Server", "jellyfin-web");
                        if (Directory.Exists(web) && IOFile.Exists(Path.Combine(web, "index.html")))
                            return web;
                    }
                    catch { }
                }
            }

            var candidates = new[] { "/usr/share/jellyfin/web", "/var/lib/jellyfin/web", "/opt/jellyfin/web" };
            foreach (var p in candidates)
            {
                try
                {
                    if (Directory.Exists(p) && IOFile.Exists(Path.Combine(p, "index.html")))
                        return p;
                }
                catch { }
            }

            return null;
        }

        private static (bool exists, bool writable) ProbeFile(string path)
        {
            try
            {
                if (!IOFile.Exists(path)) return (false, false);
                using var _ = IOFile.Open(path, FileMode.Open, FileAccess.Write, FileShare.Read);
                return (true, true);
            }
            catch (UnauthorizedAccessException) { return (IOFile.Exists(path), false); }
            catch { return (IOFile.Exists(path), false); }
        }

        [HttpGet("Env")]
        public IActionResult GetEnv()
        {
            var user = GetRunningUser();
            var webRoot = DetectWebRoot();

            var idxPath = webRoot == null ? null : Path.Combine(webRoot, "index.html");
            var gzPath  = webRoot == null ? null : Path.Combine(webRoot, "index.html.gz");
            var brPath  = webRoot == null ? null : Path.Combine(webRoot, "index.html.br");

            (bool idxExists, bool idxWritable) = (false, false);
            (bool gzExists,  bool gzWritable)  = (false, false);
            (bool brExists,  bool brWritable)  = (false, false);

            if (idxPath != null) (idxExists, idxWritable) = ProbeFile(idxPath);
            if (gzPath  != null) (gzExists,  gzWritable)  = ProbeFile(gzPath);
            if (brPath  != null) (brExists,  brWritable)  = ProbeFile(brPath);

            string primaryCmd;
            string altCmd;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var principal = EscapeIcaclsPrincipal(user);

                var lines = new List<string>();
                if (idxExists && idxPath is not null) lines.Add($@"icacls ""{idxPath}"" /grant {principal}:(M)");
                if (gzExists  && gzPath  is not null) lines.Add($@"icacls ""{gzPath}"" /grant {principal}:(M)");
                if (brExists  && brPath  is not null) lines.Add($@"icacls ""{brPath}"" /grant {principal}:(M)");
                if (lines.Count == 0)
                {
                    lines.Add(@"# index.html not found under the detected web root.");
                }
                primaryCmd = string.Join(Environment.NewLine, lines);
                var alt = new List<string>();
                if (idxExists && idxPath is not null) alt.Add($@"takeown /F ""{idxPath}""");
                if (gzExists  && gzPath  is not null) alt.Add($@"takeown /F ""{gzPath}""");
                if (brExists  && brPath  is not null) alt.Add($@"takeown /F ""{brPath}""");
                if (idxExists && idxPath is not null) alt.Add($@"icacls ""{idxPath}"" /grant {principal}:(M)");
                if (gzExists  && gzPath  is not null) alt.Add($@"icacls ""{gzPath}"" /grant {principal}:(M)");
                if (brExists  && brPath  is not null) alt.Add($@"icacls ""{brPath}"" /grant {principal}:(M)");
                if (alt.Count == 0) alt.Add("# nothing to change");
                altCmd = string.Join(Environment.NewLine, alt);
            }
            else
            {
                var setfacl = new List<string>();
                if (idxExists && idxPath is not null) setfacl.Add($"sudo setfacl -m u:{user}:rw \"{idxPath}\"");
                if (gzExists  && gzPath  is not null) setfacl.Add($"sudo setfacl -m u:{user}:rw \"{gzPath}\"");
                if (brExists  && brPath  is not null) setfacl.Add($"sudo setfacl -m u:{user}:rw \"{brPath}\"");
                if (setfacl.Count == 0) setfacl.Add("# index.html not found in detected web root.");
                primaryCmd = string.Join("\n", setfacl);

                var chmod = new List<string>();
                if (idxExists && idxPath is not null) { chmod.Add($"sudo chgrp {user} \"{idxPath}\""); chmod.Add($"sudo chmod g+rw \"{idxPath}\""); }
                if (gzExists  && gzPath  is not null) { chmod.Add($"sudo chgrp {user} \"{gzPath}\"");  chmod.Add($"sudo chmod g+rw \"{gzPath}\"");  }
                if (brExists  && brPath  is not null) { chmod.Add($"sudo chgrp {user} \"{brPath}\"");  chmod.Add($"sudo chmod g+rw \"{brPath}\"");  }
                if (chmod.Count == 0) chmod.Add("# no files to chmod");
                altCmd = string.Join("\n", chmod);
            }

            return Ok(new
            {
                user,
                webRoot,
                files = new
                {
                    indexHtml = new { path = idxPath, exists = idxExists, writable = idxWritable },
                    indexGz   = new { path = gzPath,  exists = gzExists,  writable = gzWritable },
                    indexBr   = new { path = brPath,  exists = brExists,  writable = brWritable },
                },
                acl = new { primary = primaryCmd, alternative = altCmd }
            });
        }

        private static string GetRunningUser()
        {
            try
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    using var wi = WindowsIdentity.GetCurrent();
                    return wi?.Name ?? Environment.UserName;
                }
                return Environment.UserName;
            }
            catch { return Environment.UserName; }
        }

        private static string EscapeIcaclsPrincipal(string principal)
        {
            if (string.IsNullOrWhiteSpace(principal)) return "\"Users\"";
            if (principal.Contains(' ')) return $"\"{principal}\"";
            return principal;
        }
    }
}
