# Research: from a Windows host, with docker.io in WSL2 (windows-wsl-docker.ps1 ran first): pipe and reach probes,
# then the capture arms and the kill check, against a Storybook served on the Windows host's 127.0.0.1.
#   windows-capture.ps1 -Out <dir> -Passes 5 -WkPasses 3
param([string]$Out, [int]$Passes = 5, [int]$WkPasses = 3)
$ErrorActionPreference = 'Continue'
$H = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$WslDocker = '["wsl.exe","-d","Ubuntu","-u","root","-e","docker"]'
$base = 'http://127.0.0.1:6400'
function Log($m) { Write-Output "### $m $(Get-Date -Format HH:mm:ss)" }

Log 'pipe probes'
foreach ($keep in '', '1') {
  $env:PIPE_KEEP_OPEN = $keep
  node "$H/pipe-probe.mjs" docker.exe-tcp docker run -i --rm $env:TAG cat | Tee-Object -Append "$Out/pipe.txt"
  node "$H/pipe-probe.mjs" wsl.exe wsl.exe -d Ubuntu -u root -e docker run -i --rm $env:TAG cat | Tee-Object -Append "$Out/pipe.txt"
}
Remove-Item env:PIPE_KEEP_OPEN -ErrorAction SilentlyContinue

Log 'reach probes'
# through wsl.exe, whose output is byte-exact; docker.exe over TCP can lose a short container's output at exit
$env:VC_DOCKER = $WslDocker
node "$H/reach-probe.mjs" no-rule $env:TAG host.docker.internal $env:WIN_IP | Tee-Object -Append "$Out/reach.txt"
node "$H/reach-probe.mjs" host-gateway $env:TAG host.docker.internal host-gateway | Tee-Object -Append "$Out/reach.txt"
New-NetFirewallRule -DisplayName vc-wsl-localsubnet -Direction Inbound -Action Allow -Protocol TCP -RemoteAddress LocalSubnet | Out-Null
node "$H/reach-probe.mjs" rule-localsubnet $env:TAG host.docker.internal $env:WIN_IP | Tee-Object -Append "$Out/reach.txt"
Remove-NetFirewallRule -DisplayName vc-wsl-localsubnet
$wsl = Get-NetIPAddress -AddressFamily IPv4 | Where-Object InterfaceAlias -Like 'vEthernet (WSL*' | Select-Object -First 1
if ($wsl) {
  # the rule from microsoft/playwright's repro of runner-images#12466, by the WSL adapter's subnet
  netsh advfirewall firewall add rule name=vc-wsl-subnet dir=in action=allow protocol=TCP "remoteip=$($wsl.IPAddress)/$($wsl.PrefixLength)" | Out-Null
  node "$H/reach-probe.mjs" rule-subnet $env:TAG host.docker.internal $env:WIN_IP | Tee-Object -Append "$Out/reach.txt"
}
Remove-Item env:VC_DOCKER

$serve = Start-Process node -ArgumentList "$H/serve.mjs", "$env:GITHUB_WORKSPACE/sb/storybook", '6400', '127.0.0.1' -RedirectStandardOutput "$Out/serve.log" -RedirectStandardError "$Out/serve.err" -PassThru -WindowStyle Hidden
while (-not (Select-String -Path "$Out/serve.log" -Pattern serving -Quiet -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 200 }

Log 'capture arms'
# The SOCKS proxy listens on all interfaces, as WSL NAT needs, and the browser maps host.docker.internal to Windows
$env:VC_HOST_ALIAS = $env:WIN_IP
$proxy = '--driver raw --network proxy --proxy-host 0.0.0.0'
node "$H/arms.mjs" $base "$Out/runs" $Passes "chromium-live=$proxy" "chromium-offline=$proxy --offline" | Tee-Object -Append "$Out/runs.log"
$env:VC_DOCKER = $WslDocker
node "$H/arms.mjs" $base "$Out/runs" 2 "chromium-offline~wslexe=$proxy --offline" | Tee-Object -Append "$Out/runs.log"
Remove-Item env:VC_DOCKER
if ($env:WSL_MODE -eq 'mirrored') {
  node "$H/arms.mjs" $base "$Out/runs" $Passes 'chromium-live~hostnet=--driver raw --network host' 'chromium-offline~hostnet=--driver raw --network host --offline' | Tee-Object -Append "$Out/runs.log"
}
$env:VC_MOUNT = 'wsl'
node "$H/arms.mjs" $base "$Out/runs" $WkPasses 'webkit-live=--driver pw-webkit --pw-mode attached' 'webkit-offline=--driver pw-webkit --pw-mode attached --offline' | Tee-Object -Append "$Out/runs.log"

Log 'kill checks'
node "$H/kill-check.mjs" $base "$Out/kill-docker.exe" --network proxy --proxy-host 0.0.0.0 | Tee-Object -Append "$Out/kill.txt"
$env:VC_DOCKER = $WslDocker
node "$H/kill-check.mjs" $base "$Out/kill-wsl.exe" --network proxy --proxy-host 0.0.0.0 | Tee-Object -Append "$Out/kill.txt"
Remove-Item env:VC_DOCKER
wsl.exe -d Ubuntu -u root -e docker ps -a | Tee-Object -Append "$Out/kill.txt"

Stop-Process -Id $serve.Id -Force
node "$H/dedupe.mjs" "$Out/runs" "$Out/snapshots"
