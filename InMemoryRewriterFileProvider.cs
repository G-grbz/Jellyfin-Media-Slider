using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using Microsoft.Extensions.Logging;

namespace JMSFusion
{
    public sealed class InMemoryRewriterFileProvider : IFileProvider
    {
        private IFileProvider _underlying = default!;
        private ILogger _logger = default!;
        private int _diagLogged = 0;
        private const int MaxDiagLogs = 200;

        public void SetUnderlying(IFileProvider provider, ILogger logger)
        {
            _underlying = provider ?? throw new ArgumentNullException(nameof(provider));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _logger.LogInformation("[JMSFusion] Registered in-memory transformer over static files");
        }

        public IFileProvider GetDefaultWebRootProvider()
        {
            var baseDir = AppContext.BaseDirectory;
            var web = Path.Combine(baseDir, "web");
            return Directory.Exists(web) ? new PhysicalFileProvider(web) : new NullFileProvider();
        }

        public IDirectoryContents GetDirectoryContents(string subpath) => _underlying.GetDirectoryContents(subpath);

        public IFileInfo GetFileInfo(string subpath)
        {
            if (string.IsNullOrEmpty(subpath))
                return _underlying.GetFileInfo(subpath);

            var lower = subpath.ToLowerInvariant();
            if (_diagLogged < MaxDiagLogs && lower.Contains("index.html"))
            {
                _diagLogged++;
                _logger.LogInformation("[JMSFusion][DIAG] GetFileInfo subpath='{Subpath}'", subpath);
            }
            var shouldRewrite =
                lower.EndsWith("/index.html") ||
                lower.EndsWith("/index.html.gz") ||
                lower.EndsWith("/index.html.br") ||
                lower == "index.html" || lower == "index.html.gz" || lower == "index.html.br";

            if (!shouldRewrite)
                return _underlying.GetFileInfo(subpath);

            var original = _underlying.GetFileInfo(subpath);
            if (!original.Exists)
            {
                if (_diagLogged < MaxDiagLogs)
                {
                    _diagLogged++;
                    _logger.LogInformation("[JMSFusion][DIAG] original file NOT FOUND for '{Subpath}'", subpath);
                }
                return original;
            }

            try
            {
                using var src = original.CreateReadStream();
                var isGzip = lower.EndsWith(".gz");
                var isBrotli = lower.EndsWith(".br");

                string html;
                if (isGzip)
                {
                    using var gz = new GZipStream(src, CompressionMode.Decompress, leaveOpen: false);
                    using var reader = new StreamReader(gz, Encoding.UTF8, true);
                    html = reader.ReadToEnd();
                }
                else if (isBrotli)
                {
                    using var br = new BrotliStream(src, CompressionMode.Decompress, leaveOpen: false);
                    using var reader = new StreamReader(br, Encoding.UTF8, true);
                    html = reader.ReadToEnd();
                }
                else
                {
                    using var reader = new StreamReader(src, Encoding.UTF8, true);
                    html = reader.ReadToEnd();
                }

                if (_diagLogged < MaxDiagLogs)
                {
                    _diagLogged++;
                    _logger.LogInformation("[JMSFusion][DIAG] loaded html ({Len} chars) from '{Subpath}'", html.Length, subpath);
                }

                if (html.Contains("<!-- SL-INJECT BEGIN -->", StringComparison.OrdinalIgnoreCase) &&
                    html.Contains("<!-- SL-INJECT END -->", StringComparison.OrdinalIgnoreCase))
                {
                    if (_diagLogged < MaxDiagLogs)
                    {
                        _diagLogged++;
                        _logger.LogInformation("[JMSFusion][DIAG] markers already present, returning original for '{Subpath}'", subpath);
                    }
                    return original;
                }
                var snippet = JMSFusionPlugin.Instance?.BuildScriptsHtml("") ?? "";
                if (string.IsNullOrEmpty(snippet))
                {
                    if (_diagLogged < MaxDiagLogs)
                    {
                        _diagLogged++;
                        _logger.LogWarning("[JMSFusion][DIAG] snippet is empty; returning original for '{Subpath}'", subpath);
                    }
                    return original;
                }

                var headIdx = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                if (headIdx >= 0) html = html.Insert(headIdx, Environment.NewLine + snippet + Environment.NewLine);
                else html += Environment.NewLine + snippet + Environment.NewLine;

                byte[] resultBytes;
                if (isGzip)
                {
                    using var ms = new MemoryStream();
                    using (var gzOut = new GZipStream(ms, CompressionLevel.Fastest, leaveOpen: true))
                        gzOut.Write(Encoding.UTF8.GetBytes(html));
                    ms.Flush(); ms.Position = 0;
                    resultBytes = ms.ToArray();
                }
                else if (isBrotli)
                {
                    using var ms = new MemoryStream();
                    using (var brOut = new BrotliStream(ms, CompressionLevel.Fastest, leaveOpen: true))
                        brOut.Write(Encoding.UTF8.GetBytes(html));
                    ms.Flush(); ms.Position = 0;
                    resultBytes = ms.ToArray();
                }
                else
                {
                    resultBytes = Encoding.UTF8.GetBytes(html);
                }

                _logger.LogInformation("[JMSFusion] In-memory rewritten: {Path} ({Bytes} bytes)", subpath, resultBytes.Length);
                return new RewritingFileInfo(original, resultBytes);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[JMSFusion] In-memory rewrite failed for {Path}. Falling back to original.", subpath);
                return original;
            }
        }

        public IChangeToken Watch(string filter) => _underlying.Watch(filter);
    }
}
