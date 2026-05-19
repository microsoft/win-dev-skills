using System.Diagnostics;

/// <summary>
/// Stale-while-revalidate refresher for the on-disk cache under
/// <c>%LOCALAPPDATA%\winui-search\cache\</c>.
///
/// Hot path commands (search/get/list/debug) call <see cref="TryKickoffIfStale"/>
/// after they've answered the user. If the cache hasn't been refreshed from
/// GitHub in <see cref="StaleThreshold"/>, this spawns a detached child
/// <c>winui-search update --background</c> that runs the GitHub fetch and
/// updates the cache. The hot-path process returns immediately; the child
/// outlives it (Windows does not auto-kill children of an exiting parent).
///
/// Concurrency safety:
///   - <c>update.lock</c>: atomic <c>FileMode.CreateNew</c> ensures only one
///     simultaneous spawn wins the race; others see <see cref="IOException"/>
///     and skip silently.
///   - 10-minute TTL on the lock reaps orphans from crashed children.
///   - <c>last-attempt.txt</c>: rate-limits retry to 1 hour after a failed
///     attempt (otherwise a GitHub outage would re-spawn on every search).
///
/// Disable per-process by setting <c>WINUI_SEARCH_NO_BACKGROUND=1</c>.
/// Enable trace logging to <c>%LOCALAPPDATA%\winui-search\cache\background.log</c>
/// by setting <c>WINUI_SEARCH_DEBUG=1</c>.
/// </summary>
internal static class BackgroundUpdater
{
    public const string BackgroundFlag = "--background";

    private static readonly TimeSpan StaleThreshold = TimeSpan.FromDays(7);
    private static readonly TimeSpan RetryAfterFailure = TimeSpan.FromHours(1);
    private static readonly TimeSpan LockTtl = TimeSpan.FromMinutes(10);

    private static readonly string CacheRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "winui-search", "cache");

    private static readonly string LockFile = Path.Combine(CacheRoot, "update.lock");
    private static readonly string LastSuccessFile = Path.Combine(CacheRoot, "last-github-update.txt");
    private static readonly string LastAttemptFile = Path.Combine(CacheRoot, "last-github-attempt.txt");

    /// <summary>True if the current process was launched as a background updater child.</summary>
    public static bool IsBackgroundInvocation(string[] args) =>
        args.Any(a => string.Equals(a, BackgroundFlag, StringComparison.Ordinal));

    private static bool IsDisabled() =>
        IsTruthy(Environment.GetEnvironmentVariable("WINUI_SEARCH_NO_BACKGROUND"));

    /// <summary>
    /// Treat <c>1</c>, <c>true</c>, <c>yes</c>, <c>on</c> (case-insensitive) as enabled.
    /// Anything else — including <c>0</c>, <c>false</c>, empty, or unset — is disabled.
    /// Matches the documented <c>=1</c> contract and avoids the surprise of <c>=0</c>
    /// turning a flag on.
    /// </summary>
    private static bool IsTruthy(string? value) =>
        value is not null &&
        (value.Equals("1", StringComparison.Ordinal) ||
         value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
         value.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
         value.Equals("on", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Spawn a detached <c>winui-search update --background</c> if cache hasn't been
    /// refreshed from GitHub in <see cref="StaleThreshold"/> and no other update is
    /// in flight or recently attempted. Returns immediately; the child runs detached.
    /// Best-effort: any failure is swallowed so the hot path is never affected.
    /// </summary>
    public static void TryKickoffIfStale()
    {
        try
        {
            if (IsDisabled()) return;

            var lastSuccess = ReadTimestamp(LastSuccessFile);
            if (lastSuccess.HasValue && DateTime.UtcNow - lastSuccess.Value < StaleThreshold)
                return; // cache is fresh enough

            var lastAttempt = ReadTimestamp(LastAttemptFile);
            if (lastAttempt.HasValue && DateTime.UtcNow - lastAttempt.Value < RetryAfterFailure)
                return; // recent attempt — back off

            if (!TryAcquireLock()) return;

            // Lock acquired; spawn the child. The child clears the lock when done.
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exePath))
            {
                ReleaseLock();
                return;
            }

            DebugLog($"Spawning child: {exePath} update {BackgroundFlag}");
            var psi = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = $"update {BackgroundFlag}",
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
                // IMPORTANT: do NOT redirect stdio. With redirected pipes the parent
                // implicitly waits for the child's stdout/stderr to close on exit,
                // defeating the whole point of fire-and-forget. The child uses
                // BackgroundFlag to stay silent on Console (writes only to its log file).
            };

            var child = Process.Start(psi);
            if (child == null)
            {
                DebugLog("Process.Start returned null");
                ReleaseLock();
                return;
            }
            DebugLog($"Spawned child PID={child.Id}");
            // Dispose the Process handle immediately so the parent doesn't track the child.
            child.Dispose();
            // Do NOT WaitForExit — child runs detached, parent returns now.
        }
        catch (Exception ex)
        {
            DebugLog($"TryKickoffIfStale failed: {ex.GetType().Name}: {ex.Message}");
            try { ReleaseLock(); } catch { /* ignore */ }
        }
    }

    /// <summary>Mark a successful GitHub refresh. Called by the background child after success.</summary>
    public static void MarkSuccess()
    {
        try
        {
            Directory.CreateDirectory(CacheRoot);
            var now = DateTime.UtcNow.ToString("o");
            File.WriteAllText(LastSuccessFile, now);
            File.WriteAllText(LastAttemptFile, now);
            DebugLog($"MarkSuccess @ {now}");
        }
        catch { /* best-effort */ }
    }

    /// <summary>Mark a failed GitHub refresh attempt for retry rate-limiting.</summary>
    public static void MarkAttempt()
    {
        try
        {
            Directory.CreateDirectory(CacheRoot);
            File.WriteAllText(LastAttemptFile, DateTime.UtcNow.ToString("o"));
            DebugLog("MarkAttempt (failure)");
        }
        catch { /* best-effort */ }
    }

    /// <summary>Release the spawn lock. Called by the background child in finally.</summary>
    public static void ReleaseLock()
    {
        try { if (File.Exists(LockFile)) File.Delete(LockFile); } catch { /* best-effort */ }
        DebugLog("ReleaseLock");
    }

    private static readonly bool DebugEnabled =
        IsTruthy(Environment.GetEnvironmentVariable("WINUI_SEARCH_DEBUG"));

    private static void DebugLog(string msg)
    {
        if (!DebugEnabled) return;
        try
        {
            Directory.CreateDirectory(CacheRoot);
            var line = $"[{DateTime.UtcNow:HH:mm:ss.fff}] PID={Environment.ProcessId} {msg}\n";
            File.AppendAllText(Path.Combine(CacheRoot, "background.log"), line);
        }
        catch { /* best-effort */ }
    }

    /// <summary>Public surface for diagnostic logs from outside this class.</summary>
    public static void DebugLogPublic(string msg) => DebugLog(msg);

    /// <summary>
    /// Parse a round-trip ("o" format) timestamp from <paramref name="path"/>, returning a
    /// UTC <see cref="DateTime"/> or <c>null</c> if the file is missing/unreadable/unparseable.
    /// Uses <see cref="CultureInfo.InvariantCulture"/> + <see cref="DateTimeStyles.RoundtripKind"/>
    /// so timezone (Z) info is preserved and parsing succeeds in every locale.
    /// </summary>
    public static DateTime? ReadTimestamp(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var text = File.ReadAllText(path).Trim();
            if (DateTime.TryParse(
                text,
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.RoundtripKind,
                out var dt))
            {
                return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
            }
            return null;
        }
        catch { return null; }
    }

    /// <summary>
    /// Write <paramref name="contents"/> to <paramref name="path"/> via a temp file
    /// + <see cref="File.Move(string, string, bool)"/> rename. The rename is atomic
    /// on Windows for same-volume moves, so a crash mid-write can never leave a
    /// truncated/corrupted file at <paramref name="path"/> — readers either see the
    /// previous contents or the full new contents, never a partial write. Use this
    /// for every cache file (scenarios.json, tags.json, schema-version.txt, etc.)
    /// so a process crash during refresh doesn't pin users to embedded fallback.
    /// </summary>
    public static void AtomicWriteAllText(string path, string contents)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, contents);
        File.Move(tmp, path, overwrite: true);
    }

    /// <summary>
    /// Try to atomically acquire the spawn lock. Returns true if this process now
    /// owns the lock (caller is responsible for calling <see cref="ReleaseLock"/>).
    /// Returns false if another process owns it (foreground caller should either
    /// proceed without the lock or back off, depending on its semantics).
    /// </summary>
    public static bool TryAcquireLock() => TryAcquireLockInternal();

    private static bool TryAcquireLockInternal()
    {
        try
        {
            Directory.CreateDirectory(CacheRoot);

            // Reap stale lock from a crashed previous child.
            if (File.Exists(LockFile))
            {
                var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(LockFile);
                if (age > LockTtl)
                {
                    try { File.Delete(LockFile); }
                    catch { return false; }
                }
                else
                {
                    return false; // Another process owns it.
                }
            }

            // Atomic create-or-fail. Only one process wins.
            using var fs = new FileStream(LockFile, FileMode.CreateNew,
                FileAccess.Write, FileShare.Read);
            using var writer = new StreamWriter(fs);
            writer.Write($"{Environment.ProcessId}@{DateTime.UtcNow:o}");
            return true;
        }
        catch (IOException)
        {
            return false; // Another process won the create-race.
        }
        catch
        {
            return false;
        }
    }
}
