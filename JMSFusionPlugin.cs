using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;
using JMSFusion.Core;

namespace JMSFusion
{
    public class JMSFusionPlugin : BasePlugin<JMSFusionConfiguration>, IHasWebPages
    {
        public override string Name => "JMS-Fusion";
        public override Guid Id => Guid.Parse("c0b4a5e0-2f6a-4e70-9c5f-1e7c2d0b7f12");
        public override string Description => "Inject custom JS into Jellyfin UI via in-memory transformation, middleware fallback, or index.html patch.";

        private readonly ILogger<JMSFusionPlugin> _logger;
        public static JMSFusionPlugin Instance { get; private set; } = null!;

        public JMSFusionPlugin(IApplicationPaths paths, IXmlSerializer xmlSerializer, ILoggerFactory loggerFactory)
            : base(paths, xmlSerializer)
        {
            _logger = loggerFactory.CreateLogger<JMSFusionPlugin>();
            Instance = this;

            ConfigurationChanged += (_, __) =>
            {
                _logger.LogInformation("[JMS-Fusion] Configuration changed.");
                TryPatchIndexHtml();
            };
            TryPatchIndexHtml();
            _ = Task.Run(async () =>
            {
                for (var i = 0; i < 3; i++)
                {
                    await Task.Delay(TimeSpan.FromSeconds(3 * (i + 1)));
                    TryPatchIndexHtml();
                }
            });
            try
            {
                if (Configuration.EnableTransformEngine)
                {
                    ResponseTransformation.Register(@"(^|/)?index\.html(\.gz|\.br)?$",
                        req =>
                        {
                            var html = req.Contents ?? string.Empty;

                            if (html.IndexOf("<!-- SL-INJECT BEGIN -->", StringComparison.OrdinalIgnoreCase) >= 0)
                                return html;

                            var snippet = BuildScriptsHtml();
                            var headEndIndex = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
                            if (headEndIndex >= 0)
                            {
                                return html.Insert(headEndIndex, "\n" + snippet + "\n");
                            }
                            return html + "\n" + snippet + "\n";
                        });

                    _logger.LogInformation("[JMS-Fusion] Registered in-memory transformation rule for index.html(+gz/br)");
                }
                else
                {
                    _logger.LogInformation("[JMS-Fusion] Transform engine disabled by configuration");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[JMS-Fusion] Failed to register in-memory transformation; middleware/patch fallback will be used.");
            }
        }

        private string? DetectWebRoot()
        {
            var candidates = new[]
            {
                "/usr/share/jellyfin/web",
                "/var/lib/jellyfin/web",
                "/opt/jellyfin/web",
                "/jellyfin/web",
                Path.Combine(Environment.CurrentDirectory, "web"),
                Path.Combine(AppContext.BaseDirectory, "web")
            };

            foreach (var p in candidates)
            {
                try
                {
                    _logger.LogInformation("[JMS-Fusion] Checking web root candidate: {Candidate}", p);

                    if (Directory.Exists(p) && File.Exists(Path.Combine(p, "index.html")))
                    {
                        _logger.LogInformation("[JMS-Fusion] Found web root: {WebRoot}", p);
                        return p;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[JMS-Fusion] Error checking candidate: {Candidate}", p);
                }
            }

            _logger.LogWarning("[JMS-Fusion] Web root not found in any candidate location");
            return null;
        }

        public void TryPatchIndexHtml()
        {
            try
            {
                var root = DetectWebRoot();
                if (string.IsNullOrWhiteSpace(root))
                {
                    _logger.LogWarning("[JMS-Fusion] Web root not found; skipping patch.");
                    return;
                }
                var ok = IndexPatcher.EnsurePatched(_logger, root);
                _logger.LogInformation("[JMS-Fusion] Patch result: {ok}", ok);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[JMS-Fusion] TryPatchIndexHtml failed");
            }
        }

        public string BuildScriptsHtml(string? pathBase = null)
        {
            var prefix = string.IsNullOrEmpty(pathBase) ? "" : pathBase.TrimEnd('/');
            var ver = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            var sb = new StringBuilder();
            sb.AppendLine("<!-- SL-INJECT BEGIN -->");
            sb.AppendLine($"<script type=\"module\" src=\"{prefix}/slider/main.js?v={ver}\"></script>");
            sb.AppendLine($"<script type=\"module\" src=\"{prefix}/slider/modules/player/main.js?v={ver}\"></script>");
            sb.AppendLine("<!-- SL-INJECT END -->");
            return sb.ToString();
        }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            var ns = typeof(JMSFusionPlugin).Namespace;
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "JMSFusionConfigPage",
                    EmbeddedResourcePath = $"{ns}.Web.configuration.html",
                    EnableInMainMenu = true,
                    MenuSection = "server",
                    MenuIcon = "developer_mode"
                }
            };
        }
    }
}
