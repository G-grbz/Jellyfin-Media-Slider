using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;

namespace Jellyfin.Plugin.JMSFusion.Core;

public static class EmbeddedScriptRunner
{
    public static string ExtractResourceToTemp(string resourceName, string outFileName)
    {
        var asm = Assembly.GetExecutingAssembly();
        var full = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith(resourceName, StringComparison.OrdinalIgnoreCase));
        if (full == null) throw new InvalidOperationException($"Resource not found: {resourceName}");

        var tempDir = Path.Combine(Path.GetTempPath(), "jmsfusion-scripts");
        Directory.CreateDirectory(tempDir);
        var outPath = Path.Combine(tempDir, outFileName);

        using var src = asm.GetManifestResourceStream(full)!;
        using var dst = File.Create(outPath);
        src.CopyTo(dst);

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "/bin/chmod",
                ArgumentList = { "+x", outPath },
                RedirectStandardError = true,
                RedirectStandardOutput = true
            })?.WaitForExit();
        }
        catch { }

        return outPath;
    }

    public static async Task<(int code, string stdout, string stderr)> RunBashAsync(
        string scriptPath,
        IDictionary<string, string?> env,
        IEnumerable<string>? args = null,
        CancellationToken ct = default,
        Action<string, bool>? onLine = null)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "/usr/bin/env",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.ArgumentList.Add("bash");
        psi.ArgumentList.Add(scriptPath);
        if (args != null) foreach (var a in args) psi.ArgumentList.Add(a);
        foreach (var kv in env) psi.Environment[kv.Key] = kv.Value ?? "";

        using var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        using var so = new StringWriter();
        using var se = new StringWriter();
        p.OutputDataReceived += (_, e) =>
        {
            if (e.Data != null)
            {
                so.WriteLine(e.Data);
                onLine?.Invoke(e.Data, false);
            }
        };
        p.ErrorDataReceived += (_, e) =>
        {
            if (e.Data != null)
            {
                se.WriteLine(e.Data);
                onLine?.Invoke(e.Data, true);
            }
        };

        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();

        using var cancelReg = ct.Register(() =>
        {
            try
            {
                if (p.HasExited) return;
                if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    TrySendSignal(p.Id, "TERM");
                    _ = Task.Run(async () =>
                    {
                        await Task.Delay(2000);
                        if (!p.HasExited) { try { p.Kill(entireProcessTree: true); } catch { } }
                    });
                }
                else
                {
                    try { p.Kill(entireProcessTree: true); } catch { }
                }
            }
            catch { }
        });

        await p.WaitForExitAsync();
        return (p.ExitCode, so.ToString(), se.ToString());
    }

    private static void TrySendSignal(int pid, string signal)
    {
        try
        {
            using var kill = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "/bin/kill",
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    UseShellExecute = false
                }
            };
            kill.StartInfo.ArgumentList.Add("-" + signal);
            kill.StartInfo.ArgumentList.Add(pid.ToString());
            kill.Start();
            kill.WaitForExit(1000);
        }
        catch { }
    }
}
