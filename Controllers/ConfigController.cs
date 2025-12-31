using Microsoft.AspNetCore.Mvc;
namespace Jellyfin.Plugin.JMSFusion.Controllers;

public class ConfigUpdateDto
{
    public bool?   AllowScriptExecution    { get; set; }
    public bool?   EnableTrailerDownloader { get; set; }
    public bool?   EnableTrailerUrlNfo     { get; set; }
    public string? JFBase        { get; set; }
    public string? JFApiKey      { get; set; }
    public string? TmdbApiKey    { get; set; }
    public string? PreferredLang { get; set; }
    public string? FallbackLang  { get; set; }
    public string? OverwritePolicy { get; set; }
    public int?    EnableThemeLink { get; set; }
    public string? ThemeLinkMode   { get; set; }
    public string? IncludeTypes { get; set; }
    public int?    PageSize     { get; set; }
    public double? SleepSecs    { get; set; }
    public string? JFUserId     { get; set; }
}

[ApiController]
[Route("JMSFusion/config")]
[Route("Plugins/JMSFusion/config")]
public class ConfigController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var cfg = JMSFusionPlugin.Instance?.Configuration
                  ?? throw new InvalidOperationException("Config not available.");
        return Ok(cfg);
    }

    [HttpPost]
    public IActionResult Update([FromBody] ConfigUpdateDto incoming)
    {
        var plugin = JMSFusionPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
        var cfg = plugin.Configuration;
        if (incoming.AllowScriptExecution.HasValue)    cfg.AllowScriptExecution    = incoming.AllowScriptExecution.Value;
        if (incoming.EnableTrailerDownloader.HasValue) cfg.EnableTrailerDownloader = incoming.EnableTrailerDownloader.Value;
        if (incoming.EnableTrailerUrlNfo.HasValue)     cfg.EnableTrailerUrlNfo     = incoming.EnableTrailerUrlNfo.Value;

        if (!string.IsNullOrWhiteSpace(incoming.JFBase))        cfg.JFBase        = incoming.JFBase!;
        if (!string.IsNullOrWhiteSpace(incoming.JFApiKey))      cfg.JFApiKey      = incoming.JFApiKey!;
        if (!string.IsNullOrWhiteSpace(incoming.TmdbApiKey))    cfg.TmdbApiKey    = incoming.TmdbApiKey!;
        if (!string.IsNullOrWhiteSpace(incoming.PreferredLang)) cfg.PreferredLang = incoming.PreferredLang!;
        if (!string.IsNullOrWhiteSpace(incoming.FallbackLang))  cfg.FallbackLang  = incoming.FallbackLang!;

        if (!string.IsNullOrWhiteSpace(incoming.OverwritePolicy))
        {
            cfg.OverwritePolicy = incoming.OverwritePolicy!.ToLower() switch
            {
                "replace"   => OverwritePolicy.Replace,
                "if-better" => OverwritePolicy.IfBetter,
                _           => OverwritePolicy.Skip
            };
        }

        if (incoming.EnableThemeLink.HasValue) cfg.EnableThemeLink = incoming.EnableThemeLink.Value;
        if (!string.IsNullOrWhiteSpace(incoming.ThemeLinkMode)) cfg.ThemeLinkMode = incoming.ThemeLinkMode!;

        if (!string.IsNullOrWhiteSpace(incoming.IncludeTypes)) cfg.IncludeTypes = incoming.IncludeTypes!;
        if (incoming.PageSize.HasValue)                        cfg.PageSize     = incoming.PageSize.Value;
        if (incoming.SleepSecs.HasValue)                       cfg.SleepSecs    = incoming.SleepSecs.Value;
        if (!string.IsNullOrWhiteSpace(incoming.JFUserId))     cfg.JFUserId     = incoming.JFUserId!;

        plugin.UpdateConfiguration(cfg);

        return Ok(new { ok = true, saved = true, cfg });
    }
}
