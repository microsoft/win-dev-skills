<#
.SYNOPSIS
  Export a copilot session from build-events.jsonl to a readable text file.

.PARAMETER Path
  Path to build-events.jsonl (or any *-events.jsonl file).

.PARAMETER OutFile
  Output file path. Defaults to "copilot-full-output.txt" next to the input file.

.EXAMPLE
  .\export-session.ps1 C:\ado\win-dev-skills\agent-benchmark\results\run3\fes83_poc-v2_s46_i1\build-events.jsonl
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [string] $Path,

    [string] $OutFile
)

if (-not (Test-Path $Path)) {
    Write-Error "File not found: $Path"
    exit 1
}

if (-not $OutFile) {
    $OutFile = Join-Path (Split-Path $Path) "copilot-full-output.txt"
}

$out = [System.Collections.Generic.List[string]]::new()

Get-Content $Path | ForEach-Object {
    $e = $_ | ConvertFrom-Json
    switch ($e.type) {
        'assistant.turn_start' {
            $out.Add("`n=== TURN $($e.data.turnId) ===`n")
        }
        'assistant.reasoning_delta' {
            if ($e.data.deltaContent) { $out.Add($e.data.deltaContent) }
        }
        'assistant.message_delta' {
            if ($e.data.deltaContent) { $out.Add($e.data.deltaContent) }
        }
        'assistant.message' {
            if ($e.data.toolRequests.Count -gt 0) {
                foreach ($tr in $e.data.toolRequests) {
                    $out.Add("`n--- TOOL: $($tr.name) ---`n")
                    if ($tr.arguments) {
                        $out.Add(($tr.arguments | ConvertTo-Json -Depth 3 -Compress) + "`n")
                    }
                }
            }
        }
        'tool.execution_complete' {
            if ($e.data.result.content) {
                $out.Add("--- RESULT ---`n$($e.data.result.content)`n")
            }
        }
        'subagent.started' {
            $out.Add("`n=== SUB-AGENT STARTED: $($e.data.agentDisplayName ?? $e.data.agentName ?? 'unknown') ===`n")
        }
        'subagent.completed' {
            $out.Add("`n=== SUB-AGENT COMPLETED: $($e.data.model) ($($e.data.totalTokens) tokens, $($e.data.durationMs)ms) ===`n")
        }
        'subagent.failed' {
            $out.Add("`n=== SUB-AGENT FAILED: $($e.data.model) ($($e.data.totalTokens) tokens, $($e.data.durationMs)ms) ===`n")
        }
        'result' {
            $out.Add("`n=== SESSION END ===`n")
            $out.Add("Premium requests: $($e.usage.premiumRequests)`n")
            $out.Add("API time: $($e.usage.totalApiDurationMs)ms`n")
            $out.Add("Session time: $($e.usage.sessionDurationMs)ms`n")
            if ($e.usage.codeChanges) {
                $out.Add("Code changes: +$($e.usage.codeChanges.linesAdded) -$($e.usage.codeChanges.linesRemoved)`n")
            }
        }
    }
}

$out -join '' | Out-File -Encoding utf8 $OutFile
$size = (Get-Item $OutFile).Length
Write-Host "Exported to $OutFile ($size bytes)"
