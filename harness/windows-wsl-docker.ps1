# Research: Linux containers on a hosted Windows runner, through docker.io inside a WSL2 Ubuntu. Adapted from
# Particular/setup-wsl-action's setup.ps1 (WSL config, bridge subnets on 10.x, instance kept alive), with dockerd also
# listening on 127.0.0.1:2375 so the runner's own docker.exe can be its client.
#   windows-wsl-docker.ps1 -Mode nat|mirrored
# Exports to GITHUB_ENV: WSL_MODE (what WSL reports), WIN_IP (the Windows host as seen from WSL), DOCKER_HOST.
param([string]$Mode = 'nat')
$ErrorActionPreference = 'Stop'
$D = 'Ubuntu'
function Wsl([string]$cmd) { $o = (wsl.exe -d $D -u root -e bash -c $cmd 2>&1 | Out-String) -replace "`0", ''; Write-Output $o.Trim(); if ($LASTEXITCODE) { throw "wsl failed ($LASTEXITCODE): $cmd" } }
function Step($name, [scriptblock]$b) { $t = [Diagnostics.Stopwatch]::StartNew(); Write-Output "::group::$name"; & $b; Write-Output "::endgroup::"; Write-Output "$name took $([math]::Round($t.Elapsed.TotalSeconds)) s" }

$cfg = "[wsl2]`nmemory=12GB`nvmIdleTimeout=-1`n"
if ($Mode -eq 'mirrored') { $cfg += "networkingMode=mirrored`n" }
Set-Content -Path (Join-Path $env:USERPROFILE '.wslconfig') -Value $cfg -Encoding ASCII
Step 'WSL install' {
  (wsl.exe --version | Out-String) -replace "`0", '' | Write-Output
  wsl.exe --set-default-version 2 | Out-Null
  wsl.exe --install $D --no-launch
  if ($LASTEXITCODE) { throw "wsl --install failed: $LASTEXITCODE" }
  Wsl 'uname -a; cat /etc/os-release | head -2; nproc; free -g | head -2'
}
$wslMode = (Wsl 'wslinfo --networking-mode 2>&1 || echo unknown').Trim()
Write-Output "requested $Mode, WSL reports: $wslMode"
Step 'docker.io' {
  Wsl 'export DEBIAN_FRONTEND=noninteractive; apt-get update -q >/dev/null && apt-get install -yq docker.io >/dev/null && docker --version'
  # WSL2 NAT takes a random /20 from 172.16.0.0/12, which Docker's default 172.17.0.0/16 can overlap
  $json = '{"bip":"10.11.0.1/24","default-address-pools":[{"base":"10.12.0.0/16","size":24}]}'
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  Wsl "mkdir -p /etc/docker && echo $b64 | base64 -d > /etc/docker/daemon.json && cat /etc/docker/daemon.json"
  Wsl 'if [ -d /run/systemd/system ]; then systemctl disable --now docker.service docker.socket >/dev/null 2>&1; echo systemd; else service docker stop >/dev/null 2>&1; echo sysv; fi; true'
  # An attached wsl.exe running dockerd keeps the instance alive for the whole job
  Start-Process -FilePath wsl.exe -ArgumentList '-d', $D, '-u', 'root', '-e', 'dockerd', '-H', 'unix:///var/run/docker.sock', '-H', 'tcp://127.0.0.1:2375' -RedirectStandardOutput "$env:RUNNER_TEMP\dockerd.out" -RedirectStandardError "$env:RUNNER_TEMP\dockerd.log" -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) { wsl.exe -d $D -u root -e docker info *> $null; if (-not $LASTEXITCODE) { break }; Start-Sleep 1 }
  Wsl "docker info --format '{{.ServerVersion}} {{.OperatingSystem}} {{.NCPU}} CPUs {{.MemTotal}}'"
}
$winIp = (Wsl "ip route show default | awk '{print `$3}'").Trim()
Write-Output "Windows host as seen from WSL: $winIp"
Wsl 'ip -4 -o addr show | awk ''{print $2, $4}'''
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress, PrefixLength | Format-Table -AutoSize | Out-String | Write-Output
$env:DOCKER_HOST = 'tcp://127.0.0.1:2375'
Write-Output "Windows docker.exe against the WSL daemon:"
docker version --format 'client {{.Client.Version}} {{.Client.Os}}, server {{.Server.Version}} {{.Server.Os}}'
"WSL_MODE=$wslMode", "WIN_IP=$winIp", 'DOCKER_HOST=tcp://127.0.0.1:2375' | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
