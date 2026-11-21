<#
.SYNOPSIS
  Creates (or completes) the Stalwart lab on Oracle Cloud with the OCI CLI. Idempotent.

.DESCRIPTION
  Uses the OCI CLI profile MAIL (user kiro-mail, compartment quant-mail). Creates, only if missing:
    VCN 10.20.0.0/16, internet gateway, route table, a security list WITHOUT internet SSH, a public subnet,
    an NSG (ingress 25/80/443 and 465/587/993 from anywhere, NO port 22), an OCI Bastion (managed SSH),
    a RESERVED public IP and one compute instance with cloud-init (Docker, compose, OS firewall, repo checkout).
  Shape: checks the tenancy limits first and prefers the Always Free AMD shape VM.Standard.E2.1.Micro
  (1 GB RAM, enough for a lab), else VM.Standard.A1.Flex 1 OCPU / 6 GB (about USD 14 per month, cap USD 20).

  Every object gets the freeform tag quant-lab=stalwart-lab and its OCID is written to lab/.state/lab-state.json
  (git-ignored). destroy-lab.ps1 removes only objects listed there that still carry the tag.
  All OCIDs are read from the local, git-ignored lab.config.local.json. Nothing is hard-coded.
  Port 22 is never opened to the internet. The Bastion reaches sshd from inside the lab subnet.

.PARAMETER ConfigPath  Local config (copy lab.config.example.json to lab.config.local.json).
.PARAMETER Shape       auto (default: free shape if available, else A1), free, or a1.
.PARAMETER DryRun      Print what would be done (limit checks are read-only and still run).
.PARAMETER SkipInstance  Create the network, bastion and IP only.

.EXAMPLE
  .\create-lab.ps1 -DryRun
  .\create-lab.ps1
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [string]$StatePath = '',
  [ValidateSet('auto', 'free', 'a1')][string]$Shape = 'auto',
  [switch]$DryRun,
  [switch]$SkipInstance
)

Set-StrictMode -Version 1
$ErrorActionPreference = 'Stop'
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'lab.config.local.json' }
if (-not $StatePath) { $StatePath = Join-Path $ScriptDir '.state\lab-state.json' }
$script:TagKey = 'quant-lab'
$script:TagValue = 'stalwart-lab'
$StateDir = Split-Path -Parent $StatePath

function Write-Step([string]$Message) { Write-Host "[create-lab] $Message" }

# ---- OCI CLI wrapper --------------------------------------------------------------------------
function Invoke-Oci {
  param([string[]]$OciArgs, [switch]$AllowFail)
  $all = @($OciArgs) + @('--profile', $script:OciProfile)
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
  if ([string]::IsNullOrWhiteSpace($out)) { return $null }
  $json = $out | ConvertFrom-Json
  if ($json.PSObject.Properties.Name -contains 'data') { return $json.data }
  return $json
}

function Write-JsonFile([string]$Name, $Object) {
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $path = Join-Path $StateDir $Name
  # -InputObject keeps one-element arrays as arrays (piping would unwrap them in Windows PowerShell 5.1)
  ConvertTo-Json -InputObject $Object -Depth 10 | Set-Content -Path $path -Encoding ASCII
  return 'file://' + ($path -replace '\\', '/')
}

# ---- config and state -------------------------------------------------------------------------
if (-not (Test-Path $ConfigPath)) { throw "Config not found: $ConfigPath (copy lab.config.example.json to lab.config.local.json and fill it in)" }
$Cfg = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$script:OciProfile = if ($Cfg.profile) { [string]$Cfg.profile } else { 'MAIL' }
if ([string]$Cfg.compartmentId -match 'REPLACE_WITH') { throw 'compartmentId in the config is still the placeholder' }
if (-not (Test-Path ([string]$Cfg.sshPublicKeyPath))) { throw "ssh public key not found: $($Cfg.sshPublicKeyPath)" }

$State = @{}
if (Test-Path $StatePath) {
  (Get-Content -Raw $StatePath | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $State[$_.Name] = $_.Value }
}
function Save-State { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null; $State | ConvertTo-Json -Depth 5 | Set-Content -Path $StatePath -Encoding ASCII }
function Set-State([string]$Key, $Value) { $State[$Key] = $Value; Save-State }
function Get-StateValue([string]$Key) { if ($State.ContainsKey($Key)) { return $State[$Key] } else { return $null } }

function Get-TenancyId {
  $cfgFile = Join-Path $env:USERPROFILE '.oci\config'
  $inSection = $false
  foreach ($line in Get-Content $cfgFile) {
    if ($line -match '^\[(.+)\]\s*$') { $inSection = ($Matches[1] -eq $script:OciProfile); continue }
    if ($inSection -and $line -match '^\s*tenancy\s*=\s*(\S+)') { return $Matches[1] }
  }
  throw "tenancy not found for profile $($script:OciProfile) in $cfgFile"
}

$CompartmentId = [string]$Cfg.compartmentId
$TenancyId = Get-TenancyId
$Prefix = [string]$Cfg.namePrefix
$TagsFile = Write-JsonFile 'tags.json' (@{ $script:TagKey = $script:TagValue })

# ---- generic ensure-helper ----------------------------------------------------------------------
# Adopts an existing object with the same display name and tag (after a partial run) before creating.
function Test-LabTag($Object) {
  if ($null -eq $Object) { return $false }
  $prop = $Object.PSObject.Properties['freeform-tags']
  if ($null -eq $prop -or $null -eq $prop.Value) { return $false }
  $tag = $prop.Value.PSObject.Properties[$script:TagKey]
  return ($null -ne $tag -and $tag.Value -eq $script:TagValue)
}

function Find-Existing([string]$Service, [string]$Kind, [string]$DisplayName, [string[]]$Extra = @()) {
  $a = @($Service, $Kind, 'list', '--compartment-id', $CompartmentId, '--display-name', $DisplayName, '--all') + $Extra
  $items = Invoke-Oci $a -AllowFail
  if (-not $items) { return $null }
  foreach ($i in @($items)) {
    $state = $i.'lifecycle-state'
    if ($state -in @('TERMINATED', 'TERMINATING', 'DELETED', 'DELETING')) { continue }
    if (Test-LabTag $i) { return $i }
  }
  return $null
}

# ---- 1. limits and shape -------------------------------------------------------------------------
Write-Step "profile $($script:OciProfile); checking tenancy limits"
$ads = @(Invoke-Oci @('iam', 'availability-domain', 'list', '--compartment-id', $TenancyId))
if ($ads.Count -eq 0) { throw 'no availability domain found' }

function Get-Available([string]$LimitName, [string]$Ad) {
  $r = Invoke-Oci @('limits', 'resource-availability', 'get', '--service-name', 'compute', '--limit-name', $LimitName, '--compartment-id', $TenancyId, '--availability-domain', $Ad) -AllowFail
  if ($null -eq $r) { return 0 }
  $prop = $r.PSObject.Properties['available']
  if ($null -eq $prop -or $null -eq $prop.Value) { return 0 }
  return [int][math]::Floor([double]$prop.Value)
}

$candidates = @()   # ordered list of @{ Shape; Ad; Flex }
$freeAds = @(); $a1Ads = @()
foreach ($ad in $ads) {
  if ((Get-Available 'vm-standard-e2-1-micro-count' $ad.name) -ge 1) { $freeAds += $ad.name }
  $cores = Get-Available 'standard-a1-core-count' $ad.name
  $mem = Get-Available 'standard-a1-memory-count' $ad.name
  if ($cores -ge [int]$Cfg.a1Ocpus -and $mem -ge [int]$Cfg.a1MemoryGb) { $a1Ads += $ad.name }
}
Write-Step "limits: free AMD shape available in $($freeAds.Count) AD(s); A1.Flex ($($Cfg.a1Ocpus) OCPU/$($Cfg.a1MemoryGb) GB) in $($a1Ads.Count) AD(s)"
if ($Shape -in @('auto', 'free')) { foreach ($n in $freeAds) { $candidates += @{ Shape = 'VM.Standard.E2.1.Micro'; Ad = $n; Flex = $false } } }
if ($Shape -in @('auto', 'a1')) { foreach ($n in $a1Ads) { $candidates += @{ Shape = 'VM.Standard.A1.Flex'; Ad = $n; Flex = $true } } }
if ($candidates.Count -eq 0 -and -not $SkipInstance) { throw 'no usable shape under the current limits (free AMD: 0, A1: 0). Raise a limit request or free an instance.' }

function Get-CostEstimate([string]$ShapeName) {
  if ($ShapeName -eq 'VM.Standard.E2.1.Micro') { return 'USD 0 per month (Always Free shape; 50 GB boot volume is inside the 200 GB Always Free block storage; reserved IP is free while attached)' }
  $ocpu = [double]$Cfg.a1Ocpus; $gb = [double]$Cfg.a1MemoryGb
  $usd = [math]::Round($ocpu * 0.01 * 730 + $gb * 0.0015 * 730, 2)
  return "about USD $usd per month if billed (A1: 0.01 per OCPU-hour + 0.0015 per GB-hour; USD 0 while inside the Always Free A1 allowance); cap USD $($Cfg.monthlyCostCapUsd)"
}

if ($DryRun) {
  Write-Step 'DRY RUN: nothing will be created.'
  if ($candidates.Count -gt 0) { Write-Step "would try: $(($candidates | ForEach-Object { $_.Shape + ' in ' + $_.Ad }) -join '; ')"; Write-Step "cost: $(Get-CostEstimate $candidates[0].Shape)" }
  Write-Step "would ensure: VCN $($Cfg.vcnCidr), IGW, route table, security list (no internet SSH), subnet $($Cfg.subnetCidr), NSG, Bastion, reserved IP$(if (-not $SkipInstance) { ', instance' })"
  return
}

# ---- 2. network ----------------------------------------------------------------------------------
Write-Step 'network'
$vcn = $null
if (Get-StateValue 'vcnId') { $vcn = Invoke-Oci @('network', 'vcn', 'get', '--vcn-id', (Get-StateValue 'vcnId')) -AllowFail }
if (-not $vcn) { $vcn = Find-Existing 'network' 'vcn' "$Prefix-vcn" }
if (-not $vcn) {
  $vcn = Invoke-Oci @('network', 'vcn', 'create', '--compartment-id', $CompartmentId, '--display-name', "$Prefix-vcn", '--cidr-blocks', (Write-JsonFile 'vcn-cidrs.json' @([string]$Cfg.vcnCidr)), '--dns-label', 'quantlab', '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  Write-Step 'VCN created'
}
Set-State 'vcnId' $vcn.id
$VcnId = $vcn.id

$igw = $null
if (Get-StateValue 'igwId') { $igw = Invoke-Oci @('network', 'internet-gateway', 'get', '--ig-id', (Get-StateValue 'igwId')) -AllowFail }
if (-not $igw) { $igw = Find-Existing 'network' 'internet-gateway' "$Prefix-igw" @('--vcn-id', $VcnId) }
if (-not $igw) {
  $igw = Invoke-Oci @('network', 'internet-gateway', 'create', '--compartment-id', $CompartmentId, '--vcn-id', $VcnId, '--is-enabled', 'true', '--display-name', "$Prefix-igw", '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  Write-Step 'internet gateway created'
}
Set-State 'igwId' $igw.id

$rt = $null
if (Get-StateValue 'routeTableId') { $rt = Invoke-Oci @('network', 'route-table', 'get', '--rt-id', (Get-StateValue 'routeTableId')) -AllowFail }
if (-not $rt) { $rt = Find-Existing 'network' 'route-table' "$Prefix-rt" @('--vcn-id', $VcnId) }
if (-not $rt) {
  $rules = Write-JsonFile 'route-rules.json' @(@{ destination = '0.0.0.0/0'; destinationType = 'CIDR_BLOCK'; networkEntityId = $igw.id })
  $rt = Invoke-Oci @('network', 'route-table', 'create', '--compartment-id', $CompartmentId, '--vcn-id', $VcnId, '--display-name', "$Prefix-rt", '--route-rules', $rules, '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  Write-Step 'route table created'
}
Set-State 'routeTableId' $rt.id

# Dedicated security list: the VCN default list allows SSH from 0.0.0.0/0, so the subnet must not use it.
$sl = $null
if (Get-StateValue 'securityListId') { $sl = Invoke-Oci @('network', 'security-list', 'get', '--security-list-id', (Get-StateValue 'securityListId')) -AllowFail }
if (-not $sl) { $sl = Find-Existing 'network' 'security-list' "$Prefix-sl" @('--vcn-id', $VcnId) }
if (-not $sl) {
  $ingress = Write-JsonFile 'sl-ingress.json' @(
    @{ source = [string]$Cfg.subnetCidr; sourceType = 'CIDR_BLOCK'; protocol = '6'; isStateless = $false; description = 'sshd from inside the lab subnet only (OCI Bastion)'; tcpOptions = @{ destinationPortRange = @{ min = 22; max = 22 } } },
    @{ source = '0.0.0.0/0'; sourceType = 'CIDR_BLOCK'; protocol = '1'; isStateless = $false; description = 'path MTU discovery'; icmpOptions = @{ type = 3; code = 4 } }
  )
  $egress = Write-JsonFile 'sl-egress.json' @(@{ destination = '0.0.0.0/0'; destinationType = 'CIDR_BLOCK'; protocol = 'all'; isStateless = $false; description = 'all outbound (port 25 is blocked by Oracle by default)' })
  $sl = Invoke-Oci @('network', 'security-list', 'create', '--compartment-id', $CompartmentId, '--vcn-id', $VcnId, '--display-name', "$Prefix-sl", '--ingress-security-rules', $ingress, '--egress-security-rules', $egress, '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  Write-Step 'security list created (no internet SSH)'
}
Set-State 'securityListId' $sl.id

$subnet = $null
if (Get-StateValue 'subnetId') { $subnet = Invoke-Oci @('network', 'subnet', 'get', '--subnet-id', (Get-StateValue 'subnetId')) -AllowFail }
if (-not $subnet) { $subnet = Find-Existing 'network' 'subnet' "$Prefix-subnet" @('--vcn-id', $VcnId) }
if (-not $subnet) {
  $subnet = Invoke-Oci @('network', 'subnet', 'create', '--compartment-id', $CompartmentId, '--vcn-id', $VcnId, '--display-name', "$Prefix-subnet", '--cidr-block', [string]$Cfg.subnetCidr, '--route-table-id', $rt.id, '--security-list-ids', (Write-JsonFile 'sl-ids.json' @($sl.id)), '--prohibit-public-ip-on-vnic', 'false', '--dns-label', 'pub', '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  Write-Step 'public subnet created'
}
Set-State 'subnetId' $subnet.id

$nsg = $null
if (Get-StateValue 'nsgId') { $nsg = Invoke-Oci @('network', 'nsg', 'get', '--nsg-id', (Get-StateValue 'nsgId')) -AllowFail }
if (-not $nsg) { $nsg = Find-Existing 'network' 'nsg' "$Prefix-nsg" @('--vcn-id', $VcnId) }
if (-not $nsg) {
  $nsg = Invoke-Oci @('network', 'nsg', 'create', '--compartment-id', $CompartmentId, '--vcn-id', $VcnId, '--display-name', "$Prefix-nsg", '--freeform-tags', $TagsFile, '--wait-for-state', 'AVAILABLE')
  $mailPorts = @(
    @{ p = 25; d = 'SMTP inbound' }, @{ p = 80; d = 'HTTP (ACME HTTP-01 fallback)' }, @{ p = 443; d = 'HTTPS: JMAP, admin, ACME' },
    @{ p = 465; d = 'SMTP submission (implicit TLS), lab only' }, @{ p = 587; d = 'SMTP submission (STARTTLS), lab only' }, @{ p = 993; d = 'IMAPS, lab only' }
  )
  $nsgRules = @()
  foreach ($m in $mailPorts) {
    $nsgRules += @{ direction = 'INGRESS'; protocol = '6'; source = '0.0.0.0/0'; sourceType = 'CIDR_BLOCK'; isStateless = $false; description = $m.d; tcpOptions = @{ destinationPortRange = @{ min = $m.p; max = $m.p } } }
  }
  Invoke-Oci @('network', 'nsg', 'rules', 'add', '--nsg-id', $nsg.id, '--security-rules', (Write-JsonFile 'nsg-rules.json' $nsgRules)) | Out-Null
  Write-Step 'NSG created: 25/80/443/465/587/993 from anywhere, no 22'
}
Set-State 'nsgId' $nsg.id

# ---- 3. bastion ----------------------------------------------------------------------------------
$bastion = $null
if (Get-StateValue 'bastionId') { $bastion = Invoke-Oci @('bastion', 'bastion', 'get', '--bastion-id', (Get-StateValue 'bastionId')) -AllowFail }
if (-not $bastion) {
  $cidr = [string]$Cfg.bastionClientCidr
  if ($cidr -eq 'auto') {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $myIp = (Invoke-RestMethod -Uri 'https://api.ipify.org').Trim()
    $cidr = "$myIp/32"
  }
  $bastion = Invoke-Oci @('bastion', 'bastion', 'create', '--bastion-type', 'STANDARD', '--compartment-id', $CompartmentId, '--target-subnet-id', $subnet.id, '--name', "$Prefix-bastion", '--client-cidr-list', (Write-JsonFile 'bastion-cidr.json' @($cidr)), '--max-session-ttl', '10800', '--freeform-tags', $TagsFile, '--wait-for-state', 'ACTIVE')
  Write-Step 'bastion created (client allow list = this machine)'
}
Set-State 'bastionId' $bastion.id

if ($SkipInstance) { Write-Step 'SkipInstance: done'; return }

# ---- 4. instance ---------------------------------------------------------------------------------
$inst = $null
if (Get-StateValue 'instanceId') {
  $inst = Invoke-Oci @('compute', 'instance', 'get', '--instance-id', (Get-StateValue 'instanceId')) -AllowFail
  if ($inst -and $inst.'lifecycle-state' -in @('TERMINATED', 'TERMINATING')) { $inst = $null }
}
if (-not $inst) { $inst = Find-Existing 'compute' 'instance' "$Prefix-vm" }

if (-not $inst) {
  $ci = (Get-Content -Raw (Join-Path $ScriptDir 'cloud-init.yaml')).Replace('__REPO_URL__', [string]$Cfg.repoUrl).Replace('__REPO_BRANCH__', [string]$Cfg.repoBranch).Replace('__FQDN__', [string]$Cfg.fqdn)
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $ciPath = Join-Path $StateDir 'cloud-init.rendered.yaml'
  [System.IO.File]::WriteAllText($ciPath, $ci, (New-Object System.Text.UTF8Encoding $false))
  $agent = Write-JsonFile 'agent-config.json' @{ isManagementDisabled = $false; isMonitoringDisabled = $false; pluginsConfig = @(@{ name = 'Bastion'; desiredState = 'ENABLED' }, @{ name = 'Compute Instance Monitoring'; desiredState = 'ENABLED' }) }
  $nsgIds = Write-JsonFile 'nsg-ids.json' @($nsg.id)

  foreach ($c in $candidates) {
    $arch = if ($c.Flex) { 'aarch64' } else { 'x86_64' }
    $img = Invoke-Oci @('compute', 'image', 'list', '--compartment-id', $TenancyId, '--operating-system', 'Oracle Linux', '--operating-system-version', '9', '--shape', $c.Shape, '--sort-by', 'TIMECREATED', '--sort-order', 'DESC', '--limit', '1', '--lifecycle-state', 'AVAILABLE') -AllowFail
    if (-not $img) { Write-Step "no Oracle Linux 9 image for $($c.Shape) ($arch)"; continue }
    $imageId = @($img)[0].id
    $launch = @('compute', 'instance', 'launch', '--compartment-id', $CompartmentId, '--availability-domain', $c.Ad, '--shape', $c.Shape,
      '--subnet-id', $subnet.id, '--nsg-ids', $nsgIds, '--assign-public-ip', 'false', '--image-id', $imageId,
      '--boot-volume-size-in-gbs', [string]$Cfg.bootVolumeGb, '--display-name', "$Prefix-vm", '--hostname-label', 'mail',
      '--ssh-authorized-keys-file', [string]$Cfg.sshPublicKeyPath, '--user-data-file', $ciPath, '--agent-config', $agent,
      '--freeform-tags', $TagsFile, '--wait-for-state', 'RUNNING', '--max-wait-seconds', '900')
    if ($c.Flex) { $launch += @('--shape-config', (Write-JsonFile 'shape-config.json' @{ ocpus = [double]$Cfg.a1Ocpus; memoryInGBs = [double]$Cfg.a1MemoryGb })) }
    Write-Step "launching $($c.Shape) in $($c.Ad)"
    $inst = Invoke-Oci $launch -AllowFail
    if ($inst) { Write-Step "cost estimate: $(Get-CostEstimate $c.Shape)"; Set-State 'shape' $c.Shape; break }
    Write-Step "launch failed for $($c.Shape) in $($c.Ad) (most often: out of host capacity). Trying the next candidate."
  }
  if (-not $inst) { throw 'instance launch failed for every candidate shape/AD. Re-run later; created network objects are kept.' }
}
Set-State 'instanceId' $inst.id
if (-not (Get-StateValue 'shape')) { Set-State 'shape' $inst.shape }

# ---- 5. reserved public IP -------------------------------------------------------------------------
$vnic = @(Invoke-Oci @('compute', 'instance', 'list-vnics', '--instance-id', $inst.id, '--compartment-id', $CompartmentId))[0]
$priv = @(Invoke-Oci @('network', 'private-ip', 'list', '--vnic-id', $vnic.id))[0]
$pub = $null
if (Get-StateValue 'publicIpId') { $pub = Invoke-Oci @('network', 'public-ip', 'get', '--public-ip-id', (Get-StateValue 'publicIpId')) -AllowFail }
if (-not $pub) {
  $existing = Invoke-Oci @('network', 'public-ip', 'list', '--compartment-id', $CompartmentId, '--scope', 'REGION', '--lifetime', 'RESERVED', '--all') -AllowFail
  if ($existing) { $pub = @($existing | Where-Object { $_.'display-name' -eq "$Prefix-ip" -and (Test-LabTag $_) })[0] }
}
if (-not $pub) {
  $pub = Invoke-Oci @('network', 'public-ip', 'create', '--compartment-id', $CompartmentId, '--lifetime', 'RESERVED', '--display-name', "$Prefix-ip", '--freeform-tags', $TagsFile)
  Write-Step 'reserved public IP created'
}
Set-State 'publicIpId' $pub.id
if (-not $pub.'private-ip-id' -or $pub.'private-ip-id' -ne $priv.id) {
  $pub = Invoke-Oci @('network', 'public-ip', 'update', '--public-ip-id', $pub.id, '--private-ip-id', $priv.id)
  Write-Step 'reserved public IP attached to the instance'
}
Set-State 'publicIp' $pub.'ip-address'
Set-State 'privateIpId' $priv.id
Set-State 'createdAt' (Get-Date).ToString('s')

Write-Step "done. State (OCIDs and the public IP) is in $StatePath; it is git-ignored. Do not paste it into the repo."
Write-Step 'next: wait for cloud-init (about 5 minutes), open a Bastion session (see README), then run stalwart/provision.sh on the VM.'
