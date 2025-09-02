using System;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Win32;
using JMSFusion.Core;
using System.Runtime.Versioning;

namespace JMSFusion
{
    public sealed class JMSStartupFilter : IStartupFilter
    {
        private static volatile string? s_cachedWebRoot;

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                var logger = app.ApplicationServices.GetRequiredService<ILogger<JMSStartupFilter>>();
                var env    = app.ApplicationServices.GetRequiredService<IWebHostEnvironment>();

                app.UseMiddleware<PathRewriteMiddleware>();
                var asm = typeof(JMSStartupFilter).Assembly;
                var embedded = new ManifestEmbeddedFileProvider(asm, "Resources/slider");
                app.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = embedded,
                    RequestPath  = "/slider"
                });

                var webRoot = DetectWebRootPhysicalCached();
                if (!string.IsNullOrEmpty(webRoot))
                {
                    var physicalSlider = Path.Combine(webRoot!, "slider");
                    if (Directory.Exists(physicalSlider))
                    {
                        app.UseStaticFiles(new StaticFileOptions
                        {
                            FileProvider = new PhysicalFileProvider(physicalSlider),
                            RequestPath  = "/slider"
                        });
                    }
                }

                app.MapWhen(ctx => IsIndexRequest(ctx.Request.Path), indexApp =>
                {
                    indexApp.Run(async ctx =>
                    {
                        try
                        {
                            var (html, encodingUsed, _, alreadyInjected) =
                                await LoadIndexHtmlAsync(env, ctx, logger);

                            if (!alreadyInjected)
                            {
                                var pathBase = ctx.Request.PathBase.HasValue ? ctx.Request.PathBase.Value : string.Empty;
                                var snippet  = JMSFusionPlugin.Instance?.BuildScriptsHtml(pathBase) ?? string.Empty;

                                if (!string.IsNullOrEmpty(snippet))
                                {
                                    var headIdx = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                                    html = headIdx >= 0
                                        ? html.Insert(headIdx, "\n" + snippet + "\n")
                                        : html + "\n" + snippet + "\n";
                                }
                            }

                            ctx.Response.StatusCode  = StatusCodes.Status200OK;
                            ctx.Response.ContentType = "text/html; charset=utf-8";
                            ctx.Response.Headers["Vary"] = "Accept-Encoding";
                            if (!string.IsNullOrEmpty(encodingUsed))
                                ctx.Response.Headers["Content-Encoding"] = encodingUsed;

                            if (!HttpMethods.IsHead(ctx.Request.Method))
                                await WriteEncodedAsync(ctx.Response.Body, html, encodingUsed, ctx.RequestAborted);
                            return;
                        }
                        catch (Exception ex)
                        {
                            logger.LogWarning(ex, "[JMS-Fusion] In-memory injection failed; falling back to original pipeline.");
                            ctx.Response.Clear();
                            await ctx.Response.StartAsync();
                        }
                    });
                });

                next(app);
            };
        }

        private static bool IsIndexRequest(PathString path)
        {
            var p = (path.Value ?? string.Empty).ToLowerInvariant();
            return p.EndsWith("/web") ||
                   p.EndsWith("/web/") ||
                   p.EndsWith("/web/index.html") ||
                   p.EndsWith("/web/index.html.gz") ||
                   p.EndsWith("/web/index.html.br");
        }

        private static async Task<(string html, string encodingUsed, string sourceInfo, bool alreadyInjected)>
            LoadIndexHtmlAsync(IWebHostEnvironment env, HttpContext ctx, ILogger logger)
        {
            var fp = env.WebRootFileProvider ?? new NullFileProvider();
            var acceptEnc = (ctx.Request.Headers["Accept-Encoding"].ToString() ?? string.Empty).ToLowerInvariant();
            var wantsBr   = acceptEnc.Contains("br");
            var wantsGz   = acceptEnc.Contains("gzip");

            var fileBr = fp.GetFileInfo("index.html.br");
            var fileGz = fp.GetFileInfo("index.html.gz");
            var fileHt = fp.GetFileInfo("index.html");

            IFileInfo pick = fileHt; string enc = ""; string src = "index.html";

            if (wantsBr && fileBr.Exists) { pick = fileBr; enc = "br";   src = "index.html.br"; }
            else if (wantsGz && fileGz.Exists) { pick = fileGz; enc = "gzip"; src = "index.html.gz"; }
            else if (!fileHt.Exists)
            {
                var root = DetectWebRootPhysicalCached();
                if (root is not null)
                {
                    var pf = new PhysicalFileProvider(root);
                    var pBr = pf.GetFileInfo("index.html.br");
                    var pGz = pf.GetFileInfo("index.html.gz");
                    var pHt = pf.GetFileInfo("index.html");
                    if (wantsBr && pBr.Exists) { pick = pBr; enc = "br";   src = pBr.PhysicalPath ?? "index.html.br"; }
                    else if (wantsGz && pGz.Exists) { pick = pGz; enc = "gzip"; src = pGz.PhysicalPath ?? "index.html.gz"; }
                    else if (pHt.Exists) { pick = pHt; enc = ""; src = pHt.PhysicalPath ?? "index.html"; }
                }
            }

            if (!pick.Exists)
                throw new FileNotFoundException("Jellyfin web index not found (html/gz/br).");

            string html;
            using (var s = pick.CreateReadStream())
            {
                if (enc == "br")
                {
                    using var br = new BrotliStream(s, CompressionMode.Decompress, leaveOpen: false);
                    using var r  = new StreamReader(br, Encoding.UTF8, true);
                    html = await r.ReadToEndAsync();
                }
                else if (enc == "gzip")
                {
                    using var gz = new GZipStream(s, CompressionMode.Decompress, leaveOpen: false);
                    using var r  = new StreamReader(gz, Encoding.UTF8, true);
                    html = await r.ReadToEndAsync();
                }
                else
                {
                    using var r = new StreamReader(s, Encoding.UTF8, true);
                    html = await r.ReadToEndAsync();
                }
            }

            var already = html.IndexOf("<!-- SL-INJECT BEGIN -->", StringComparison.OrdinalIgnoreCase) >= 0;
            return (html, enc, src, already);
        }

        private static async Task WriteEncodedAsync(Stream output, string html, string encoding, System.Threading.CancellationToken abort)
        {
            var bytes = Encoding.UTF8.GetBytes(html);

            if (encoding == "br")
            {
                using var brOut = new BrotliStream(output, CompressionLevel.Fastest, leaveOpen: true);
                await brOut.WriteAsync(bytes, 0, bytes.Length, abort);
                await brOut.FlushAsync(abort);
            }
            else if (encoding == "gzip")
            {
                using var gzOut = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true);
                await gzOut.WriteAsync(bytes, 0, bytes.Length, abort);
                await gzOut.FlushAsync(abort);
            }
            else
            {
                await output.WriteAsync(bytes, 0, bytes.Length, abort);
                await output.FlushAsync(abort);
            }
        }

        private static string? DetectWebRootPhysicalCached()
        {
            var cached = s_cachedWebRoot;
            if (cached != null) return cached;

            var found = DetectWebRootPhysical();
            s_cachedWebRoot = found;
            return found;
        }

        private static string? DetectWebRootPhysical()
    {
        if (TryFromEnvWebDir(out var envWeb)) return envWeb;

        if (OperatingSystem.IsWindows())
        {
            if (TryFromRegistry(out var regWeb)) return regWeb;
            if (TryFromProgramFiles(out var pfWeb)) return pfWeb;
            if (TryFromProgramData(out var pdWeb)) return pdWeb;
            if (TryPortableAdjacent(out var portableWeb)) return portableWeb;
        }
        else
        {
                var cands = new[]
                {
                    "/usr/share/jellyfin/web",
                    "/var/lib/jellyfin/web",
                    "/opt/jellyfin/web",
                    Path.Combine(AppContext.BaseDirectory, "web"),
                };
                foreach (var p in cands)
                {
                    try
                    {
                        if (Directory.Exists(p) && File.Exists(Path.Combine(p, "index.html")))
                            return p;
                    }
                    catch {}
                }
            }

            var fallback = Path.Combine(AppContext.BaseDirectory, "web");
            if (Directory.Exists(fallback) && File.Exists(Path.Combine(fallback, "index.html")))
                return fallback;

            return null;
        }

        private static bool TryFromEnvWebDir(out string? path)
        {
            path = null;
            try
            {
                var explicitDir = Environment.GetEnvironmentVariable("JELLYFIN_WEB_DIR");
                if (!string.IsNullOrWhiteSpace(explicitDir)
                    && Directory.Exists(explicitDir)
                    && File.Exists(Path.Combine(explicitDir, "index.html")))
                {
                    path = explicitDir;
                    return true;
                }

                var opt = Environment.GetEnvironmentVariable("JELLYFIN_WEB_OPT");
                if (!string.IsNullOrWhiteSpace(opt))
                {
                    var marker = "--webdir=";
                    var idx = opt.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                    if (idx >= 0)
                    {
                        var val = opt.Substring(idx + marker.Length).Trim().Trim('"');
                        var sp = val.IndexOf(' ');
                        if (sp >= 0) val = val.Substring(0, sp);

                        if (!string.IsNullOrWhiteSpace(val)
                            && Directory.Exists(val)
                            && File.Exists(Path.Combine(val, "index.html")))
                        {
                            path = val;
                            return true;
                        }
                    }
                }
            }
            catch {}
            return false;
        }

        [SupportedOSPlatform("windows")]
private static bool TryFromRegistry(out string? path)
{
    path = null;
    try
    {
        static string? Reg(string hivePath, string valueName)
        {
            try
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(hivePath);
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
            if (Directory.Exists(web) && File.Exists(Path.Combine(web, "index.html")))
            {
                path = web;
                return true;
            }
        }
    }
    catch { /* ignore */ }
    return false;
}


        private static bool TryFromProgramFiles(out string? path)
        {
            path = null;
            try
            {
                string? pf  = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string? pfx = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

                foreach (var root in new[] { pf, pfx })
                {
                    if (string.IsNullOrWhiteSpace(root)) continue;
                    try
                    {
                        var web = Path.Combine(root, "Jellyfin", "Server", "jellyfin-web");
                        if (Directory.Exists(web) && File.Exists(Path.Combine(web, "index.html")))
                        {
                            path = web;
                            return true;
                        }
                    }
                    catch {}
                }
            }
            catch {}
            return false;
        }

        private static bool TryFromProgramData(out string? path)
        {
            path = null;
            try
            {
                var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
                if (!string.IsNullOrWhiteSpace(programData))
                {
                    var web = Path.Combine(programData, "Jellyfin", "Server", "jellyfin-web");
                    if (Directory.Exists(web) && File.Exists(Path.Combine(web, "index.html")))
                    {
                        path = web;
                        return true;
                    }
                }
            }
            catch {}
            return false;
        }

        private static bool TryPortableAdjacent(out string? path)
        {
            path = null;
            try
            {
                var baseDir = AppContext.BaseDirectory;
                var web = Path.Combine(baseDir, "jellyfin-web");
                if (Directory.Exists(web) && File.Exists(Path.Combine(web, "index.html")))
                {
                    path = web;
                    return true;
                }
            }
            catch {}
            return false;
        }
    }
}
