# Research: WSL containers (wslc.exe, GA in WSL 3.0.1) on a hosted Windows runner, with no distro and no Docker.
# Is it there, is its stdin a byte-exact pipe, can a container reach the Windows host's 127.0.0.1 through
# host.wslc.internal, and can the raw CDP driver run through it?
#   windows-wslc.ps1 -Out <dir>
param([string]$Out)
$ErrorActionPreference = 'Continue'
$H = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null
function Log($m) { Write-Output "### $m $(Get-Date -Format HH:mm:ss)" }
$tag = $env:TAG
Log 'wslc'
(Get-Command wslc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source) ?? 'wslc not on PATH' | Write-Output
foreach ($a in @('--version'), @('--help'), @('run', '--help')) { Write-Output "> wslc $a"; (wslc @a 2>&1 | Out-String) -replace "`0", '' | Write-Output }
Log 'pull'
$t = [Diagnostics.Stopwatch]::StartNew()
wslc pull $tag 2>&1 | Select-Object -Last 5 | Write-Output
Write-Output "pull took $([math]::Round($t.Elapsed.TotalSeconds)) s"
wslc image ls 2>&1 | Write-Output
Log 'pipe probe'
node "$H/pipe-probe.mjs" wslc wslc run --rm -i $tag cat | Tee-Object -Append "$Out/pipe.txt"
Log 'reach probe'
$env:VC_DOCKER = '["wslc"]'
node "$H/reach-probe.mjs" wslc $tag host.wslc.internal - | Tee-Object -Append "$Out/reach.txt"
node "$H/reach-probe.mjs" wslc-docker-name $tag host.docker.internal - | Tee-Object -Append "$Out/reach.txt"
Log 'capture through wslc'
$serve = Start-Process node -ArgumentList "$H/serve.mjs", "$env:GITHUB_WORKSPACE/sb/storybook", '6400', '127.0.0.1' -RedirectStandardOutput "$Out/serve.log" -PassThru -WindowStyle Hidden
while (-not (Select-String -Path "$Out/serve.log" -Pattern serving -Quiet -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }
$env:VC_HOST_NAME = 'host.wslc.internal'
$env:VC_HOST_ALIAS = ''
$env:VC_MINIMAL_FLAGS = '1'
node "$H/arms.mjs" http://127.0.0.1:6400 "$Out/runs" 3 'chromium-offline~wslc=--driver raw --network proxy --proxy-host 127.0.0.1 --offline' 'chromium-live~wslc=--driver raw --network proxy --proxy-host 127.0.0.1' | Tee-Object -Append "$Out/runs.log"
Stop-Process -Id $serve.Id -Force
node "$H/dedupe.mjs" "$Out/runs" "$Out/snapshots"
