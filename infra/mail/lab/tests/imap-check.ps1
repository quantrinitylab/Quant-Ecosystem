<#
.SYNOPSIS
  T6 from the laptop: IMAP login and fetch with curl.exe (imaps on 993).
.EXAMPLE
  $env:TEST_BOB_PASSWORD = '...'; .\imap-check.ps1 -TestHost mail.lab.quantrinity.in
#>
param(
  [string]$TestHost = $(if ($env:TEST_HOST) { $env:TEST_HOST } else { 'mail.lab.quantrinity.in' }),
  [string]$User = $(if ($env:TEST_BOB) { $env:TEST_BOB } else { 'bob@lab.quantrinity.in' }),
  [int]$Port = 993,
  [switch]$Insecure
)
$ErrorActionPreference = 'Continue'
if (-not $env:TEST_BOB_PASSWORD) { Write-Error 'set TEST_BOB_PASSWORD'; exit 2 }
$base = "imaps://${TestHost}:${Port}"
$common = @('--silent', '--show-error', '--max-time', '30', '--ssl-no-revoke')
if ($Insecure) { $common += '--insecure' }
$fail = $false

function Test-Curl([string]$Name, [string[]]$CurlArgs, [string]$Pass, [bool]$ExpectFailure = $false) {
  $out = & curl.exe @common --user "${User}:${Pass}" @CurlArgs 2>&1
  $ok = ($LASTEXITCODE -eq 0)
  if ($ExpectFailure) { $ok = -not $ok }
  $first = ($out | Select-Object -First 1) -as [string]
  if ($first -and $first.Length -gt 100) { $first = $first.Substring(0, 100) }
  if ($ok) { Write-Host "PASS $Name - $first" } else { Write-Host "FAIL $Name - $first"; $script:fail = $true }
}

Test-Curl 'IMAP login and LIST of mailboxes' @("$base/") $env:TEST_BOB_PASSWORD
Test-Curl 'SELECT INBOX and SEARCH ALL' @("$base/INBOX", '--request', 'SEARCH ALL') $env:TEST_BOB_PASSWORD
Test-Curl 'FETCH message 1 headers' @("$base/INBOX;MAILINDEX=1;SECTION=HEADER") $env:TEST_BOB_PASSWORD
Test-Curl 'wrong password is refused' @("$base/") 'definitely-wrong' $true
if ($fail) { exit 1 }
