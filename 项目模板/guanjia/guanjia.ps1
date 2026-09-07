[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$core = Join-Path $PSScriptRoot "bin\guanjia.mjs"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($null -eq $nodeCommand) {
    Write-Error "找不到 Node.js。请安装 Node.js 18+（推荐 22+）后重试。"
    exit 3
}
if (-not (Test-Path -LiteralPath $core -PathType Leaf)) {
    Write-Error "管家安装不完整：找不到 $core"
    exit 3
}

& $nodeCommand.Source $core @Arguments --project $projectRoot
exit $LASTEXITCODE
