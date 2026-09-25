$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot '..\Get-WinUIDefaultStyle.ps1'
$fixturePath = Join-Path ([System.IO.Path]::GetTempPath()) "winui-default-styles-$([guid]::NewGuid()).xaml"

try {
    @'
<ResourceDictionary
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Style x:Key="CommandBarWithoutRevealStyle" TargetType="CommandBar">
    <Style.Resources>
      <Style x:Key="NestedButtonStyle" TargetType="Button" />
    </Style.Resources>
    <Setter Property="IsOpen" Value="False" />
  </Style>
  <Style x:Key="CommandBarRevealStyle"
         TargetType="CommandBar"
         BasedOn="{StaticResource CommandBarWithoutRevealStyle}" />
</ResourceDictionary>
'@ | Set-Content -LiteralPath $fixturePath -Encoding utf8

    $withoutReveal = & $scriptPath -StyleKey CommandBarWithoutRevealStyle -GenericXamlPath $fixturePath
    if ($withoutReveal -notmatch 'NestedButtonStyle' -or
        $withoutReveal -match 'x:Key="CommandBarRevealStyle"') {
        throw 'CommandBarWithoutRevealStyle extraction did not stop after its outer Style.'
    }

    $reveal = & $scriptPath -StyleKey CommandBarRevealStyle -GenericXamlPath $fixturePath
    if ($reveal -notmatch 'x:Key="CommandBarRevealStyle"' -or
        $reveal -notmatch '/>') {
        throw 'Self-closing CommandBarRevealStyle extraction failed.'
    }

    Write-Output 'Get-WinUIDefaultStyle regression tests passed.'
} finally {
    Remove-Item -LiteralPath $fixturePath -ErrorAction SilentlyContinue
}
