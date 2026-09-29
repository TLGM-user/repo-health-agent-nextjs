#Requires -Version 5.1
<#
.SYNOPSIS Dry-run build targeting F: — validates space, caches, TS, Next build.
No C: writes except source checkout itself.
#>
$ErrorActionPreference = "Stop"
$env:TMP = "F:\build-cache\tmp"; $env:TEMP = "F:\build-cache\tmp"
$env:NEXT_TELEMETRY_DISABLED = "1"

powershell -File "$PSScriptRoot\Validate-Space.ps1" -MinCFreeGB 3 -MinFFreeGB 5
if ($LASTEXITCODE -ne 0) { throw "Pre-check failed — see F:\build-cache\logs" }

# NOTE: Next.js/Turbopack requires .next under the project root — a junction
# to F: breaks PostCSS module resolution at build time (verified 2026-09-29).
# .next stays on C: (small, ~100-300MB); all caches, TMP, and MSBuild outputs
# live on F:. If C: is critically low, move the whole checkout to F: instead.

Write-Host "== npm ci (cache on F:) ==" -ForegroundColor Cyan
npm ci --cache "F:\build-cache\npm-cache" --prefer-offline --no-audit --no-fund
Write-Host "== lint ==" -ForegroundColor Cyan
npm run lint
Write-Host "== tests (janitor) ==" -ForegroundColor Cyan
npm test
Write-Host "== next build (.next stays on C: by Turbopack requirement; caches on F:) ==" -ForegroundColor Cyan
npm run build
Write-Host "DRY-RUN PASS. Outputs/caches on F:. Logs: F:\build-cache\logs" -ForegroundColor Green
