# Set HCNSEC (api.hcnsec.cn) API key on Vercel Production and redeploy.
#
# Usage:
#   cd C:\Users\sayed\.grok\bin\agfusion
#   .\scripts\set-hcnsec-key.ps1 -ApiKey "your-key" -Model "gpt-4o-mini"
#
# Get a key from your HCNSEC provider dashboard (https://api.hcnsec.cn/).

param(
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,
  [string]$Model = "gpt-4o-mini",
  [string]$BaseUrl = "https://api.hcnsec.cn"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Clean-Secret([string]$s) {
  if ($null -eq $s) { return "" }
  $s = $s.Trim().Trim([char]0xFEFF)
  $s = $s.Trim('"').Trim("'")
  $s = $s -replace '[\u200B-\u200D\uFEFF\u00A0]', ''
  $s = $s -replace '[\r\n\t ]', ''
  $s = $s -replace '^Bearer', ''
  return $s
}

function Set-VercelEnvNoNewline {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $tmp = Join-Path $env:TEMP "vercel-env-$Name-$PID.txt"
  [System.IO.File]::WriteAllText($tmp, $Value)

  Write-Host "  Removing old $Name (if any)..."
  $null = & npx vercel env rm $Name production --yes 2>&1

  Write-Host "  Adding $Name (len=$($Value.Length))..."
  $cmd = "type `"$tmp`" | npx vercel env add $Name production"
  $out = cmd /c $cmd 2>&1 | ForEach-Object { "$_" }
  $out | ForEach-Object { Write-Host "    $_" }
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { throw "Failed to set $Name" }
}

$key = Clean-Secret $ApiKey
if ($key.Length -lt 8) {
  Write-Host "ERROR: Key too short." -ForegroundColor Red
  exit 1
}

Write-Host "Setting HCNSEC on Production" -ForegroundColor Cyan
Write-Host "  base = $BaseUrl"
Write-Host "  model = $Model"
Write-Host "  key len = $($key.Length)"

try {
  Set-VercelEnvNoNewline -Name "HCNSEC_API_KEY" -Value $key
  Set-VercelEnvNoNewline -Name "HCNSEC_BASE_URL" -Value $BaseUrl.TrimEnd('/')
  Set-VercelEnvNoNewline -Name "HCNSEC_MODEL" -Value $Model

  # Remove old AgentRouter / Anthropic gateway leftovers
  foreach ($name in @(
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_MODEL",
      "AGENTROUTER_API_KEY",
      "AGENTROUTER_BASE_URL",
      "AGENTROUTER_MODEL"
    )) {
    Write-Host "  Removing $name (legacy)..."
    $null = & npx vercel env rm $name production --yes 2>&1
  }
} catch {
  Write-Host "ERROR: $_" -ForegroundColor Red
  exit 1
}

Write-Host "Redeploying production..." -ForegroundColor Cyan
& npx vercel --prod --yes 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Check https://agfusion.vercel.app/api/config" -ForegroundColor Green
Write-Host "  Expect: llmProvider=hcnsec, llmBaseHost=api.hcnsec.cn"
