$base = 'e:\Projects\tclxtommy-hu.github.io\posts\AI\Harness'
$d = Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -like 'harness*' }
$dir = Join-Path $d[0].FullName 'AgentScope'
Remove-Item -LiteralPath (Join-Path $dir 'raw.html') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $dir 'img_urls.txt') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $base 'fetch.ps1') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $base 'extract_imgs.ps1') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $base 'download_imgs.ps1') -Force -ErrorAction SilentlyContinue
Write-Host 'cleaned'
Get-ChildItem -LiteralPath $dir | ForEach-Object { Write-Host ($_.Name + '  ' + $_.Length) }
