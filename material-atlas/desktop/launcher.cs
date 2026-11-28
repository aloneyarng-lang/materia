using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyVersion("4.0.0.0")]
[assembly: AssemblyFileVersion("4.0.0.0")]
[assembly: AssemblyTitle("Materia")]
[assembly: AssemblyProduct("Materia")]
[assembly: AssemblyDescription("Materia · 材料文献星图")]
[assembly: AssemblyCompany("Materia")]

// A branded portable entry point for the current source workspace or a packaged install.
internal static class MateriaLauncher
{
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            result.Append(character); slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    [STAThread]
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string source = Path.Combine(root, "material-atlas");
        string runtime = Path.Combine(source, "node_modules", "electron", "dist", "electron.exe");
        bool fromSource = File.Exists(runtime) && File.Exists(Path.Combine(source, "desktop", "main.mjs")) && File.Exists(Path.Combine(source, "package.json"));
        string target = Path.Combine(root, "material-atlas", "release", "current", "Materia-win32-x64", "Materia.exe");
        bool installed = fromSource || (File.Exists(target) && File.Exists(Path.Combine(Path.GetDirectoryName(target), "resources", "app", "package.json")));
        if (args.Length == 1 && args[0] == "--check-install") return installed ? 0 : 2;
        if (!installed)
        {
            MessageBox.Show("找不到 Materia 程序，请保留完整的 materia 文件夹。\n\n" + target, "Materia", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }
        try
        {
            string[] quoted = Array.ConvertAll(args, Quote);
            var start = new ProcessStartInfo(fromSource ? runtime : target,
                (fromSource ? Quote(source) + " " : "") + String.Join(" ", quoted)) {
                WorkingDirectory = fromSource ? source : Path.GetDirectoryName(target), UseShellExecute = false,
                CreateNoWindow = true
            };
            if (fromSource && String.IsNullOrEmpty(Environment.GetEnvironmentVariable("MATERIA_PROFILE_DIR")))
                start.EnvironmentVariables["MATERIA_PROFILE_DIR"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Materia");
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(start);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("Materia 无法启动：" + error.Message, "Materia", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
