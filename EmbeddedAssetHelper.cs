using System.IO;
using System.Linq;
using System.Reflection;
using System;

namespace Jellyfin.Plugin.JMSFusion
{
    internal static class EmbeddedAssetHelper
    {
        internal static bool Exists(string resourceName)
        {
            var asm = typeof(JMSFusionPlugin).Assembly;
            return asm.GetManifestResourceNames()
                      .Any(n => n.EndsWith(resourceName, StringComparison.OrdinalIgnoreCase));
        }

        internal static byte[]? TryRead(string resourceName)
        {
            var asm = typeof(JMSFusionPlugin).Assembly;
            var full = asm.GetManifestResourceNames()
                          .FirstOrDefault(n => n.EndsWith(resourceName, StringComparison.OrdinalIgnoreCase));
            if (full == null) return null;
            using var s = asm.GetManifestResourceStream(full);
            if (s == null) return null;
            using var ms = new MemoryStream();
            s.CopyTo(ms);
            return ms.ToArray();
        }
    }
}
