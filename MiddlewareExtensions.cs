using Microsoft.AspNetCore.Builder;

namespace Jellyfin.Plugin.JMSFusion
{
    public static class MiddlewareExtensions
    {
        public static IApplicationBuilder UseJMSFusion(this IApplicationBuilder app) => app;
    }
}
