param(
    [string]$DiagramDirectory = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$diagramRoot = (Resolve-Path -LiteralPath $DiagramDirectory).Path
$files = Get-ChildItem -LiteralPath $diagramRoot -Filter "*.md" -File |
    Where-Object { $_.BaseName -match "^\d{2}-" }
$browserCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$browserPath = $browserCandidates | Where-Object {
    Test-Path -LiteralPath $_
} | Select-Object -First 1
$puppeteerConfigPath = $null

if ($browserPath) {
    $puppeteerConfigPath = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) "risk-zero-puppeteer-config.json"
    $puppeteerConfig = @{
        executablePath = $browserPath
        headless = $true
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText(
        $puppeteerConfigPath,
        $puppeteerConfig,
        [System.Text.UTF8Encoding]::new($false)
    )
}

foreach ($file in $files) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName
    $match = [regex]::Match(
        $content,
        '```mermaid\r?\n(?<source>[\s\S]*?)\r?\n```',
        [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
    )
    if (-not $match.Success) {
        throw "Mermaid block not found: $($file.FullName)"
    }

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) "$($file.BaseName).mmd"
    $outputPath = Join-Path $diagramRoot "$($file.BaseName).png"
    [System.IO.File]::WriteAllText(
        $tempPath,
        $match.Groups["source"].Value,
        [System.Text.UTF8Encoding]::new($false)
    )

    try {
        & pnpm dlx @mermaid-js/mermaid-cli `
            --input $tempPath `
            --output $outputPath `
            --backgroundColor white `
            --scale 2 `
            $(if ($puppeteerConfigPath) {
                "--puppeteerConfigFile"
                $puppeteerConfigPath
            })
        if ($LASTEXITCODE -ne 0) {
            throw "Mermaid rendering failed: $($file.Name)"
        }
    }
    finally {
        Remove-Item -LiteralPath $tempPath -ErrorAction SilentlyContinue
    }
}

if ($puppeteerConfigPath) {
    Remove-Item -LiteralPath $puppeteerConfigPath -ErrorAction SilentlyContinue
}
