# Research: what a Windows runner offers for Linux containers. Prints facts, never fails.
$ErrorActionPreference = 'Continue'
function Section($t) { Write-Output "## $t" }
Section 'machine'
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber | Format-List | Out-String | Write-Output
Get-CimInstance Win32_ComputerSystem | Select-Object Model, HypervisorPresent, NumberOfLogicalProcessors, @{n='MemoryGiB';e={[math]::Round($_.TotalPhysicalMemory/1GB,1)}} | Format-List | Out-String | Write-Output
Get-CimInstance Win32_Processor | Select-Object Name, VirtualizationFirmwareEnabled, VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions | Format-List | Out-String | Write-Output
Section 'systeminfo Hyper-V'
systeminfo | Select-String -Pattern 'Hyper-V|hypervisor|Virtualization|VM Monitor|Second Level' | ForEach-Object { $_.Line.Trim() }
Section 'optional features'
Get-WindowsOptionalFeature -Online | Where-Object FeatureName -Match 'Hyper-V|VirtualMachinePlatform|Subsystem-Linux|^Containers' | Select-Object FeatureName, State | Format-Table -AutoSize | Out-String | Write-Output
Section 'services'
Get-Service docker, vmcompute, hns, LxssManager, WslService -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType | Format-Table -AutoSize | Out-String | Write-Output
Section 'wsl'
foreach ($a in @('--version'), @('--status'), @('-l', '-v')) { Write-Output "> wsl $a"; (wsl.exe @a 2>&1 | Out-String) -replace "`0", '' | Write-Output }
Section 'docker'
Get-Command docker -ErrorAction SilentlyContinue | Select-Object Source | Format-List | Out-String | Write-Output
docker version 2>&1 | Write-Output
docker info --format '{{.OSType}} {{.Isolation}} {{.ServerVersion}} {{.KernelVersion}}' 2>&1 | Write-Output
Write-Output '> docker run --rm --platform linux/amd64 hello-world'
docker run --rm --platform linux/amd64 hello-world 2>&1 | Select-Object -First 5 | Write-Output
Get-ChildItem 'C:\Program Files\Docker' -ErrorAction SilentlyContinue | Select-Object Name | Format-Table | Out-String | Write-Output
