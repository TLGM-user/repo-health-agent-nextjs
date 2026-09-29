# Build on F: — runbook (C: is full)

Measured 2026-09-29: **C: 10.2 GB free / F: 395.5 GB free**. All caches,
temps, and outputs below target `F:\build-cache\`.

## 1. One-time setup (per dev machine / CI agent)

```powershell
# From repo root — creates F:\build-cache layout, redirects User env + tool caches
powershell -ExecutionPolicy Bypass -File scripts/build-env/Configure-FBuildEnv.ps1
# Restart the shell afterwards so User env (TMP/TEMP/NPM_CONFIG_CACHE/…) applies.
```

What it does: `TMP/TEMP → F:\build-cache\tmp`, npm cache → `F:\build-cache\npm-cache`,
`NUGET_PACKAGES → F:\build-cache\nuget\packages`, `PIP_CACHE_DIR → F:\build-cache\pip-cache`,
`DOTNET_CLI_HOME → F:\build-cache\dotnet`. Repo-level pins: `.npmrc` (npm cache),
`nuget.config` (global packages + http/plugin caches), `Directory.Build.props`
(MSBuild `BaseIntermediateOutputPath`/`OutputPath` → `F:\build-cache\msbuild\<Project>\…`).

Antivirus (admin, one line): `Add-MpPreference -ExclusionPath 'F:\build-cache'`
— otherwise Defender scans every intermediate write. Verify `icacls F:\build-cache`
grants the build user `(M)`; `Validate-Space.ps1` probe-writes to confirm.

## 2. Every build (local + CI)

```powershell
# Fails fast with actionable log if F: missing/full or TMP drifted back to C:
powershell -ExecutionPolicy Bypass -File scripts/build-env/Validate-Space.ps1 -MinCFreeGB 3 -MinFFreeGB 5
# Full dry run: npm ci (F: cache) → lint → node tests → next build
powershell -ExecutionPolicy Bypass -File scripts/build-env/DryRun-Build.ps1
```

> `.next` intentionally stays on C:: Turbopack resolves build-time modules
> (e.g. `@tailwindcss/postcss`) relative to the output dir, so a junction to
> F: breaks the build (verified). `.next` is small (~100–300 MB); if C: cannot
> spare even that, relocate the whole checkout to `F:` instead.

Thresholds: warn if `C: < 3 GB`, fail if `F: < 5 GB` or `F:` not writable.
Logs: `F:\build-cache\logs\precheck-*.log`. Incremental builds reuse
`F:\build-cache\msbuild` + npm cache — nothing incremental lives on C:.
Relative references are safe: only absolute cache/temp roots moved; repo files
keep relative paths (`@/…`, `./…`).

## 3. Large tooling caches

| Tool | Move command |
|---|---|
| Docker Desktop | Settings → Resources → Disk image location → `F:\Docker`, or `wsl --export/shutdown` + re-import on F: |
| Visual Studio | `vs_enterprise.exe --installPath F:\VS --cache --installWhileDownloading`; workload cache via `--cache` on F: |
| MSBuild | Automatic via `Directory.Build.props` in repo root |
| NuGet / npm / pip / dotnet | Automatic via `nuget.config` / `.npmrc` / `Configure-FBuildEnv.ps1` |

## 4. CI agent workspace

`.github/workflows/ci.yml` gains a `precheck` job (`df -h`, fail under 5 GB,
`npm cache verify`). Self-hosted Windows runners: set agent work folder to
`F:\gh-agent\_work` at install (`config.cmd --work F:\gh-agent\_work`) and set
User env via `Configure-FBuildEnv.ps1` on the agent service account.

## 5. Cleanup / fallback policy

- `docker system prune -af --volumes` (weekly cron) → F: Docker growth.
- Purge `F:\build-cache\msbuild\*\bin\*` older than 14 days; keep npm cache (self-capping).
- Fallback: if `Validate-Space` fails, build aborts before `npm ci` — fix per
  log line (`free F:`, `re-run configure`, `mount F:`), never spill to C:.
- Never delete `C:\Users\ee\AppData\Local\Temp` blindly — only repo-owned
  `node_modules/.next` after a successful F: build.
