<#
.SYNOPSIS
    Generates a pre-filled GitHub issue URL for reporting unresolved development problems.

.DESCRIPTION
    Constructs a GitHub "new issue" URL with pre-filled title and body.
    The user clicks the link to open GitHub's issue editor where they can review,
    edit, and submit.

    No GitHub CLI or authentication is required — only a browser with GitHub login.

    If the generated URL exceeds GitHub's practical limit (~8,000 characters),
    the script outputs a truncated URL and prints the full body as fallback.

.PARAMETER Title
    The issue title. Will be used as-is (caller should add [Agent Report] prefix).

.PARAMETER BodyFile
    Path to a Markdown file containing the issue body.

.PARAMETER Repo
    Target GitHub repository in owner/repo format. Default: microsoft/WindowsAppSdkResources

.EXAMPLE
    .\generate-issue-url.ps1 -Title "[Agent Report] Build fails with CS0234" -BodyFile ".\issue-body.md"

.EXAMPLE
    .\generate-issue-url.ps1 -Title "[Agent Report] API discrepancy" -BodyFile ".\body.md" -Repo "microsoft/WindowsAppSDK"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$BodyFile,

    [string]$Repo = "microsoft/WindowsAppSdkResources"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Read and validate body file
$body = Get-Content -Path $BodyFile -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($body)) {
    Write-Error "Issue body file is empty: $BodyFile"
    exit 1
}

# URL-encode a string (RFC 3986)
function ConvertTo-UrlEncoded {
    param([string]$Text)
    [System.Uri]::EscapeDataString($Text)
}

# Build the pre-filled issue URL
$encodedTitle = ConvertTo-UrlEncoded $Title
$encodedBody = ConvertTo-UrlEncoded $body

$baseUrl = "https://github.com/$Repo/issues/new"
$fullUrl = "${baseUrl}?title=${encodedTitle}&body=${encodedBody}"

# GitHub has a practical URL length limit (~8,192 characters)
$maxUrlLength = 8192

Write-Host ""
Write-Host "=== GitHub Issue URL Generator ===" -ForegroundColor Cyan
Write-Host "Title : $Title" -ForegroundColor White
Write-Host "Repo  : $Repo" -ForegroundColor White
Write-Host "Body  : $($body.Length) chars ($BodyFile)" -ForegroundColor White
Write-Host "URL   : $($fullUrl.Length) chars" -ForegroundColor White
Write-Host ""

if ($fullUrl.Length -le $maxUrlLength) {
    # URL is within limits — output it
    Write-Host "Pre-filled issue URL:" -ForegroundColor Green
    Write-Host ""
    Write-Host $fullUrl
    Write-Host ""
} else {
    # URL exceeds limit — truncate body and provide fallback
    Write-Warning "Generated URL is $($fullUrl.Length) chars, exceeding the ~$maxUrlLength char limit."
    Write-Warning "The issue body will be truncated in the URL. Full body printed below as fallback."
    Write-Host ""

    # Calculate how much body we can fit
    $urlWithoutBody = "${baseUrl}?title=${encodedTitle}&body="
    $availableChars = $maxUrlLength - $urlWithoutBody.Length
    $truncationNote = "`n`n---`n*Issue body was truncated due to URL length limits. Please paste the full content from the terminal output below.*"
    $encodedNote = ConvertTo-UrlEncoded $truncationNote
    $availableForBody = $availableChars - $encodedNote.Length

    # Truncate the body and re-encode
    if ($availableForBody -gt 200) {
        # Binary search for the right truncation point (encoding changes length unpredictably)
        $low = 0
        $high = $body.Length
        $bestTruncated = ""
        while ($low -le $high) {
            $mid = [math]::Floor(($low + $high) / 2)
            $candidate = $body.Substring(0, $mid)
            $encoded = ConvertTo-UrlEncoded $candidate
            if ($encoded.Length -le $availableForBody) {
                $bestTruncated = $candidate
                $low = $mid + 1
            } else {
                $high = $mid - 1
            }
        }
        $truncatedBody = $bestTruncated + $truncationNote
        $encodedTruncatedBody = ConvertTo-UrlEncoded $truncatedBody
        $truncatedUrl = "${baseUrl}?title=${encodedTitle}&body=${encodedTruncatedBody}"

        Write-Host "Truncated issue URL (partial body):" -ForegroundColor Yellow
        Write-Host ""
        Write-Host $truncatedUrl
        Write-Host ""
    } else {
        # Can't fit any meaningful body — URL with title only
        $titleOnlyUrl = "${baseUrl}?title=${encodedTitle}"
        Write-Host "Title-only issue URL (paste body manually):" -ForegroundColor Yellow
        Write-Host ""
        Write-Host $titleOnlyUrl
        Write-Host ""
    }

    Write-Host "--- FULL ISSUE BODY (copy and paste into GitHub) ---" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host $body
    Write-Host ""
    Write-Host "--- END OF ISSUE BODY ---" -ForegroundColor DarkGray
}

exit 0
