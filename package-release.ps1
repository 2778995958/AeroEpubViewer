param(
    [string]$Configuration = "Release",
    [string]$Platform = "x64",
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$solution = Join-Path $root "AeroEpubViewer.sln"
$projectDir = Join-Path $root "AeroEpubViewer"
$binDir = Join-Path $projectDir ("bin\{0}\{1}" -f $Platform, $Configuration)
$distDir = Join-Path $root "dist"
$stageDir = Join-Path $distDir "AeroEpubViewer"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = "v" + (Get-Date -Format "yyyyMMdd") + ".1"
}
$zipPath = Join-Path $distDir ("AeroEpubViewer-{0}-win-{1}.zip" -f $Version, $Platform)

$msbuild = "C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe"
if (-not (Test-Path -LiteralPath $msbuild)) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $found = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
        if ($found) { $msbuild = $found }
    }
}
if (-not (Test-Path -LiteralPath $msbuild)) {
    throw "MSBuild not found."
}

Write-Host "Building $Configuration|$Platform ..."
& $msbuild $solution "/p:Platform=$Platform" "/p:Configuration=$Configuration" /v:m
if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE."
}

$exe = Join-Path $binDir "AeroEpubViewer.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Build output not found: $exe"
}

if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

# 只複製執行期需要的檔案，排除偵錯檔、XML 文件、記錄檔與使用者設定。
# Cache 是執行時產生的 KFX 轉檔快取；Kfx2Epub 由使用者自行放入，都不打包。
$robocopyArgs = @(
    $binDir, $stageDir, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
    "/XF", "*.pdb", "*.xml", "debug.log", "*.log",
    "/XD", "UserSettings", "Cache", "Kfx2Epub"
)
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE."
}

$license = Join-Path $root "LICENSE"
if (Test-Path -LiteralPath $license) {
    Copy-Item -LiteralPath $license -Destination $stageDir -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDir,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $true
) | Out-Null

$size = (Get-Item -LiteralPath $zipPath).Length
Write-Host ("Release package: {0} ({1:N1} MB)" -f $zipPath, ($size / 1MB))
