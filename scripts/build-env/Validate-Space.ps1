#Requires -Version 5.1
<#
.SYNOPSIS Pre-check: fails fast if C: is too full or F: not writable.
Usage: powershell -File scripts/build-env/Validate-Space.ps1 -MinCFreeGB 5 -MinFFreeGB 10
#>
param([int]$MinCFreeGB = 5, [int]$MinFFreeGB = 10)
$ErrorActionPreference = "Stop"
$logDir = "F:\build-cache\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir ("precheck-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
function Log($m) { $m | Tee-Object -FilePath $log -Append }

$c = Get-PSDrive C; $f = Get-PSDrive F -ErrorAction SilentlyContinue
if (-not $f) { Log "FAIL: F: not mounted"; exit 2 }
$cFree = [math]::Round($c.Free / 1GB, 2); $fFree = [math]::Round($f.Free / 1GB, 2)
Log "C: free=${cFree}GB (min $MinCFreeGB) | F: free=${fFree}GB (min $MinFFreeGB)"
Log "TMP=$env:TMP TEMP=$env:TEMP NPM_CONFIG_CACHE=$env:NPM_CONFIG_CACHE NUGET_PACKAGES=$env:NUGET_PACKAGES"

$fail = $false
if ($cFree -lt $MinCFreeGB) { Log 'WARN: C below threshold - enforce F outputs, clean node_modules/.next on C:'; }
if ($fFree -lt $MinFFreeGB) { Log 'FAIL: F below threshold - run cleanup'; $fail = $true }
try { "ok" | Out-File "F:\build-cache\tmp\probe-$($PID).tmp"; Remove-Item "F:\build-cache\tmp\probe-$($PID).tmp" }
catch { Log "FAIL: F: not writable."; $fail = $true }
if ($env:TMP -like 'C:*' -or $env:TEMP -like 'C:*') { Log 'WARN: TMP/TEMP still on C - run Configure-FBuildEnv.ps1' }

if ($fail) { Log 'REMEDIATION: free F (docker prune, old msbuild bins), re-run configure.'; exit 2 }
Log 'PASS'; exit 0
