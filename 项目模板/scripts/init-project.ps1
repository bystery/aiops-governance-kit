[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Project,

    [Parameter(Mandatory = $true, Position = 1)]
    [string] $Name,

    [Parameter(Position = 2)]
    [string] $Host = "generic"
)

$ErrorActionPreference = "Stop"
$templateRoot = Split-Path -Parent $PSScriptRoot
$core = Join-Path $templateRoot "guanjia\bin\guanjia.mjs"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($null -eq $nodeCommand) {
    Write-Error "找不到 Node.js。请安装 Node.js 18+（推荐 22+）后重试。"
    exit 3
}
if (-not (Test-Path -LiteralPath $core -PathType Leaf)) {
    Write-Error "安装包不完整：找不到 $core"
    exit 3
}

& $nodeCommand.Source $core init --project $Project --name $Name --host $Host
exit $LASTEXITCODE
