using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

// A portable root entry point. Electron and its resources stay together below release/current.
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
        string target = Path.Combine(root, "material-atlas", "release", "current", "Materia-win32-x64", "Materia.exe");
        bool installed = File.Exists(target) && File.Exists(Path.Combine(Path.GetDirectoryName(target), "resources", "app", "package.json"));
        if (args.Length == 1 && args[0] == "--check-install") return installed ? 0 : 2;
        if (!installed)
        {
            MessageBox.Show("找不到 Materia 程序，请保留完整的 materia 文件夹。\n\n" + target, "Materia", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }
        try
        {
            string[] quoted = Array.ConvertAll(args, Quote);
            Process.Start(new ProcessStartInfo(target, String.Join(" ", quoted)) {
                WorkingDirectory = Path.GetDirectoryName(target), UseShellExecute = false
            });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show("Materia 无法启动：" + error.Message, "Materia", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
