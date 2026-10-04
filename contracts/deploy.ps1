# AGFusionRegistry deploy to Arc Testnet (Path A — Foundry)
# Usage:
#   1. Fund your wallet with Arc Testnet USDC: https://faucet.circle.com
#   2. Set private key for THIS session only (never commit):
#        $env:PRIVATE_KEY = "0x..."
#   3. Run:
#        cd contracts
#        .\deploy.ps1
#
# Optional:
#   $env:ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network"
#   $env:AGFUSION_METADATA_URI = "https://agfusion.vercel.app/identity/agfusion-agent.json"

$ErrorActionPreference = "Stop"
$foundryBin = Join-Path $env:USERPROFILE ".foundry\bin"
if (Test-Path $foundryBin) {
  $env:Path = "$foundryBin;$env:Path"
}

if (-not (Get-Command forge -ErrorAction SilentlyContinue)) {
  Write-Error "forge not found. Install Foundry first (see contracts/README.md)."
}

if (-not $env:PRIVATE_KEY) {
  Write-Host ""
  Write-Host "PRIVATE_KEY is not set." -ForegroundColor Yellow
  Write-Host "Export a throwaway/dev key from Rabby (or create with: cast wallet new)"
  Write-Host "Then in THIS terminal only:"
  Write-Host '  $env:PRIVATE_KEY = "0xYOUR_KEY"' -ForegroundColor Cyan
  Write-Host "Never paste the key into chat or git."
  Write-Host ""
  exit 1
}

if (-not $env:PRIVATE_KEY.StartsWith("0x")) {
  $env:PRIVATE_KEY = "0x$($env:PRIVATE_KEY)"
}

if (-not $env:ARC_TESTNET_RPC_URL) {
  $env:ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network"
}
if (-not $env:AGFUSION_METADATA_URI) {
  $env:AGFUSION_METADATA_URI = "https://agfusion.vercel.app/identity/agfusion-agent.json"
}

# forge script expects PRIVATE_KEY as uint hex for vm.envUint
# Our script uses vm.envUint("PRIVATE_KEY") — private key as number
# Better: use --private-key flag with forge script which is more reliable

Set-Location $PSScriptRoot

Write-Host "Building..." -ForegroundColor Cyan
forge build

$deployer = cast wallet address --private-key $env:PRIVATE_KEY
Write-Host "Deployer: $deployer" -ForegroundColor Green
Write-Host "RPC:      $($env:ARC_TESTNET_RPC_URL)"
Write-Host "Metadata: $($env:AGFUSION_METADATA_URI)"

$bal = cast balance $deployer --rpc-url $env:ARC_TESTNET_RPC_URL
Write-Host "Balance (wei native USDC): $bal"
if ($bal -eq "0") {
  Write-Host ""
  Write-Host "Wallet has 0 balance. Fund Arc Testnet USDC first:" -ForegroundColor Yellow
  Write-Host "  https://faucet.circle.com  (select Arc Testnet)"
  Write-Host "  Address: $deployer"
  Write-Host ""
  exit 1
}

Write-Host ""
Write-Host "Deploying AGFusionRegistry..." -ForegroundColor Cyan

forge script script/DeployAGFusionRegistry.s.sol:DeployAGFusionRegistry `
  --rpc-url $env:ARC_TESTNET_RPC_URL `
  --private-key $env:PRIVATE_KEY `
  --broadcast `
  -vvvv

Write-Host ""
Write-Host "Done. Copy 'AGFusionRegistry deployed at: 0x...' from the logs above." -ForegroundColor Green
Write-Host "Then verify (replace ADDRESS):" -ForegroundColor Cyan
Write-Host @"
forge verify-contract ADDRESS src/AGFusionRegistry.sol:AGFusionRegistry ``
  --chain-id 5042002 ``
  --verifier blockscout ``
  --verifier-url https://testnet.arcscan.app/api/ ``
  --constructor-args `$(cast abi-encode "constructor(string)" "$($env:AGFUSION_METADATA_URI)")
"@
