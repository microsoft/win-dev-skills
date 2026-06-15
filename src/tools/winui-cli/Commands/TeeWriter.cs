namespace WinUi.Cli.Commands;

// Writes every call to two underlying TextWriters. Used by the verb wrappers to
// stream stderr live to the console while also capturing it for exit-code
// re-classification (BENCH-2).
internal sealed class TeeWriter : TextWriter
{
    private readonly TextWriter _a;
    private readonly TextWriter _b;

    public TeeWriter(TextWriter a, TextWriter b) { _a = a; _b = b; }

    public override System.Text.Encoding Encoding => _a.Encoding;

    public override void Write(char value) { _a.Write(value); _b.Write(value); }
    public override void Write(string? value) { _a.Write(value); _b.Write(value); }
    public override void WriteLine(string? value) { _a.WriteLine(value); _b.WriteLine(value); }
    public override void Flush() { _a.Flush(); _b.Flush(); }
}
