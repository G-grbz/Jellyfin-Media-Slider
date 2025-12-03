using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using Microsoft.Extensions.Logging;

namespace JMSFusion
{
    public sealed class TransformingFileProvider : IFileProvider
    {
        private readonly IFileProvider _parent;
        private readonly ILogger _logger;

        public TransformingFileProvider(IFileProvider parent, ILogger logger)
        {
            _parent = parent ?? throw new ArgumentNullException(nameof(parent));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public IDirectoryContents GetDirectoryContents(string subpath) => _parent.GetDirectoryContents(subpath);

        public IFileInfo GetFileInfo(string subpath)
        {
            var info = _parent.GetFileInfo(subpath);
            if (!info.Exists) return info;

            var lower = (subpath ?? "").ToLowerInvariant();

            var shouldRewrite =
                lower.EndsWith("/index.html") ||
                lower.EndsWith("/index.html.gz") ||
                lower.EndsWith("/index.html.br") ||
                lower == "index.html" || lower == "index.html.gz" || lower == "index.html.br" ||
                lower == "/web/index.html" || lower == "/web/index.html.gz" || lower == "/web/index.html.br";

            if (!shouldRewrite) return info;

            try
            {
                _logger.LogDebug("[JMSFusion][DIAG] TransformingFileProvider hit: {Subpath}", subpath);

                using var src = info.CreateReadStream();
                var isGzip = lower.EndsWith(".gz");
                var isBr   = lower.EndsWith(".br");

                string html;
                if (isGzip)
                {
                    using var gz = new GZipStream(src, CompressionMode.Decompress, leaveOpen: false);
                    using var r = new StreamReader(gz, Encoding.UTF8, true);
                    html = r.ReadToEnd();
                }
                else if (isBr)
                {
                    using var br = new BrotliStream(src, CompressionMode.Decompress, leaveOpen: false);
                    using var r = new StreamReader(br, Encoding.UTF8, true);
                    html = r.ReadToEnd();
                }
                else
                {
                    using var r = new StreamReader(src, Encoding.UTF8, true);
                    html = r.ReadToEnd();
                }

                if (html.IndexOf("<!-- SL-INJECT BEGIN -->", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    _logger.LogDebug("[JMSFusion][DIAG] Already contains snippet, returning original.");
                    return info;
                }

                var snippet = JMSFusionPlugin.Instance?.BuildScriptsHtml("") ?? "";
                if (string.IsNullOrEmpty(snippet))
                {
                    _logger.LogWarning("[JMSFusion][DIAG] BuildScriptsHtml returned empty snippet; returning original.");
                    return info;
                }

                var head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                html = head >= 0 ? html.Insert(head, "\n" + snippet + "\n")
                                 : html + "\n" + snippet + "\n";

                byte[] payload;
                if (isGzip)
                {
                    using var ms = new MemoryStream();
                    using (var gzOut = new GZipStream(ms, CompressionLevel.Fastest, leaveOpen: true))
                        gzOut.Write(Encoding.UTF8.GetBytes(html));
                    payload = ms.ToArray();
                }
                else if (isBr)
                {
                    using var ms = new MemoryStream();
                    using (var brOut = new BrotliStream(ms, CompressionLevel.Fastest, leaveOpen: true))
                        brOut.Write(Encoding.UTF8.GetBytes(html));
                    payload = ms.ToArray();
                }
                else
                {
                    payload = Encoding.UTF8.GetBytes(html);
                }

                _logger.LogInformation("[JMSFusion][DIAG] In-memory rewritten: {Path} (bytes={Len})", subpath, payload.Length);
                return new RewritingFileInfo(info, payload);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[JMSFusion][DIAG] In-memory rewrite failed for {Path}; serving original.", subpath);
                return info;
            }
        }

        public IChangeToken Watch(string filter) => _parent.Watch(filter);
    }
}
