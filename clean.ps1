# Clean Playwright outputs
Write-Host "Cleaning reports and test artifacts..."

$paths = @(
  "reports\playwright",
  "reports\results",
  "playwright-report",
  "test-results"
)

foreach ($p in $paths) {
  if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
}

# Recreate folders
New-Item -ItemType Directory -Force -Path reports\playwright | Out-Null
New-Item -ItemType Directory -Force -Path reports\results | Out-Null

# Remove root screenshots and temp logs
$rootFiles = Get-ChildItem -Path . -File -Include *.png, *.jpg, *_debug.txt, *_test_output.txt, test_output.txt, test_latest.txt, ws_messages.txt -ErrorAction SilentlyContinue
foreach ($f in $rootFiles) {
  try { Remove-Item -Force $f.FullName -ErrorAction SilentlyContinue } catch {}
}

Write-Host "Done."


