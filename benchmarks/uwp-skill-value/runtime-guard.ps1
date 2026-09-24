param(
    [string] $RequestPath,
    [string] $ResultPath,
    [string] $JournalPath,
    [switch] $DefinitionsOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Initialize-NativeGuard {
    if ('TrialRuntime.ProcessLease' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace TrialRuntime {
    internal static class Native {
        [DllImport("kernel32.dll", SetLastError=true)]
        internal static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError=true)]
        internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
        internal static extern bool QueryFullProcessImageName(
            IntPtr process, uint flags, StringBuilder path, ref uint size);
        [DllImport("kernel32.dll", SetLastError=true)]
        internal static extern bool GetProcessTimes(
            IntPtr process, out long created, out long exited, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError=true)]
        internal static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError=true)]
        internal static extern bool TerminateProcess(IntPtr handle, uint exitCode);
        [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
        internal static extern uint GetFinalPathNameByHandle(
            SafeFileHandle handle, StringBuilder path, uint size, uint flags);
    }

    public sealed class ProcessLease : IDisposable {
        private IntPtr handle;
        public ProcessLease(int pid) {
            // Claim once; every subsequent query/termination uses this same handle.
            handle = Native.OpenProcess(0x1000 | 0x100000 | 0x1, false, pid);
            if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        public bool Exited {
            get {
                uint result = Native.WaitForSingleObject(handle, 0);
                if (result == 0) return true;
                if (result == 0x102) return false;
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
        }
        public string ImagePath {
            get {
                uint size = 32768;
                var path = new StringBuilder((int)size);
                if (!Native.QueryFullProcessImageName(handle, 0, path, ref size))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                return path.ToString();
            }
        }
        public DateTime CreatedUtc {
            get {
                long created, exited, kernel, user;
                if (!Native.GetProcessTimes(handle, out created, out exited, out kernel, out user))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                return DateTime.FromFileTimeUtc(created);
            }
        }
        public string Stop(uint waitMilliseconds) {
            if (Exited) return "exited";
            if (!Native.TerminateProcess(handle, 0)) {
                int error = Marshal.GetLastWin32Error();
                if (Exited) return "exited";
                throw new Win32Exception(error);
            }
            uint result = Native.WaitForSingleObject(handle, waitMilliseconds);
            if (result == 0) return "terminated";
            if (result == 0x102) throw new TimeoutException("Owned process did not exit");
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        public void Dispose() {
            if (handle != IntPtr.Zero) {
                Native.CloseHandle(handle);
                handle = IntPtr.Zero;
            }
        }
    }

    public sealed class ImageLease : IDisposable {
        private FileStream stream;
        public string FinalPath { get; private set; }
        public string Sha256 { get; private set; }
        public ImageLease(string path) {
            try {
                // No write/delete sharing: keep the hashed file fixed through stop.
                stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                var final = new StringBuilder(32768);
                uint length = Native.GetFinalPathNameByHandle(
                    stream.SafeFileHandle, final, (uint)final.Capacity, 0);
                if (length == 0 || length >= final.Capacity)
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                FinalPath = final.ToString();
                if (FinalPath.StartsWith(@"\\?\")) FinalPath = FinalPath.Substring(4);
                using (var sha = SHA256.Create()) {
                    Sha256 = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                }
            } catch { Dispose(); throw; }
        }
        public void Dispose() {
            if (stream != null) { stream.Dispose(); stream = null; }
        }
    }
}
'@
}

function Write-NewJson([string] $Path, $Value) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 20) + "`n")
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}

function Write-Event([string] $Kind, $Data) {
    $event = @{ at = [DateTimeOffset]::UtcNow.ToString('o'); kind = $Kind; data = $Data }
    $script:Journal.WriteLine(($event | ConvertTo-Json -Depth 15 -Compress))
    $script:Journal.Flush()
    $script:Journal.BaseStream.Flush($true)
}

function Block([string] $Reason) {
    $script:Result.status = 'blocked'
    $script:Result.manual_review = $true
    $script:Result.reasons.Add($Reason)
    Write-Event 'blocked' @{ reason = $Reason }
}

function Check-Deadline {
    if ($script:Clock.Elapsed.TotalSeconds -gt 75) { throw 'Guard deadline exceeded' }
}

function Deny-Ownership([string] $Reason) {
    throw (New-Object Security.SecurityException($Reason))
}

function Test-UnderTarget([string] $Path, [switch] $IncludeRoot) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    # Classify extended DOS paths as candidates, never silently ignore them.
    # The canonical/final-path checks subsequently approve or block them.
    if ($Path.StartsWith('\\?\')) { $Path = $Path.Substring(4) }
    return ($IncludeRoot -and $Path.Equals($script:Target, [StringComparison]::OrdinalIgnoreCase)) -or
        $Path.StartsWith($script:Target + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-Unlinked([string] $Path) {
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path.IndexOf(':', 2) -ge 0) {
        Deny-Ownership 'Path must be on a local drive without alternate streams'
    }
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.Equals($Path.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
        Deny-Ownership 'Noncanonical path'
    }
    $current = $full
    while ($current) {
        $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Deny-Ownership 'Linked/reparse path is not owned'
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
}

function Convert-PackageRecord($Package) {
    [ordered]@{
        Name = [string]$Package.Name
        PackageFullName = [string]$Package.PackageFullName
        PackageFamilyName = [string]$Package.PackageFamilyName
        Publisher = [string]$Package.Publisher
        InstallLocation = [string]$Package.InstallLocation
        IsFramework = [bool]$Package.IsFramework
        IsResourcePackage = [bool]$Package.IsResourcePackage
        IsBundle = [bool]$Package.IsBundle
        NonRemovable = [bool]$Package.NonRemovable
    }
}

function Get-TrialPackages {
    @(Get-AppxPackage -Name $script:Request.package_name -ErrorAction Stop |
        Where-Object { $_.Name.Equals($script:Request.package_name, [StringComparison]::OrdinalIgnoreCase) } |
        ForEach-Object { Convert-PackageRecord $_ })
}

function Get-TargetPackages {
    # Current user only. Unrelated registrations are neither retained nor logged.
    @(Get-AppxPackage -ErrorAction Stop |
        Where-Object { Test-UnderTarget ([string]$_.InstallLocation) -IncludeRoot } |
        ForEach-Object { Convert-PackageRecord $_ })
}

function Get-TargetPackageProblems($Packages) {
    foreach ($package in @($Packages)) {
        if (-not $package.Name.Equals($script:Request.package_name, [StringComparison]::OrdinalIgnoreCase)) {
            'unexpected_package_identity_under_target'
        }
        try { Assert-Unlinked $package.InstallLocation } catch {
            'ambiguous_target_package_path: ' + $_.Exception.Message
        }
    }
}

function Assert-TrialPackage($Packages) {
    if (@($script:Request.pre_packages).Count -ne 0) { throw 'preexisting_package_collision' }
    if (@($Packages).Count -eq 0) { return }
    if (@($Packages).Count -ne 1) { throw 'ambiguous_package_identity' }
    $package = @($Packages)[0]
    if (-not $package.Name.Equals($script:Request.package_name, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'package_name_mismatch'
    }
    if (-not $package.PackageFullName.StartsWith(
        $script:Request.package_name + '_', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'package_full_name_mismatch'
    }
    if ($script:Request.expected_publisher -and -not $package.Publisher.Equals(
        $script:Request.expected_publisher, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'package_publisher_mismatch'
    }
    if ($package.IsFramework -or $package.IsResourcePackage -or $package.IsBundle -or $package.NonRemovable) {
        throw 'package_is_not_a_removable_trial_app'
    }
    if (-not (Test-UnderTarget $package.InstallLocation)) {
        throw 'package_install_location_outside_target'
    }
    Assert-Unlinked $package.InstallLocation
    if (-not (Get-Item -LiteralPath $package.InstallLocation -Force).PSIsContainer) {
        throw 'package_install_location_not_directory'
    }
}

function Get-ProcessCandidates {
    # Never emit the global inventory: only matching target candidates reach evidence.
    @(Get-CimInstance Win32_Process -Property ProcessId, ExecutablePath, CreationDate -ErrorAction Stop)
}

function Open-ProcessLease([int] $ProcessId) { New-Object TrialRuntime.ProcessLease($ProcessId) }
function Open-ImageLease([string] $Path) { New-Object TrialRuntime.ImageLease($Path) }

function Get-OwnedProcesses {
    $claims = New-Object 'System.Collections.Generic.List[object]'
    foreach ($candidate in (Get-ProcessCandidates)) {
        Check-Deadline
        if (-not $candidate.ExecutablePath) {
            # Protected unrelated processes commonly lack a path. If the image name
            # could be an approved trial binary, ambiguity blocks instead of guessing.
            $probe = $null
            try {
                $probe = [Diagnostics.Process]::GetProcessById([int]$candidate.ProcessId)
                if ($script:ImageNames.Contains($probe.ProcessName + '.exe')) {
                    Block 'possible_trial_image_path_unavailable'
                }
            } catch [ArgumentException] {
                # The process exited between enumeration and probing.
            } catch {
                Block 'process_identity_probe_failed'
            } finally { if ($null -ne $probe) { $probe.Dispose() } }
            continue
        }
        if (-not (Test-UnderTarget $candidate.ExecutablePath)) { continue }
        if ($script:Result.processes.Count -ge 64) { throw 'Too many trial process candidates' }
        $record = [ordered]@{
            pid = [int]$candidate.ProcessId; image_path = [string]$candidate.ExecutablePath
            created_at = $null; status = 'observed'
        }
        $script:Result.processes.Add($record)
        Write-Event 'target_process_observed' $record
        $lease = $null
        $image = $null
        try {
            try { $lease = Open-ProcessLease $record.pid } catch {
                $stillPresent = @(Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $record.pid) `
                    -Property ProcessId -ErrorAction Stop)
                if ($stillPresent.Count -eq 0) {
                    $record.status = 'exited'
                    Write-Event 'process_exited_before_claim' $record
                    continue
                }
                throw
            }
            if ($lease.Exited) {
                $record.status = 'exited'
                Write-Event 'process_exited_before_claim' $record
                continue
            }
            $actual = $lease.ImagePath
            if (-not $actual.Equals($record.image_path, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-UnderTarget $actual)) { Deny-Ownership 'process_image_changed_before_claim' }
            Assert-Unlinked $actual
            $created = [DateTimeOffset]$lease.CreatedUtc
            $record.created_at = $created.ToUniversalTime().ToString('o')
            if ($created -lt $script:Started -or $created -gt $script:Ended) {
                Deny-Ownership 'process_creation_outside_trial_interval'
            }
            $relative = $actual.Substring($script:Target.Length + 1).ToLowerInvariant()
            if ([IO.Path]::GetExtension($actual) -ine '.exe' -or -not $script:Hashes.ContainsKey($relative)) {
                Deny-Ownership 'image_not_approved'
            }
            $image = Open-ImageLease $actual
            if (-not $image.FinalPath.Equals($actual, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-UnderTarget $image.FinalPath)) { Deny-Ownership 'image_final_path_mismatch' }
            if ($image.Sha256 -ine $script:Hashes[$relative]) { Deny-Ownership 'image_hash_mismatch' }
            $record.sha256 = $image.Sha256
            $record.status = 'owned'
            Write-Event 'ownership_claimed' $record
            $claims.Add(@{ process = $lease; image = $image; record = $record })
            $script:Leases.Add($lease)
            $script:Leases.Add($image)
            $lease = $null
            $image = $null
        } catch {
            $reason = $_.Exception.Message
            if ($_.Exception -isnot [Security.SecurityException] -and $null -ne $lease -and $lease.Exited) {
                $record.status = 'exited'
                $record.inspection_error = $reason
                Write-Event 'process_exited_during_validation' $record
            } else {
                $record.status = 'blocked'
                $record.reason = $reason
                Block $reason
            }
        } finally {
            if ($null -ne $image) { $image.Dispose() }
            if ($null -ne $lease) { $lease.Dispose() }
        }
    }
    return $claims.ToArray()
}

function Invoke-TrialCleanup {
    $packageProblems = New-Object 'System.Collections.Generic.List[string]'
    $script:Result.target_packages_before = @(Get-TargetPackages)
    Write-Event 'target_package_snapshot_before' $script:Result.target_packages_before
    foreach ($problem in @(Get-TargetPackageProblems $script:Result.target_packages_before)) {
        $packageProblems.Add($problem)
    }
    try { Assert-TrialPackage $script:Result.before_packages } catch {
        $packageProblems.Add($_.Exception.Message)
    }
    Initialize-NativeGuard
    for ($round = 0; $round -lt 3; $round++) {
        $claims = @(Get-OwnedProcesses)
        if ($script:Result.status -eq 'blocked') { return }
        if ($claims.Count -eq 0) { break }
        foreach ($claim in $claims) {
            Check-Deadline
            Write-Event 'stop_requested' $claim.record
            $claim.record.status = $claim.process.Stop(2000)
            if (-not $claim.process.Exited) { throw 'Owned process still alive after stop' }
            Write-Event 'process_stopped' $claim.record
        }
    }
    $remaining = @(Get-OwnedProcesses)
    if ($remaining.Count -ne 0) { Block 'trial_processes_remain_after_bounded_cleanup' }
    foreach ($problem in $packageProblems) { Block $problem }
    if ($script:Result.status -eq 'blocked') { return }
    # Exact identity/path snapshot must still match before any registration mutation.
    $targetPackages = @(Get-TargetPackages)
    foreach ($problem in @(Get-TargetPackageProblems $targetPackages)) { Block $problem }
    if ($script:Result.status -eq 'blocked') { return }
    $latest = @(Get-TrialPackages)
    Assert-TrialPackage $latest
    if (($latest | ConvertTo-Json -Depth 10 -Compress) -cne
        ($script:Result.before_packages | ConvertTo-Json -Depth 10 -Compress)) {
        throw 'package_identity_changed_during_cleanup'
    }
    if ($latest.Count -eq 1) {
        Check-Deadline
        $package = $latest[0]
        Assert-Unlinked $script:Target
        Assert-TrialPackage $latest
        Write-Event 'package_remove_requested' $package
        Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
        $script:Result.removed_package_full_name = $package.PackageFullName
        Write-Event 'package_removed' $package
    }
    $remaining = @(Get-OwnedProcesses)
    if ($remaining.Count -ne 0) { Block 'trial_process_appeared_during_package_cleanup' }
    if ($script:Result.status -ne 'blocked') { $script:Result.status = 'cleaned' }
}

if ($DefinitionsOnly) { return }

$script:Clock = [Diagnostics.Stopwatch]::StartNew()
$script:Leases = New-Object 'System.Collections.Generic.List[object]'
$script:Journal = $null
$script:Result = [ordered]@{
    version = 1; phase = $null; target = $null; package_name = $null
    status = 'blocked'; manual_review = $false
    reasons = (New-Object 'System.Collections.Generic.List[string]')
    processes = (New-Object 'System.Collections.Generic.List[object]')
    packages = $null; before_packages = $null; after_packages = $null
    target_packages_before = $null; target_packages_after = $null
    removed_package_full_name = $null
}
try {
    $journalStream = [IO.File]::Open(
        $JournalPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $script:Journal = New-Object IO.StreamWriter($journalStream, (New-Object Text.UTF8Encoding($false)))
    $script:Request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:Result.phase = $script:Request.phase
    $script:Result.target = $script:Request.target
    $script:Result.package_name = $script:Request.package_name
    $script:Target = [string]$script:Request.target
    if ($script:Request.version -ne 1 -or $script:Request.phase -notin @('prepare', 'cleanup')) {
        throw 'Invalid guard protocol'
    }
    if ($script:Request.package_name -notmatch
        '^UwpSkillValue\.([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') {
        throw 'Invalid unique trial package name'
    }
    Assert-Unlinked $script:Target
    if (-not (Get-Item -LiteralPath $script:Target -Force).PSIsContainer -or
        $script:Target -eq [IO.Path]::GetPathRoot($script:Target)) { throw 'Invalid target directory' }
    $script:Result.before_packages = @(Get-TrialPackages)
    Write-Event 'package_snapshot_before' $script:Result.before_packages
    if ($script:Request.phase -eq 'prepare') {
        $script:Result.packages = $script:Result.before_packages
        if ($script:Result.packages.Count -ne 0) { Block 'preexisting_package_collision' }
        else { $script:Result.status = 'ready' }
    } else {
        $script:Started = [DateTimeOffset]::Parse($script:Request.started_at)
        $script:Ended = [DateTimeOffset]::Parse($script:Request.ended_at)
        if ($script:Ended -lt $script:Started -or $script:Ended -gt [DateTimeOffset]::UtcNow) {
            throw 'Invalid actual trial interval'
        }
        $script:Hashes = @{}
        $script:ImageNames = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach ($property in $script:Request.approved_hashes.PSObject.Properties) {
            $relative = $property.Name
            if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains(':') -or
                $relative -match '(^|[\\/])(\.\.?|)([\\/]|$)' -or
                $relative -match '[ .]([\\/]|$)' -or $property.Value -notmatch '^[0-9a-f]{64}$') {
                throw 'Invalid approved image manifest'
            }
            $script:Hashes[$relative.ToLowerInvariant()] = [string]$property.Value
            if ([IO.Path]::GetExtension($relative) -ieq '.exe') {
                [void]$script:ImageNames.Add([IO.Path]::GetFileName($relative))
            }
        }
        $script:Result.status = 'checking'
        Invoke-TrialCleanup
    }
} catch {
    $script:Result.status = 'blocked'
    $script:Result.manual_review = $true
    $script:Result.reasons.Add($_.Exception.Message)
    if ($null -ne $script:Journal) { Write-Event 'exception' @{ reason = $_.Exception.Message } }
} finally {
    if ($null -ne $script:Journal -and $null -ne $script:Result.package_name) {
        try {
            $script:Result.after_packages = @(Get-TrialPackages)
            Write-Event 'package_snapshot_after' $script:Result.after_packages
            if ($script:Result.status -eq 'cleaned' -and $script:Result.after_packages.Count -ne 0) {
                Block 'trial_package_still_registered'
            }
            if ($script:Result.phase -eq 'prepare' -and
                ($script:Result.after_packages | ConvertTo-Json -Depth 10 -Compress) -cne
                ($script:Result.before_packages | ConvertTo-Json -Depth 10 -Compress)) {
                Block 'package_identity_changed_during_precheck'
            }
            if ($script:Result.phase -eq 'cleanup') {
                $script:Result.target_packages_after = @(Get-TargetPackages)
                Write-Event 'target_package_snapshot_after' $script:Result.target_packages_after
                foreach ($problem in @(Get-TargetPackageProblems $script:Result.target_packages_after)) {
                    Block $problem
                }
                if ($script:Result.status -eq 'cleaned' -and $script:Result.target_packages_after.Count -ne 0) {
                    Block 'target_package_still_registered'
                }
            }
        } catch {
            $script:Result.status = 'blocked'
            $script:Result.manual_review = $true
            $script:Result.reasons.Add('Post-snapshot failed: ' + $_.Exception.Message)
        }
    }
    foreach ($lease in $script:Leases) { $lease.Dispose() }
    if ($null -ne $script:Journal) { $script:Journal.Dispose() }
    Write-NewJson $ResultPath $script:Result
}
