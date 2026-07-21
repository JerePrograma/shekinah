[CmdletBinding()]
param(
    [string]$RepositoryRoot = 'C:\laburo\shekinah',
    [string]$WorkRoot = 'C:\laburo\shekinah-wordpress-reference',
    [string]$OriginalBackupRoot = 'C:\Users\Jerem\Downloads\shekinah.orig',
    [string]$OriginalAuditRoot = 'C:\Users\Jerem\Downloads\shekinah-original-audit',
    [string]$ProjectName = 'shekinah-original-reference',
    [string]$ComposePath = '',
    [string]$SqlPath = '',
    [int]$MaxPages = 300,
    [switch]$Publish,
    [switch]$WaitForRemote
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$modulePath = Join-Path $PSScriptRoot 'wordpress-reference\MigrationTools.psm1'
Import-Module $modulePath -Force

function Write-Section([string]$Title) {
    Write-Host ''
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Assert-Path([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Falta un componente requerido: $Path" }
}

Write-Section 'Precondiciones'
if (-not $ComposePath) { $ComposePath = Join-Path $WorkRoot 'compose.yaml' }
$envPath = Join-Path $WorkRoot '.env'
foreach ($path in @(
    $RepositoryRoot, (Join-Path $RepositoryRoot '.git'), (Join-Path $RepositoryRoot 'package.json'),
    $WorkRoot, $ComposePath, $envPath, $OriginalBackupRoot, $OriginalAuditRoot
)) { Assert-Path $path }
foreach ($command in @('docker', 'git')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command no está disponible en PATH." }
}
Invoke-Checked -Command 'docker' -Arguments @('info')

$resolvedRepository = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$resolvedWork = (Resolve-Path -LiteralPath $WorkRoot).Path
$resolvedOriginal = (Resolve-Path -LiteralPath $OriginalBackupRoot).Path
if ($resolvedRepository.StartsWith($resolvedOriginal, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedWork.StartsWith($resolvedOriginal, [StringComparison]::OrdinalIgnoreCase) -or
    $resolvedOriginal.StartsWith($resolvedRepository, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'El respaldo original debe permanecer separado del repositorio y de la restauración de trabajo.'
}
$backupBefore = Get-PathFingerprint $OriginalBackupRoot
$auditBefore = Get-PathFingerprint $OriginalAuditRoot
Write-Host "Respaldo original: $($backupBefore.Files) archivos; $($backupBefore.Fingerprint)"
Write-Host "Auditoría original: $($auditBefore.Files) archivos; $($auditBefore.Fingerprint)"

Write-Section 'Repositorio main limpio'
Set-Location -LiteralPath $RepositoryRoot
$branch = ((& git branch --show-current) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw "La rama debe ser main. Detectada: $branch" }
$dirty = @(& git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer git status.' }
if ($dirty.Count -gt 0) {
    $allowed = @('reference-snapshot/', 'docs/MIGRATION-STATUS.md', 'docs/TEST-REPORT.md', 'docs/CI-VERIFICATION.md')
    $unexpected = @($dirty | Where-Object {
        $file = ([string]$_).Substring(3).Replace('\', '/')
        -not ($allowed | Where-Object { $file.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })
    })
    if ($unexpected.Count -gt 0) { throw "Hay cambios locales ajenos a una captura interrumpida:`n$($unexpected -join "`n")" }
    Write-Host 'Se limpiará únicamente una salida de captura anterior incompleta.' -ForegroundColor Yellow
    Invoke-Checked -Command 'git' -Arguments @(
        'restore', '--source=HEAD', '--staged', '--worktree', '--', 'reference-snapshot',
        'docs/MIGRATION-STATUS.md', 'docs/TEST-REPORT.md', 'docs/CI-VERIFICATION.md'
    )
    Invoke-Checked -Command 'git' -Arguments @('clean', '-fd', '--', 'reference-snapshot')
}
Invoke-Checked -Command 'git' -Arguments @('fetch', 'origin', '--prune')
Invoke-Checked -Command 'git' -Arguments @('pull', '--ff-only', 'origin', 'main')
$baseCommit = ((& git rev-parse HEAD) | Out-String).Trim()
do {
    $rollbackTag = 'pre-wordpress-reference-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $tagExists = ((& git tag --list $rollbackTag) | Out-String).Trim()
    if ($tagExists) { Start-Sleep -Seconds 1 }
} while ($tagExists)
Invoke-Checked -Command 'git' -Arguments @('tag', '-a', $rollbackTag, $baseCommit, '-m', 'Estado previo al snapshot WordPress recuperado')
Write-Host "Tag local de rollback: $rollbackTag" -ForegroundColor Green

Write-Section 'Restauración Docker Compose'
$environment = Read-DotEnv $envPath
$localPortText = Get-EnvValue $environment @('LOCAL_PORT')
if ($localPortText -notmatch '^\d{1,5}$' -or [int]$localPortText -notin 1..65535) {
    throw "LOCAL_PORT no es válido en $envPath: $localPortText"
}
$sourceUrl = "http://localhost:$([int]$localPortText)"
$context = @{ ProjectName = $ProjectName; ComposePath = (Resolve-Path $ComposePath).Path }
$services = (Invoke-Compose -Context $context -Arguments @('config', '--services') -Capture).Output -split "`r?`n"
foreach ($service in @('db', 'wordpress', 'wpcli')) {
    if ($services -notcontains $service) { throw "El compose no define el servicio $service." }
}
Invoke-Compose -Context $context -Arguments @('up', '-d', 'db', 'wordpress')
Wait-ComposeDatabase -Context $context
$permissionsRepaired = Repair-WordPressDatabaseAccess -Context $context -Environment $environment
$databaseImported = Import-WordPressDatabaseIfEmpty -Context $context -Environment $environment -WorkRoot $WorkRoot -SqlPath $SqlPath
$core = Invoke-WpCli -Context $context -Arguments @('core', 'is-installed') -AllowFailure
if ($core.ExitCode -ne 0) { throw "WordPress no está instalado o WP-CLI no puede leerlo:`n$($core.Output)" }
$tables = (Invoke-WpCli -Context $context -Arguments @('db', 'tables', '--all-tables-with-prefix')).Output -split "`r?`n"
if ($tables.Count -lt 2) { throw 'No se detectaron tablas WordPress suficientes.' }
foreach ($option in @('home', 'siteurl')) {
    $current = (Invoke-WpCli -Context $context -Arguments @('option', 'get', $option, '--skip-plugins', '--skip-themes') -AllowFailure).Output.TrimEnd('/')
    if ($current -ne $sourceUrl) {
        Invoke-WpCli -Context $context -Arguments @('option', 'update', $option, $sourceUrl, '--skip-plugins', '--skip-themes') | Out-Null
    }
}
Wait-Http "$sourceUrl/inicio/" | Out-Null
Write-Host "WordPress responde en $sourceUrl/inicio/" -ForegroundColor Green

Write-Section 'Node.js, npm y Playwright'
$toolchain = Ensure-NodeToolchain
Invoke-Checked -Command 'npm' -Arguments @('ci') -WorkingDirectory $RepositoryRoot
foreach ($binary in @('playwright.cmd', 'astro.cmd')) {
    $path = Join-Path $RepositoryRoot "node_modules\.bin\$binary"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Falta el ejecutable local: $path" }
}
Invoke-Checked -Command 'npm' -Arguments @('run', 'install:browsers') -WorkingDirectory $RepositoryRoot

Write-Section 'Inventarios públicos'
$snapshotRoot = Join-Path $RepositoryRoot 'reference-snapshot'
$dataRoot = Join-Path $snapshotRoot 'data'
$siteRoot = Join-Path $snapshotRoot 'site'
$screenshotsRoot = Join-Path $snapshotRoot 'screenshots'
$manifestPath = Join-Path $snapshotRoot 'manifest.json'
$work = Join-Path $RepositoryRoot '.migration-work\wordpress-reference'
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dataRoot, $work -Force | Out-Null
Export-WpJson -Context $context -Arguments @(
    'plugin', 'list', '--fields=name,status,version,update,update_version,auto_update',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $dataRoot 'plugins.json') | Out-Null
Export-WpJson -Context $context -Arguments @(
    'theme', 'list', '--fields=name,status,version,update,update_version,auto_update',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $dataRoot 'themes.json') | Out-Null
Export-WpJson -Context $context -Arguments @(
    'post', 'list', '--post_type=post,page,wp_navigation,wp_template,wp_template_part',
    '--post_status=publish',
    '--fields=ID,post_type,post_title,post_name,post_date_gmt,post_modified_gmt,post_parent,menu_order,comment_status,ping_status',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $dataRoot 'published-content.json') | Out-Null
Export-WpJson -Context $context -Arguments @(
    'term', 'list', 'category', '--fields=term_id,name,slug,count,parent',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $dataRoot 'categories.json') -Optional | Out-Null
Export-WpJson -Context $context -Arguments @(
    'term', 'list', 'post_tag', '--fields=term_id,name,slug,count',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $dataRoot 'tags.json') -Optional | Out-Null
$menus = Export-WpJson -Context $context -Arguments @(
    'menu', 'list', '--fields=term_id,name,slug,count', '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $work 'menus.json') -Optional
$navigation = Export-WpJson -Context $context -Arguments @(
    'post', 'list', '--post_type=wp_navigation', '--post_status=publish',
    '--fields=ID,post_title,post_name,post_date_gmt,post_modified_gmt',
    '--format=json', '--skip-plugins', '--skip-themes'
) -Destination (Join-Path $work 'navigation.json') -Optional
[ordered]@{ classicMenus = @($menus); navigationPosts = @($navigation) } |
    ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath (Join-Path $dataRoot 'navigation.json') -Encoding utf8NoBOM
$publicOptions = [ordered]@{}
foreach ($name in @(
    'blogname', 'blogdescription', 'permalink_structure', 'show_on_front', 'page_on_front',
    'page_for_posts', 'timezone_string', 'gmt_offset', 'date_format', 'time_format',
    'posts_per_page', 'default_comment_status', 'blog_public', 'template', 'stylesheet'
)) {
    $value = Invoke-WpCli -Context $context -Arguments @('option', 'get', $name, '--skip-plugins', '--skip-themes') -AllowFailure
    if ($value.ExitCode -eq 0) { $publicOptions[$name] = $value.Output.Trim() }
}
$publicOptions | ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath (Join-Path $dataRoot 'public-settings.json') -Encoding utf8NoBOM

Write-Section 'Captura estática'
$env:SITE_URL = 'https://shekinah-7dl.pages.dev'
Invoke-Checked -Command 'node' -Arguments @(
    'scripts/wordpress-reference/capture.mjs', '--source', $sourceUrl, '--output', $siteRoot,
    '--screenshots', $screenshotsRoot, '--manifest', $manifestPath, '--metadata', $dataRoot,
    '--wordpress-root', (Join-Path $WorkRoot 'wordpress'), '--max-pages', $MaxPages.ToString()
) -WorkingDirectory $RepositoryRoot

Write-Section 'Verificaciones bloqueantes'
foreach ($arguments in @(
    @('run', 'verify:snapshot:required'), @('run', 'check'), @('run', 'lint'),
    @('run', 'format:check'), @('run', 'build'), @('run', 'test:unit'),
    @('run', 'test:e2e'), @('run', 'audit:output'), @('run', 'audit:secrets')
)) { Invoke-Checked -Command 'npm' -Arguments $arguments -WorkingDirectory $RepositoryRoot }
$previousReference = $env:WORDPRESS_REFERENCE_URL
try {
    $env:WORDPRESS_REFERENCE_URL = $sourceUrl
    Invoke-Checked -Command 'npm' -Arguments @('run', 'test:fidelity') -WorkingDirectory $RepositoryRoot
}
finally { $env:WORDPRESS_REFERENCE_URL = $previousReference }

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$captureDate = [DateTimeOffset]::Parse([string]$manifest.generatedAt).ToString('yyyy-MM-dd HH:mm:ss zzz')
$statusReport = @"
# Estado de migración

Fecha de actualización: **$(Get-Date -Format 'yyyy-MM-dd')**.

## Resultado local verificable

- WordPress restaurado: **disponible durante la captura**.
- Snapshot: **generado y verificado localmente**.
- Fuente local: $sourceUrl.
- Fecha de captura: $captureDate.
- Commit base: $baseCommit.
- Tag de rollback: $rollbackTag.
- Publicación, CI y Cloudflare: **pendientes hasta completar el flujo remoto**.

| Métrica | Valor |
| --- | ---: |
| Páginas | $($manifest.totals.pages) |
| Redirecciones | $($manifest.totals.redirects) |
| Recursos | $($manifest.totals.resources) |
| Recursos externos localizados | $($manifest.totals.externalResources) |
| Imágenes | $($manifest.totals.images) |
| Archivos | $($manifest.totals.files) |
| Bytes | $($manifest.totals.bytes) |
| Formularios | $($manifest.totals.forms) |
| Errores HTTP | $($manifest.totals.httpErrors) |
| Errores de consola | $($manifest.totals.consoleErrors) |
| Páginas no recuperables | $($manifest.totals.unrecoverablePages) |

La migración no se declara completa hasta obtener CI y deployment verdes para el mismo SHA y verificar https://shekinah-7dl.pages.dev.
"@
$testReport = @"
# Informe de pruebas

Fecha: **$(Get-Date -Format 'yyyy-MM-dd')**.

La captura local aprobó npm ci, snapshot requerido, check, lint, formato, build, unit tests, E2E, auditorías y fidelidad visual con maxDiffPixels: 0 en 375 × 812, 768 × 1024 y 1440 × 1200.

- Páginas: $($manifest.totals.pages)
- Recursos: $($manifest.totals.resources)
- Archivos: $($manifest.totals.files)
- Errores HTTP: $($manifest.totals.httpErrors)
- Errores de consola: $($manifest.totals.consoleErrors)
- Páginas no recuperables: $($manifest.totals.unrecoverablePages)

La verificación remota permanece pendiente hasta que GitHub Actions procese el commit publicado.
"@
$ciReport = @"
# Verificación de CI

Fecha de actualización: **$(Get-Date -Format 'yyyy-MM-dd')**.

- Commit base: $baseCommit.
- Tag de rollback: $rollbackTag.
- Snapshot: generado y aprobado localmente.
- Commit del snapshot: pendiente al generar este documento.
- CI del snapshot: pendiente.
- Deployment Cloudflare del mismo SHA: pendiente.

Este documento debe actualizarse con las URLs y conclusiones reales de ambos workflows después de la publicación.
"@
Set-Content -LiteralPath (Join-Path $RepositoryRoot 'docs\MIGRATION-STATUS.md') -Value $statusReport -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $RepositoryRoot 'docs\TEST-REPORT.md') -Value $testReport -Encoding utf8NoBOM
Set-Content -LiteralPath (Join-Path $RepositoryRoot 'docs\CI-VERIFICATION.md') -Value $ciReport -Encoding utf8NoBOM
$prettier = Join-Path $RepositoryRoot 'node_modules\.bin\prettier.cmd'
Invoke-Checked -Command $prettier -Arguments @(
    '--write', 'docs/MIGRATION-STATUS.md', 'docs/TEST-REPORT.md',
    'docs/CI-VERIFICATION.md', 'reference-snapshot/README.md'
) -WorkingDirectory $RepositoryRoot
Invoke-Checked -Command 'npm' -Arguments @('run', 'verify:snapshot:required') -WorkingDirectory $RepositoryRoot
Invoke-Checked -Command 'npm' -Arguments @('run', 'audit:secrets') -WorkingDirectory $RepositoryRoot
$backupAfter = Get-PathFingerprint $OriginalBackupRoot
$auditAfter = Get-PathFingerprint $OriginalAuditRoot
if ($backupBefore.Fingerprint -ne $backupAfter.Fingerprint -or $backupBefore.Files -ne $backupAfter.Files) {
    throw 'El respaldo original cambió. Se bloquea la publicación.'
}
if ($auditBefore.Fingerprint -ne $auditAfter.Fingerprint -or $auditBefore.Files -ne $auditAfter.Files) {
    throw 'La auditoría original cambió. Se bloquea la publicación.'
}

$publishedCommit = ''
$ci = 'not-requested'
$deploy = 'not-requested'
$production = 'not-requested'
if ($Publish) {
    Write-Section 'Commit y push'
    Invoke-Checked -Command 'git' -Arguments @(
        'add', 'reference-snapshot', 'docs/MIGRATION-STATUS.md',
        'docs/TEST-REPORT.md', 'docs/CI-VERIFICATION.md'
    )
    Invoke-Checked -Command 'git' -Arguments @('diff', '--cached', '--check')
    $staged = ((& git diff --cached --name-only) | Out-String).Trim()
    if (-not $staged) { throw 'No hay snapshot nuevo para confirmar.' }
    if ($staged -match '(?im)(^|/)(?:\.env(?:\.|$)|wp-config\.php$)|\.(?:sql|zip|tar|gz|bak|log)$') {
        throw "El staging contiene archivos prohibidos:`n$staged"
    }
    Invoke-Checked -Command 'npm' -Arguments @('run', 'audit:secrets') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @('commit', '-m', 'content: publish recovered WordPress reference snapshot')
    $publishedCommit = ((& git rev-parse HEAD) | Out-String).Trim()
    Invoke-Checked -Command 'git' -Arguments @('push', 'origin', 'main')
    Invoke-Checked -Command 'git' -Arguments @('push', 'origin', $rollbackTag)

    if ($WaitForRemote) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw '-WaitForRemote requiere GitHub CLI (gh).' }
        Invoke-Checked -Command 'gh' -Arguments @('auth', 'status')
        $repository = 'JerePrograma/shekinah'
        $deadline = (Get-Date).AddMinutes(30)
        $ciRun = $null
        do {
            $runs = @((& gh run list --repo $repository --commit $publishedCommit --json databaseId,workflowName,headSha --limit 20) | ConvertFrom-Json)
            $ciRun = $runs | Where-Object { $_.workflowName -eq 'CI' } | Select-Object -First 1
            if (-not $ciRun) { Start-Sleep -Seconds 5 }
        } while (-not $ciRun -and (Get-Date) -lt $deadline)
        if (-not $ciRun) { throw 'No apareció CI para el commit publicado.' }
        Invoke-Checked -Command 'gh' -Arguments @('run', 'watch', [string]$ciRun.databaseId, '--repo', $repository, '--exit-status')
        $ci = 'success'

        $deployRun = $null
        do {
            $runs = @((& gh run list --repo $repository --branch main --json databaseId,workflowName,headSha --limit 30) | ConvertFrom-Json)
            $deployRun = $runs | Where-Object {
                $_.workflowName -eq 'Deploy Cloudflare Pages' -and $_.headSha -eq $publishedCommit
            } | Select-Object -First 1
            if (-not $deployRun) { Start-Sleep -Seconds 5 }
        } while (-not $deployRun -and (Get-Date) -lt $deadline)
        if (-not $deployRun) { throw 'No apareció el deployment para el mismo SHA.' }
        Invoke-Checked -Command 'gh' -Arguments @('run', 'watch', [string]$deployRun.databaseId, '--repo', $repository, '--exit-status')
        $deploy = 'success'
        foreach ($route in @('/', '/inicio/', '/nosotros/', '/tienda/', '/blog/', '/recetas/', '/robots.txt')) {
            Wait-Http ('https://shekinah-7dl.pages.dev' + $route) -TimeoutSeconds 300 | Out-Null
        }
        $production = 'verified'
    }
}

Write-Section 'MIGRATION SUMMARY'
[ordered]@{
    sourceUrl = $sourceUrl
    node = $toolchain.Node
    npm = $toolchain.Npm
    baseCommit = $baseCommit
    rollbackTag = $rollbackTag
    permissionsRepaired = $permissionsRepaired
    databaseImported = $databaseImported
    published = [bool]$Publish
    publishedCommit = $publishedCommit
    ci = $ci
    deploy = $deploy
    production = $production
    pages = $manifest.totals.pages
    redirects = $manifest.totals.redirects
    resources = $manifest.totals.resources
    externalResources = $manifest.totals.externalResources
    images = $manifest.totals.images
    files = $manifest.totals.files
    bytes = $manifest.totals.bytes
    forms = $manifest.totals.forms
    httpErrors = $manifest.totals.httpErrors
    consoleErrors = $manifest.totals.consoleErrors
    unrecoverablePages = $manifest.totals.unrecoverablePages
    originalBackupIntact = $true
    originalAuditIntact = $true
    gitStatus = ((& git status --short --branch) | Out-String).Trim()
} | ConvertTo-Json -Depth 5
