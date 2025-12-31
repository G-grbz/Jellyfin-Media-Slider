using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JMSFusion.Core
{
    public sealed class PathRewriteMiddleware
    {
        private readonly RequestDelegate _next;

        public PathRewriteMiddleware(RequestDelegate next) => _next = next;

        public async Task InvokeAsync(HttpContext ctx)
        {
            var path = ctx.Request.Path;

            if (path.HasValue && path.StartsWithSegments("/web/slider", out var remaining))
            {
                ctx.Request.Path = new PathString("/slider" + remaining);
            }

            await _next(ctx);
        }
    }
}
