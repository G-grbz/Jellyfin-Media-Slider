using System;
using System.IO;
using Microsoft.Extensions.FileProviders;

namespace Jellyfin.Plugin.JMSFusion
{
    internal sealed class RewritingFileInfo : IFileInfo
    {
        private readonly IFileInfo _original;
        private readonly byte[] _content;

        public RewritingFileInfo(IFileInfo original, byte[] content)
        {
            _original = original ?? throw new ArgumentNullException(nameof(original));
            _content  = content ?? Array.Empty<byte>();
        }

        public bool Exists => true;
        public long Length => _content.LongLength;
        public string PhysicalPath => null!;
        public string Name => _original.Name;
        public DateTimeOffset LastModified => _original.LastModified;
        public bool IsDirectory => false;

        public Stream CreateReadStream() => new MemoryStream(_content, writable: false);
    }
}
