#Requires -Version 5.1
<#
.SYNOPSIS
  Redirects TMP/TEMP + toolchain caches to F: and validates write access.
.DESCRIPTION
  Idempotent. Sets User-level env (no admin needed), creates F:\build-cache
  layout, configures npm/dotnet/NuGet/pip caches, and verifies AV exclusions guidance.
#>
$ErrorActionPreference = "Stop"
$FRoot = "F:\build-cache"
$Dirs = @("tmp", "npm-cache", "pip-cache", "nuget\packages", "nuget\v3-cache",
  "dotnet", "msbuild", "next", "node-tmp", "logs")

foreach ($d in $Dirs) {
  $p = Join-Path $FRoot $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

# 1. Session + User env for temp (avoids C:\Users\ee\AppData\Local\Temp pressure)
$env:TMP = "$FRoot\tmp"; $env:TEMP = "$FRoot\tmp"
[Environment]::SetEnvironmentVariable("TMP", "$FRoot\tmp", "User")
[Environment]::SetEnvironmentVariable("TEMP", "$FRoot\tmp", "User")

# 2. Toolchain caches
$env:NPM_CONFIG_CACHE = "$FRoot\npm-cache"
$env:PIP_CACHE_DIR = "$FRoot\pip-cache"
$env:NUGET_PACKAGES = "$FRoot\nuget\packages"
$env:DOTNET_CLI_HOME = "$FRoot\dotnet"
$env:NEXT_TELEMETRY_DISABLED = "1"
[Environment]::SetEnvironmentVariable("NPM_CONFIG_CACHE", "$FRoot\npm-cache", "User")
[Environment]::SetEnvironmentVariable("PIP_CACHE_DIR", "$FRoot\pip-cache", "User")
[Environment]::SetEnvironmentVariable("NUGET_PACKAGES", "$FRoot\nuget\packages", "User")
[Environment]::SetEnvironmentVariable("DOTNET_CLI_HOME", "$FRoot\dotnet", "User")

npm config set cache "$FRoot\npm-cache" --location=user 2>$null
dotnet nuget locals all --clear 2>$null | Out-Null
pip config set global.cache-dir "$FRoot\pip-cache" 2>$null

# 3. Write-permission check
$probe = Join-Path $FRoot "tmp\write-test-$PID.tmp"
"ok" | Out-File $probe -Encoding ascii
Remove-Item $probe -Force

# 4. AV exclusion guidance (needs admin — print, don't fail)
Write-Host "ADD Defender exclusions (admin): $FRoot, F:\build-cache\msbuild" -ForegroundColor Yellow
Write-Host "  Add-MpPreference -ExclusionPath 'F:\build-cache'" -ForegroundColor DarkGray
Write-Host "F-build env configured. Restart shell/CI agent to pick up User env." -ForegroundColor Green
