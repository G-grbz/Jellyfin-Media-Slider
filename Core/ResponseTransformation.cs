using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.JMSFusion.Core
{
    public sealed class TransformRequest
    {
        public string FilePath { get; init; } = "";
        public string ContentType { get; init; } = "";
        public string Contents { get; set; } = "";
    }

    public sealed class TransformationRule
    {
        public Guid Id { get; } = Guid.NewGuid();
        public Regex FileNamePattern { get; }
        public Func<TransformRequest, string> Callback { get; }

        public TransformationRule(string fileNamePattern, Func<TransformRequest, string> callback)
        {
            FileNamePattern = new Regex(fileNamePattern, RegexOptions.IgnoreCase | RegexOptions.Compiled);
            Callback = callback;
        }
    }

    public static class ResponseTransformation
    {
        private static readonly object _gate = new();
        private static readonly List<TransformationRule> _rules = new();
        public static Guid Register(string fileNamePattern, Func<TransformRequest, string> callback)
        {
            var rule = new TransformationRule(fileNamePattern, callback);
            lock (_gate) _rules.Add(rule);
            return rule.Id;
        }

        public static bool TryApply(string filePath, string contentType, ref string contents)
        {
            TransformationRule[] snapshot;
            lock (_gate) snapshot = _rules.ToArray();

            var applied = false;
            foreach (var rule in snapshot)
            {
                if (!rule.FileNamePattern.IsMatch(filePath))
                    continue;

                var req = new TransformRequest
                {
                    FilePath = filePath,
                    ContentType = contentType,
                    Contents = contents
                };

                var result = rule.Callback(req);
                if (!ReferenceEquals(result, contents) && result != contents)
                {
                    contents = result ?? string.Empty;
                    applied = true;
                }
            }
            return applied;
        }
    }
}
