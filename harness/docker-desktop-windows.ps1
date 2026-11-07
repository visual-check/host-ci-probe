# Research: Docker Desktop with its WSL2 backend on a hosted Windows Server runner, which Docker doesn't support.
# Does it install, start and run a Linux container, and does host.docker.internal reach the host's 127.0.0.1?
$ErrorActionPreference = 'Continue'
$t = [Diagnostics.Stopwatch]::StartNew()
function At { "at $([math]::Round($t.Elapsed.TotalSeconds)) s" }
$installer = "$env:RUNNER_TEMP\DockerDesktopInstaller.exe"
Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $installer
Write-Output "downloaded $((Get-Item $installer).Length) bytes $(At)"
$p = Start-Process $installer -ArgumentList 'install', '--quiet', '--accept-license', '--backend=wsl-2', '--always-run-service' -PassThru
if (-not $p.WaitForExit(900000)) { Write-Output "installer still running after 15 min"; $p.Kill() }
Write-Output "installer exit $($p.ExitCode) $(At)"
Get-ChildItem 'C:\Program Files\Docker\Docker' -ErrorAction SilentlyContinue | Select-Object -First 5 Name | Format-Table | Out-String | Write-Output
# The runner's own Moby service holds \\.\pipe\docker_engine, which Docker Desktop's API proxy needs
Stop-Service docker -Force -ErrorAction Continue
Get-Service docker | Select-Object Name, Status | Format-Table | Out-String | Write-Output
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -ErrorAction Continue
$cli = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
for ($i = 0; $i -lt 120; $i++) { & $cli --context desktop-linux info *> $null; if (-not $LASTEXITCODE) { break }; Start-Sleep 5 }
Write-Output "waited $(At)"
& $cli context ls 2>&1 | Write-Output
& $cli --context desktop-linux info --format '{{.ServerVersion}} {{.OperatingSystem}} {{.OSType}} {{.NCPU}} CPUs' 2>&1 | Write-Output
(wsl.exe -l -v | Out-String) -replace "`0", '' | Write-Output
Get-ChildItem "$env:LOCALAPPDATA\Docker\log\host" -ErrorAction SilentlyContinue | Select-Object -First 10 Name | Format-Table | Out-String | Write-Output
Get-Content "$env:LOCALAPPDATA\Docker\log\host\com.docker.backend.exe.log" -Tail 40 -ErrorAction SilentlyContinue | Write-Output
& $cli --context desktop-linux info *> $null
if ($LASTEXITCODE) { Write-Output 'Docker Desktop: no Linux engine'; exit 0 }
$env:VC_DOCKER = ConvertTo-Json -Compress @($cli, '--context', 'desktop-linux')
node "$PSScriptRoot/pipe-probe.mjs" docker-desktop $cli --context desktop-linux run -i --rm --platform linux/amd64 alpine cat
node "$PSScriptRoot/reach-probe.mjs" docker-desktop node:24-alpine host.docker.internal -
if (-not $env:DD_CAPTURE) { exit 0 }
# Captures and the kill check through Docker Desktop, as a Windows developer would run them: the proxy on 127.0.0.1
$Out = "$env:GITHUB_WORKSPACE/out"
$H = $PSScriptRoot
& $cli --context desktop-linux pull -q --platform linux/amd64 $env:IMAGE; & $cli --context desktop-linux tag $env:IMAGE $env:TAG
Write-Output "pulled $(At)"
$serve = Start-Process node -ArgumentList "$H/serve.mjs", "$env:GITHUB_WORKSPACE/sb/storybook", '6400', '127.0.0.1' -RedirectStandardOutput "$Out/serve.log" -PassThru -WindowStyle Hidden
while (-not (Select-String -Path "$Out/serve.log" -Pattern serving -Quiet -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }
$base = 'http://127.0.0.1:6400'
node "$H/kill-check.mjs" $base "$Out/kill" --network proxy --proxy-host 127.0.0.1 | Tee-Object -Append "$Out/kill.txt"
node "$H/arms.mjs" $base "$Out/runs" $env:PASSES 'chromium-live=--driver raw --network proxy --proxy-host 127.0.0.1' 'chromium-offline=--driver raw --network proxy --proxy-host 127.0.0.1 --offline' | Tee-Object -Append "$Out/runs.log"
node "$H/arms.mjs" $base "$Out/runs" $env:WK_PASSES 'webkit-live=--driver pw-webkit --pw-mode attached' 'webkit-offline=--driver pw-webkit --pw-mode attached --offline' | Tee-Object -Append "$Out/runs.log"
Stop-Process -Id $serve.Id -Force
node "$H/dedupe.mjs" "$Out/runs" "$Out/snapshots"
Get-ChildItem "$Out/runs" -Recurse -Directory -Filter png | Remove-Item -Recurse -Force
