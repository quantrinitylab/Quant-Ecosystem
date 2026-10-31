<#
.SYNOPSIS
  Removes the Stalwart lab objects that create-lab.ps1 created, and nothing else.

.DESCRIPTION
  Reads lab/.state/lab-state.json. For each recorded OCID the live object is fetched first and deleted only
  if it still carries the freeform tag quant-lab=stalwart-lab. Objects without the tag, or not in the state
  file, are never touched. Order: instance (boot volume deleted), reserved IP, bastion, subnet, security
  list, NSG, route table, internet gateway, VCN.

  The Cloudflare records are removed by dns-lab.ps1 -Remove (run it first so no record points at a dead IP).
  Backups in R2 are not touched.

.PARAMETER Force   Do not ask for the confirmation phrase.
.PARAMETER KeepNetwork  Delete the instance, the IP and the bastion but keep the VCN objects.
.EXAMPLE
  .\destroy-lab.ps1
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [string]$StatePath = '',
  [switch]$Force,
  [switch]$KeepNetwork
)

Set-StrictMode -Version 1
$ErrorActionPreference = 'Stop'
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'lab.config.local.json' }
if (-not $StatePath) { $StatePath = Join-Path $ScriptDir '.state\lab-state.json' }
$TagKey = 'quant-lab'
$TagValue = 'stalwart-lab'

function Write-Step([string]$Message) { Write-Host "[destroy-lab] $Message" }

if (-not (Test-Path $StatePath)) { throw "No state file at ${StatePath}: nothing to destroy." }
$Cfg = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$OciProfile = if ($Cfg.PSObject.Properties['profile']) { [string]$Cfg.profile } else { 'MAIL' }
$State = Get-Content -Raw $StatePath | ConvertFrom-Json

function Invoke-Oci {
  param([string[]]$OciArgs, [switch]$AllowFail)
  $all = @($OciArgs) + @('--profile', $OciProfile)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $raw = & oci @all 2>&1 } finally { $ErrorActionPreference = $prev }
  $code = $LASTEXITCODE
  $out = @($raw | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n"
  $err = @($raw | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() }) -join "`n"
  if ($code -ne 0) {
    if ($AllowFail) { return $null }
    throw "oci $((@($OciArgs) | Select-Object -First 4) -join ' ') failed (exit $code): $err $out"
  }
  if ([string]::IsNullOrWhiteSpace($out)) { return $true }
  $json = $out | ConvertFrom-Json
  if ($json.PSObject.Properties.Name -contains 'data') { return $json.data }
  return $json
}

function Test-LabTag($Object) {
  if ($null -eq $Object -or $Object -eq $true) { return $false }
  $prop = $Object.PSObject.Properties['freeform-tags']
  if ($null -eq $prop -or $null -eq $prop.Value) { return $false }
  $tag = $prop.Value.PSObject.Properties[$TagKey]
  return ($null -ne $tag -and $tag.Value -eq $TagValue)
}

function Get-StateValue([string]$Key) {
  $p = $State.PSObject.Properties[$Key]
  if ($null -eq $p) { return $null }
  return $p.Value
}

# kind, state key, get command, delete command (id option name included)
$steps = @(
  @{ Name = 'instance';          Key = 'instanceId';      Get = @('compute', 'instance', 'get', '--instance-id');                 Del = @('compute', 'instance', 'terminate', '--force', '--preserve-boot-volume', 'false', '--wait-for-state', 'TERMINATED', '--instance-id'); Network = $false },
  @{ Name = 'reserved public IP'; Key = 'publicIpId';     Get = @('network', 'public-ip', 'get', '--public-ip-id');               Del = @('network', 'public-ip', 'delete', '--force', '--public-ip-id');                                                                    Network = $false },
  @{ Name = 'bastion';           Key = 'bastionId';       Get = @('bastion', 'bastion', 'get', '--bastion-id');                    Del = @('bastion', 'bastion', 'delete', '--force', '--wait-for-state', 'SUCCEEDED', '--bastion-id');                                       Network = $false },
  @{ Name = 'subnet';            Key = 'subnetId';        Get = @('network', 'subnet', 'get', '--subnet-id');                      Del = @('network', 'subnet', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--subnet-id');                                        Network = $true },
  @{ Name = 'security list';     Key = 'securityListId';  Get = @('network', 'security-list', 'get', '--security-list-id');         Del = @('network', 'security-list', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--security-list-id');                          Network = $true },
  @{ Name = 'NSG';               Key = 'nsgId';           Get = @('network', 'nsg', 'get', '--nsg-id');                            Del = @('network', 'nsg', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--nsg-id');                                              Network = $true },
  @{ Name = 'route table';       Key = 'routeTableId';    Get = @('network', 'route-table', 'get', '--rt-id');                     Del = @('network', 'route-table', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--rt-id');                                       Network = $true },
  @{ Name = 'internet gateway';  Key = 'igwId';           Get = @('network', 'internet-gateway', 'get', '--ig-id');                Del = @('network', 'internet-gateway', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--ig-id');                                  Network = $true },
  @{ Name = 'VCN';               Key = 'vcnId';           Get = @('network', 'vcn', 'get', '--vcn-id');                            Del = @('network', 'vcn', 'delete', '--force', '--wait-for-state', 'TERMINATED', '--vcn-id');                                              Network = $true }
)

Write-Step 'objects recorded in the state file:'
foreach ($s in $steps) { if (Get-StateValue $s.Key) { Write-Host ("  - {0}" -f $s.Name) } }

if (-not $Force) {
  $answer = Read-Host "Type 'destroy lab' to delete these objects and the boot volume"
  if ($answer -ne 'destroy lab') { Write-Step 'cancelled'; return }
}

foreach ($s in $steps) {
  if ($KeepNetwork -and $s.Network) { continue }
  $id = Get-StateValue $s.Key
  if (-not $id) { continue }
  $obj = Invoke-Oci ($s.Get + @($id)) -AllowFail
  if (-not $obj) { Write-Step "$($s.Name): already gone"; continue }
  if (-not (Test-LabTag $obj)) { Write-Step "$($s.Name): missing the $TagKey tag, NOT deleting"; continue }
  Write-Step "deleting $($s.Name)"
  Invoke-Oci ($s.Del + @($id)) | Out-Null
}

if (-not $KeepNetwork) {
  $archive = $StatePath + '.destroyed-' + (Get-Date -Format 'yyyyMMddHHmmss')
  Move-Item -Path $StatePath -Destination $archive
  Write-Step "state archived to $archive"
}
Write-Step 'done'
