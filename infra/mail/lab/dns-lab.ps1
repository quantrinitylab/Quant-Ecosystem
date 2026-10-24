<#
.SYNOPSIS
  Publishes the DNS records of the Stalwart lab to Cloudflare. Only under lab.quantrinity.in.

.DESCRIPTION
  Records (all names are inside the lab domain, nothing else is read or written):
    A     mail.lab.quantrinity.in          -> lab public IP (from lab/.state/lab-state.json or -Ip)
    MX    lab.quantrinity.in               -> mail.lab.quantrinity.in (priority 10)
    TXT   lab.quantrinity.in               SPF: ip4 of the lab, mx, optional relay include, ~all
    TXT   _dmarc.lab.quantrinity.in        DMARC p=none
    TXT   <selector>._domainkey.lab...     DKIM public keys, taken from the zone file Stalwart generated
                                           (-DkimZoneFile, output of stalwart/provision.sh dns)

  Safety rules:
    * The token is read from the environment variable CLOUDFLARE_DNS_TOKEN (process, else user scope).
    * Every record name is checked: it must be the lab domain or end with ".lab.quantrinity.in".
      The apex of quantrinity.in, quantmail.in and all other names are never touched.
    * Records created here carry the comment "quant-lab: managed by infra/mail/lab/dns-lab.ps1".
      Existing records are updated only if they carry that comment. A foreign record with different content
      is reported and left alone, unless -AdoptExisting is given.
    * Stalwart publishes the DKIM records itself when its Cloudflare DNS server is configured
      (plan/10-tls-dns01). A DKIM record that already exists with the same content is simply reported as present.
    * -Remove deletes only records that carry the comment above.

.PARAMETER DryRun         Show what would change; send no write request.
.PARAMETER Remove         Delete the records managed by this script (teardown).
.PARAMETER AdoptExisting  Take over an existing record at the same name/type by updating it and adding the comment.
.EXAMPLE
  .\dns-lab.ps1 -DryRun
  .\dns-lab.ps1 -RelaySpfInclude spf.example.net -DkimZoneFile .\zone.txt
  .\dns-lab.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string]$Zone = 'quantrinity.in',
  [string]$LabDomain = 'lab.quantrinity.in',
  [string]$MailHost = 'mail.lab.quantrinity.in',
  [string]$Ip = '',
  [string]$StatePath = '',
  [string]$RelaySpfInclude = '',
  [string]$DkimZoneFile = '',
  [string]$DmarcRua = 'mailto:postmaster@lab.quantrinity.in',
  [int]$Ttl = 300,
  [switch]$DryRun,
  [switch]$Remove,
  [switch]$AdoptExisting
)

Set-StrictMode -Version 1
$ErrorActionPreference = 'Stop'
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $StatePath) { $StatePath = Join-Path $ScriptDir '.state\lab-state.json' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Marker = 'quant-lab: managed by infra/mail/lab/dns-lab.ps1'
$Api = 'https://api.cloudflare.com/client/v4'

function Write-Step([string]$Message) { Write-Host "[dns-lab] $Message" }

# ---- guards --------------------------------------------------------------------------------------
if (-not $LabDomain.EndsWith(".$Zone")) { throw "LabDomain '$LabDomain' must be a subdomain of the zone '$Zone'." }
if ($LabDomain -eq $Zone) { throw 'LabDomain must not be the zone apex.' }

function Assert-LabName([string]$Name) {
  $n = $Name.TrimEnd('.').ToLowerInvariant()
  if ($n -ne $LabDomain -and -not $n.EndsWith(".$LabDomain")) {
    throw "Refusing to touch '$Name': only $LabDomain and names below it are allowed."
  }
  return $n
}

$Token = $env:CLOUDFLARE_DNS_TOKEN
if (-not $Token) { $Token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_DNS_TOKEN', 'User') }
if (-not $Token) { throw 'CLOUDFLARE_DNS_TOKEN is not set (process or user environment).' }
$Headers = @{ Authorization = "Bearer $Token" }

function Invoke-Cf {
  param([string]$Method, [string]$Path, $Body = $null)
  $args2 = @{ Uri = "$Api$Path"; Method = $Method; Headers = $Headers; ContentType = 'application/json' }
  if ($null -ne $Body) { $args2.Body = ($Body | ConvertTo-Json -Depth 6 -Compress) }
  try {
    $r = Invoke-RestMethod @args2
  } catch {
    $detail = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
    throw "Cloudflare $Method $Path failed: $detail $($_.Exception.Message)"
  }
  if (-not $r.success) { throw "Cloudflare $Method $Path returned success=false: $($r.errors | ConvertTo-Json -Compress)" }
  return $r
}

# ---- zone ------------------------------------------------------------------------------------------
$zoneResp = Invoke-Cf 'GET' "/zones?name=$Zone"
if (@($zoneResp.result).Count -ne 1) { throw "Zone $Zone not found or not visible to this token." }
$ZoneId = @($zoneResp.result)[0].id
Write-Step "zone $Zone found"

function Get-Records([string]$Type, [string]$Name) {
  $n = Assert-LabName $Name
  $r = Invoke-Cf 'GET' ("/zones/$ZoneId/dns_records?type=$Type&name=$n&per_page=100")
  return @($r.result)
}

# ---- teardown ----------------------------------------------------------------------------------------
if ($Remove) {
  $page = 1; $all = @()
  do {
    $r = Invoke-Cf 'GET' ("/zones/$ZoneId/dns_records?per_page=100&page=$page&name.endswith=$LabDomain")
    $all += @($r.result)
    $page++
  } while ($r.result_info -and $page -le [int]$r.result_info.total_pages)
  $mine = @($all | Where-Object { $_.comment -eq $Marker -and ($_.name -eq $LabDomain -or $_.name.EndsWith(".$LabDomain")) })
  Write-Step "$($mine.Count) managed record(s) found"
  foreach ($rec in $mine) {
    Assert-LabName $rec.name | Out-Null
    if ($DryRun) { Write-Step "would delete $($rec.type) $($rec.name)"; continue }
    Invoke-Cf 'DELETE' "/zones/$ZoneId/dns_records/$($rec.id)" | Out-Null
    Write-Step "deleted $($rec.type) $($rec.name)"
  }
  return
}

# ---- desired records ----------------------------------------------------------------------------------
if (-not $Ip) {
  if (Test-Path $StatePath) {
    $st = Get-Content -Raw $StatePath | ConvertFrom-Json
    if ($st.PSObject.Properties['publicIp']) { $Ip = [string]$st.publicIp }
  }
}
if (-not $Ip) { throw 'No lab IP: pass -Ip or run create-lab.ps1 first (it writes lab/.state/lab-state.json).' }
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'The IP must be an IPv4 address.' }

$spf = "v=spf1 ip4:$Ip mx"
if ($RelaySpfInclude) { $spf += " include:$RelaySpfInclude" }
$spf += ' ~all'
$dmarc = "v=DMARC1; p=none; rua=$DmarcRua"

$desired = @()
$desired += @{ Type = 'A'; Name = $MailHost; Content = $Ip; Priority = $null; Match = $null }
$desired += @{ Type = 'MX'; Name = $LabDomain; Content = $MailHost; Priority = 10; Match = $null }
$desired += @{ Type = 'TXT'; Name = $LabDomain; Content = $spf; Priority = $null; Match = 'v=spf1' }
$desired += @{ Type = 'TXT'; Name = "_dmarc.$LabDomain"; Content = $dmarc; Priority = $null; Match = 'v=DMARC1' }

if ($DkimZoneFile) {
  foreach ($line in Get-Content $DkimZoneFile) {
    if ($line -notmatch '^\s*(\S+)\s+(?:\d+\s+)?IN\s+TXT\s+(.+?)\s*$') { continue }
    $rawName = $Matches[1]
    $rawValue = $Matches[2]
    if ($rawName -notmatch '_domainkey') { continue }
    $name = $rawName.TrimEnd('.')
    $parts = [regex]::Matches($rawValue, '"((?:[^"\\]|\\.)*)"') | ForEach-Object { $_.Groups[1].Value }
    $content = ($parts -join '')
    if ($content -match '^v=DKIM1') { $desired += @{ Type = 'TXT'; Name = $name; Content = $content; Priority = $null; Match = $content } }
  }
  Write-Step "$(@($desired | Where-Object { $_.Name -match '_domainkey' }).Count) DKIM record(s) read from $DkimZoneFile"
} else {
  Write-Step 'no -DkimZoneFile: DKIM records are expected from Stalwart (automatic DNS) or a later run'
}

# ---- apply ------------------------------------------------------------------------------------------------
$summary = @()
foreach ($d in $desired) {
  $name = Assert-LabName $d.Name
  $existing = Get-Records $d.Type $name
  if ($d.Match) { $existing = @($existing | Where-Object { ([string]$_.content).Trim('"').StartsWith($d.Match) }) }
  $payload = @{ type = $d.Type; name = $name; content = $d.Content; ttl = $Ttl; comment = $Marker }
  if ($d.Type -eq 'A') { $payload.proxied = $false }
  if ($null -ne $d.Priority) { $payload.priority = $d.Priority }

  if (@($existing).Count -eq 0) {
    if ($DryRun) { $summary += "would create $($d.Type) $name"; continue }
    Invoke-Cf 'POST' "/zones/$ZoneId/dns_records" $payload | Out-Null
    $summary += "created   $($d.Type) $name"
    continue
  }
  $rec = @($existing)[0]
  $same = (([string]$rec.content).Trim('"') -eq $d.Content)
  if ($same -and $rec.comment -ne $Marker) { $summary += "present   $($d.Type) $name (same content, not owned by this script)"; continue }
  if ($same) { $summary += "unchanged $($d.Type) $name"; continue }
  if ($rec.comment -eq $Marker -or $AdoptExisting) {
    if ($DryRun) { $summary += "would update $($d.Type) $name"; continue }
    Invoke-Cf 'PATCH' "/zones/$ZoneId/dns_records/$($rec.id)" $payload | Out-Null
    $summary += "updated   $($d.Type) $name"
  } else {
    $summary += "SKIPPED   $($d.Type) $name exists with different content and is not managed here (use -AdoptExisting to take it over)"
  }
}

$summary | ForEach-Object { Write-Step $_ }
Write-Step 'done. Real mail domains (quantmail.in, the root of quantrinity.in) were not touched.'
