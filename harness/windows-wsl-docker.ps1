# Research: Linux containers on a hosted Windows runner, through docker.io inside a WSL2 Ubuntu. Adapted from
# Particular/setup-wsl-action's setup.ps1 (WSL config, bridge subnets on 10.x, systemd's dockerd, a D-Bus session to keep
# the instance alive), with dockerd also on 127.0.0.1:2375 so the runner's own docker.exe can be its client.
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
  wsl.exe --version *> $null
  if ($LASTEXITCODE) {
    # the inbox WSL (windows-2022) has no --version and no --no-launch: update to the packaged WSL first
    Write-Output 'inbox WSL: wsl --update --web-download'
    (wsl.exe --update --web-download 2>&1 | Out-String) -replace "`0", '' | Write-Output
    (wsl.exe --version 2>&1 | Out-String) -replace "`0", '' | Write-Output
  }
  wsl.exe --set-default-version 2 | Out-Null
  wsl.exe --install $D --no-launch
  if ($LASTEXITCODE) { throw "wsl --install failed: $LASTEXITCODE" }
  Wsl 'uname -a; cat /etc/os-release | head -2; nproc; free -g | head -2'
}
$wslMode = (Wsl 'wslinfo --networking-mode 2>&1 || echo unknown').Trim()
Write-Output "requested $Mode, WSL reports: $wslMode"
if ($wslMode -ne $Mode) {
  "WSL_MODE=$wslMode" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  Write-Output "networking mode $Mode not honoured, stopping here"
  exit 0
}
Step 'docker.io' {
  $sh = (wsl.exe -d $D -u root -e wslpath -a ($PSScriptRoot + '\wsl-docker.sh') | Out-String).Trim()
  Wsl "bash '$sh'"
  # WSL stops an instance with no session left; a D-Bus session started through --exec keeps it (Particular's action)
  wsl.exe -d $D -u root --exec /usr/bin/dbus-launch true
}
$winIp = (Wsl "ip route show default | awk '{print `$3}'").Trim()
Write-Output "Windows host as seen from WSL: $winIp"
Wsl 'ip -4 -o addr show | awk ''{print $2, $4}'''
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress, PrefixLength | Format-Table -AutoSize | Out-String | Write-Output
$env:DOCKER_HOST = 'tcp://127.0.0.1:2375'
Write-Output "Windows docker.exe against the WSL daemon:"
docker version --format 'client {{.Client.Version}} {{.Client.Os}}, server {{.Server.Version}} {{.Server.Os}}'
"WSL_MODE=$wslMode", "WIN_IP=$winIp", 'DOCKER_HOST=tcp://127.0.0.1:2375' | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
