[CmdletBinding()]
param(
    [string]$SourceUrl = 'http://localhost:8081',
    [string]$WorkRoot = 'C:\laburo\shekinah-wordpress-reference',
    [string]$RepositoryRoot = 'C:\laburo\shekinah',
    [string]$ProjectName = 'shekinah-original-reference',
    [int]$MaxPages = 200,
    [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Falló: $Command $($Arguments -join ' ')"
    }
}

function Invoke-WpCliJson {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,
        [Parameter(Mandatory)]
        [string]$Destination,
        [switch]$Optional
    )

    $stderrPath = Join-Path $MigrationWork ([Guid]::NewGuid().ToString('N') + '.stderr.txt')
    $output = & docker compose -p $ProjectName run --rm wpcli `
        --allow-root `
        --path=/var/www/html `
        @Arguments 2>$stderrPath
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $errorText = if (Test-Path -LiteralPath $stderrPath) {
            Get-Content -LiteralPath $stderrPath -Raw
        }
        else {
            ''
        }
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
        if ($Optional) {
            Set-Content -LiteralPath $Destination -Value "[]`n" -Encoding UTF8
            return
        }
        throw "Falló WP-CLI: $($Arguments -join ' ')`n$errorText"
    }

    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    $text = ($output | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        $text = '[]'
    }

    try {
        $null = $text | ConvertFrom-Json
    }
    catch {
        throw "WP-CLI no devolvió JSON válido para: $($Arguments -join ' ')`n$text"
    }

    Set-Content -LiteralPath $Destination -Value ($text + "`n") -Encoding UTF8
}

Write-Host ''
Write-Host '=== Migración WordPress restaurado → repositorio Shekinah ===' -ForegroundColor Cyan

$RequiredPaths = @(
    $WorkRoot,
    (Join-Path $WorkRoot 'compose.yaml'),
    (Join-Path $WorkRoot 'wordpress\wp-content\uploads'),
    $RepositoryRoot,
    (Join-Path $RepositoryRoot '.git'),
    (Join-Path $RepositoryRoot 'package.json')
)
foreach ($requiredPath in $RequiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Falta un componente requerido: $requiredPath"
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker no está disponible en PATH.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js no está disponible en PATH.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm no está disponible en PATH.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git no está disponible en PATH.'
}

try {
    $sourceResponse = Invoke-WebRequest -Uri "$SourceUrl/inicio/" -MaximumRedirection 10 -TimeoutSec 20
    if ($sourceResponse.StatusCode -lt 200 -or $sourceResponse.StatusCode -ge 400) {
        throw "La fuente respondió HTTP $($sourceResponse.StatusCode)."
    }
}
catch {
    throw "El WordPress de referencia no responde en $SourceUrl/inicio/: $($_.Exception.Message)"
}

Set-Location -LiteralPath $WorkRoot
Invoke-CheckedCommand -Command 'docker' -Arguments @('compose', '-p', $ProjectName, 'up', '-d', 'db', 'wordpress')
Invoke-CheckedCommand -Command 'docker' -Arguments @('compose', '-p', $ProjectName, 'ps')

Set-Location -LiteralPath $RepositoryRoot
$currentBranch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $currentBranch -ne 'main') {
    throw "La rama actual debe ser main. Rama detectada: $currentBranch"
}

$dirtyState = (& git status --porcelain=v1) | Out-String
if (-not [string]::IsNullOrWhiteSpace($dirtyState)) {
    throw @"
El repositorio tiene cambios locales. La migración se detuvo para no mezclarlos:
$dirtyState
Guardá, confirmá o descartá esos cambios y ejecutá nuevamente.
"@
}

Invoke-CheckedCommand -Command 'git' -Arguments @('fetch', 'origin', '--prune')
Invoke-CheckedCommand -Command 'git' -Arguments @('pull', '--ff-only', 'origin', 'main')

$headSha = (& git rev-parse HEAD).Trim()
$tagName = 'pre-wordpress-reference-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Invoke-CheckedCommand -Command 'git' -Arguments @('tag', '-a', $tagName, $headSha, '-m', 'Estado previo a publicar el snapshot WordPress recuperado')

$MigrationWork = Join-Path $RepositoryRoot '.migration-work\wordpress-reference'
$SnapshotRoot = Join-Path $RepositoryRoot 'reference-snapshot'
$DataRoot = Join-Path $SnapshotRoot 'data'
$SiteRoot = Join-Path $SnapshotRoot 'site'
$ScreenshotsRoot = Join-Path $SnapshotRoot 'screenshots'
$ManifestPath = Join-Path $SnapshotRoot 'manifest.json'

Remove-Item -LiteralPath $MigrationWork -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $MigrationWork -Force | Out-Null
New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null

Write-Host ''
Write-Host '=== Inventario público de WordPress ===' -ForegroundColor Cyan
Set-Location -LiteralPath $WorkRoot

Invoke-WpCliJson -Arguments @(
    'plugin', 'list',
    '--fields=name,status,version,update,update_version,auto_update',
    '--format=json',
    '--skip-plugins',
    '--skip-themes'
) -Destination (Join-Path $DataRoot 'plugins.json')

Invoke-WpCliJson -Arguments @(
    'theme', 'list',
    '--fields=name,status,version,update,update_version,auto_update',
    '--format=json',
    '--skip-plugins',
    '--skip-themes'
) -Destination (Join-Path $DataRoot 'themes.json')

Invoke-WpCliJson -Arguments @(
    'post', 'list',
    '--post_type=post,page,wp_navigation,wp_template,wp_template_part',
    '--post_status=publish',
    '--fields=ID,post_type,post_title,post_name,post_date_gmt,post_modified_gmt,post_parent,menu_order,comment_status,ping_status',
    '--format=json',
    '--skip-plugins',
    '--skip-themes'
) -Destination (Join-Path $DataRoot 'published-content.json')

Invoke-WpCliJson -Arguments @(
    'term', 'list', 'category',
    '--fields=term_id,name,slug,count',
    '--format=json',
    '--skip-plugins',
    '--skip-themes'
) -Destination (Join-Path $DataRoot 'categories.json') -Optional

Invoke-WpCliJson -Arguments @(
    'term', 'list', 'post_tag',
    '--fields=term_id,name,slug,count',
    '--format=json',
    '--skip-plugins',
    '--skip-themes'
) -Destination (Join-Path $DataRoot 'tags.json') -Optional

$PublicOptionNames = @(
    'blogname',
    'blogdescription',
    'permalink_structure',
    'show_on_front',
    'page_on_front',
    'page_for_posts',
    'timezone_string',
    'gmt_offset',
    'date_format',
    'time_format',
    'posts_per_page',
    'default_comment_status',
    'blog_public',
    'template',
    'stylesheet'
)
$PublicOptions = [ordered]@{}
foreach ($optionName in $PublicOptionNames) {
    $value = & docker compose -p $ProjectName run --rm wpcli `
        --allow-root `
        --path=/var/www/html `
        option get $optionName `
        --skip-plugins `
        --skip-themes 2>$null
    if ($LASTEXITCODE -eq 0) {
        $PublicOptions[$optionName] = (($value | Out-String).Trim())
    }
}
$PublicOptions |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $DataRoot 'public-settings.json') -Encoding UTF8

Write-Host ''
Write-Host '=== Captura navegable y recursos originales ===' -ForegroundColor Cyan
Set-Location -LiteralPath $RepositoryRoot
Invoke-CheckedCommand -Command 'npm' -Arguments @('ci')

$CaptureArguments = @(
    'scripts/wordpress-reference/capture.mjs',
    '--source', $SourceUrl,
    '--output', $SiteRoot,
    '--screenshots', $ScreenshotsRoot,
    '--manifest', $ManifestPath,
    '--metadata', $DataRoot,
    '--wordpress-root', (Join-Path $WorkRoot 'wordpress'),
    '--max-pages', $MaxPages.ToString()
)
Invoke-CheckedCommand -Command 'node' -Arguments $CaptureArguments

Write-Host ''
Write-Host '=== Verificaciones ===' -ForegroundColor Cyan
Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'verify:snapshot')
Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'build')
Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'audit:output')
Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'test:e2e')

$PreviousReferenceUrl = $env:WORDPRESS_REFERENCE_URL
try {
    $env:WORDPRESS_REFERENCE_URL = $SourceUrl
    Invoke-CheckedCommand -Command 'npm' -Arguments @('run', 'test:fidelity')
}
finally {
    $env:WORDPRESS_REFERENCE_URL = $PreviousReferenceUrl
}

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
Write-Host ''
Write-Host 'Snapshot generado:' -ForegroundColor Green
Write-Host "  Páginas:        $($Manifest.totals.pages)"
Write-Host "  Redirecciones:  $($Manifest.totals.redirects)"
Write-Host "  Recursos HTTP:  $($Manifest.totals.resources)"
Write-Host "  Archivos:       $($Manifest.totals.files)"
Write-Host "  Bytes:          $($Manifest.totals.bytes)"
Write-Host "  Medios copiados:$($Manifest.totals.copiedPublicFiles)"
Write-Host "  Formularios detectados: $($Manifest.dynamicFeatures.Count)"
Write-Host "  Errores de consola únicos: $($Manifest.consoleErrors.Count)"

Remove-Item -LiteralPath $MigrationWork -Recurse -Force -ErrorAction SilentlyContinue

if ($Publish) {
    Write-Host ''
    Write-Host '=== Commit y publicación ===' -ForegroundColor Cyan
    Invoke-CheckedCommand -Command 'git' -Arguments @('add', 'reference-snapshot')
    $staged = (& git diff --cached --name-only) | Out-String
    if ([string]::IsNullOrWhiteSpace($staged)) {
        throw 'No hay cambios generados para confirmar.'
    }
    Invoke-CheckedCommand -Command 'git' -Arguments @('commit', '-m', 'content: publish recovered WordPress reference snapshot')
    Invoke-CheckedCommand -Command 'git' -Arguments @('push', 'origin', 'main')
    Invoke-CheckedCommand -Command 'git' -Arguments @('push', 'origin', $tagName)
    Write-Host 'Snapshot publicado en origin/main.' -ForegroundColor Green
}
else {
    Write-Host ''
    Write-Host 'La captura quedó generada y verificada, pero todavía no fue publicada.' -ForegroundColor Yellow
    Write-Host 'Revisá reference-snapshot y luego ejecutá:'
    Write-Host '  git add reference-snapshot'
    Write-Host '  git commit -m "content: publish recovered WordPress reference snapshot"'
    Write-Host '  git push origin main'
    Write-Host "  git push origin $tagName"
}
