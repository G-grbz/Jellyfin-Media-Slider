using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using IOFile = System.IO.File;

namespace JMSFusion.Controllers
{
    [ApiController]
    [Route("Plugins/JMSFusion/assets")]
    public class JMSFusionAssetsController : ControllerBase
    {
        private readonly ILogger<JMSFusionAssetsController> _logger;
        public JMSFusionAssetsController(ILogger<JMSFusionAssetsController> logger) => _logger = logger;

        [HttpGet("UiJs")]
        public IActionResult GetUiJs()
        {
            try
            {
                var asm = typeof(JMSFusionPlugin).Assembly;
                var ns = typeof(JMSFusionPlugin).Namespace;
                var resName = $"{ns}.Web.ui.js";

                using var stream = asm.GetManifestResourceStream(resName);
                if (stream == null) return NotFound();

                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                return File(ms.ToArray(), "application/javascript");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "UiJs error");
                return StatusCode(500, "Internal server error");
            }
        }
    }
}
