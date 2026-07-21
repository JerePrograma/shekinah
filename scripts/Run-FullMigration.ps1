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
Import-Module $modulePath -Force -DisableNameChecking

function Write-Section([string]$Title) {
    $script:CurrentStep = $Title
    Write-Host ''
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Assert-Path([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Falta un componente requerido: $Path" }
}

$script:CurrentStep = 'Inicialización'
$context = $null
$backupBefore = $null
$auditBefore = $null
$snapshotPromoted = $false
$snapshotCommitted = $false
$snapshotRoot = Join-Path $RepositoryRoot 'reference-snapshot'
$migrationRoot = Join-Path $RepositoryRoot '.migration-work'
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $migrationRoot "full-migration-$runStamp.log"
$candidateRoot = Join-Path $migrationRoot "snapshot-candidate-$runStamp"
$previousSnapshotRoot = Join-Path $migrationRoot "snapshot-before-$runStamp"
$failedSnapshotRoot = Join-Path $migrationRoot "snapshot-failed-$runStamp"
$docsBackupRoot = Join-Path $migrationRoot "docs-before-$runStamp"
$transcriptStarted = $false

trap {
    $failure = $_
    $command = if ($failure.Exception.Data.Contains('Command')) { [string]$failure.Exception.Data['Command'] } else { '(comando no disponible)' }
    $exitCode = if ($failure.Exception.Data.Contains('ExitCode')) { [string]$failure.Exception.Data['ExitCode'] } else { '1' }
    $message = $failure.Exception.Message

    if ($backupBefore) {
        try {
            $backupAfterFailure = Get-PathFingerprint $OriginalBackupRoot
            $auditAfterFailure = Get-PathFingerprint $OriginalAuditRoot
            if ($backupBefore.Fingerprint -ne $backupAfterFailure.Fingerprint -or
                $auditBefore.Fingerprint -ne $auditAfterFailure.Fingerprint) {
                Write-Host 'ALERTA: cambió una huella original durante el flujo fallido.' -ForegroundColor Red
            }
        }
        catch { Write-Host "No se pudo recalcular la huella tras el fallo: $($_.Exception.Message)" -ForegroundColor Yellow }
    }

    if ($snapshotPromoted -and -not $snapshotCommitted) {
        try {
            if (Test-Path -LiteralPath $snapshotRoot) {
                Move-Item -LiteralPath $snapshotRoot -Destination $failedSnapshotRoot
            }
            if (Test-Path -LiteralPath $previousSnapshotRoot) {
                Move-Item -LiteralPath $previousSnapshotRoot -Destination $snapshotRoot
            }
            if (Test-Path -LiteralPath $docsBackupRoot) {
                Get-ChildItem -LiteralPath $docsBackupRoot -File | ForEach-Object {
                    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $RepositoryRoot "docs\$($_.Name)") -Force
                }
            }
            Write-Host "Snapshot previo restaurado; la captura fallida quedó en $failedSnapshotRoot" -ForegroundColor Yellow
        }
        catch { Write-Host "No se pudo restaurar el snapshot previo: $($_.Exception.Message)" -ForegroundColor Red }
    }

    $gitStatus = try {
        (Invoke-NativeCapture -Command 'git' -Arguments @('status', '--short', '--branch') -WorkingDirectory $RepositoryRoot -AllowFailure).Output
    } catch { $_.Exception.Message }
    $composeStatus = try {
        $effectiveCompose = if ($ComposePath) { $ComposePath } else { Join-Path $WorkRoot 'compose.yaml' }
        (Invoke-NativeCapture -Command 'docker' -Arguments @(
            'compose', '-p', $ProjectName, '-f', $effectiveCompose, 'ps'
        ) -AllowFailure).Output
    } catch { $_.Exception.Message }

    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
        $transcriptStarted = $false
    }
    Add-Content -LiteralPath $logPath -Encoding utf8NoBOM -Value @"

=== FIRST REAL ERROR ===
Step: $script:CurrentStep
Command: $command
Exit code: $exitCode
Message: $message

=== GIT STATUS ===
$gitStatus

=== COMPOSE STATUS ===
$composeStatus
"@
    Write-Host ''
    Write-Host '=== FIRST REAL ERROR ===' -ForegroundColor Red
    Write-Host "Step: $script:CurrentStep"
    Write-Host "Command: $command"
    Write-Host "Exit code: $exitCode"
    Write-Host "Message: $message"
    Write-Host ''
    Write-Host '=== LAST 100 LOG LINES ==='
    Get-Content -LiteralPath $logPath -Tail 100
    Write-Host ''
    Write-Host '=== GIT STATUS ==='
    Write-Host $gitStatus
    Write-Host ''
    Write-Host '=== COMPOSE STATUS ==='
    Write-Host $composeStatus
    exit 1
}

if (-not (Test-Path -LiteralPath $RepositoryRoot -PathType Container)) {
    throw "No existe RepositoryRoot: $RepositoryRoot"
}
New-Item -ItemType Directory -Path $migrationRoot -Force | Out-Null
Start-Transcript -LiteralPath $logPath -Force | Out-Null
$transcriptStarted = $true

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
Write-Host "Fecha: $([DateTimeOffset]::Now.ToString('o'))"
Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
Write-Host "Respaldo original: $($backupBefore.Files) archivos; $($backupBefore.Fingerprint)"
Write-Host "Auditoría original: $($auditBefore.Files) archivos; $($auditBefore.Fingerprint)"

Write-Section 'Repositorio main limpio'
Set-Location -LiteralPath $RepositoryRoot
Invoke-Checked -Command 'git' -Arguments @('switch', 'main')
Invoke-Checked -Command 'git' -Arguments @('fetch', 'origin', '--prune')
Invoke-Checked -Command 'git' -Arguments @('pull', '--ff-only', 'origin', 'main')
$status = Invoke-NativeCapture -Command 'git' -Arguments @('status', '--short', '--branch') -WorkingDirectory $RepositoryRoot
Write-Host $status.StdOut
$dirty = (Invoke-NativeCapture -Command 'git' -Arguments @('status', '--porcelain=v1') -WorkingDirectory $RepositoryRoot).StdOut
if ($dirty) { throw "El repositorio debe estar limpio; no se descartará ningún cambio local:`n$dirty" }
$branch = (Invoke-NativeCapture -Command 'git' -Arguments @('branch', '--show-current') -WorkingDirectory $RepositoryRoot).StdOut.Trim()
if ($branch -ne 'main') { throw "La rama debe ser main. Detectada: $branch" }
$baseCommit = (Invoke-NativeCapture -Command 'git' -Arguments @('rev-parse', 'HEAD') -WorkingDirectory $RepositoryRoot).StdOut.Trim()
$remoteCommit = (Invoke-NativeCapture -Command 'git' -Arguments @('rev-parse', 'origin/main') -WorkingDirectory $RepositoryRoot).StdOut.Trim()
if ($baseCommit -ne $remoteCommit) { throw "main no coincide con origin/main: $baseCommit != $remoteCommit" }
Write-Host "SHA inicial: $baseCommit"

Write-Section 'Restauración Docker Compose'
Invoke-Checked -Command 'docker' -Arguments @('info')
$dockerVersion = (Invoke-NativeCapture -Command 'docker' -Arguments @('--version')).StdOut.Trim()
$composeVersion = (Invoke-NativeCapture -Command 'docker' -Arguments @('compose', 'version')).StdOut.Trim()
Write-Host "Docker: $dockerVersion"
Write-Host "Docker Compose: $composeVersion"
$environment = Read-DotEnv $envPath
$localPortText = Get-EnvValue $environment @('LOCAL_PORT')
if ($localPortText -notmatch '^\d{1,5}$') {
    throw "LOCAL_PORT no es válido en ${envPath}: $localPortText"
}
$localPort = [int]$localPortText
if ($localPort -lt 1 -or $localPort -gt 65535) {
    throw "LOCAL_PORT está fuera de rango en ${envPath}: $localPortText"
}
$sourceUrl = "http://localhost:$localPort"
Write-Host "URL de origen: $sourceUrl"
$context = @{ ProjectName = $ProjectName; ComposePath = (Resolve-Path $ComposePath).Path }
Invoke-Compose -Context $context -Arguments @('config', '--quiet')
$services = (Invoke-Compose -Context $context -Arguments @('config', '--services') -Capture).StdOut -split "`r?`n"
foreach ($service in @('db', 'wordpress', 'wpcli')) {
    if ($services -notcontains $service) { throw "El compose no define el servicio $service." }
}
Invoke-Compose -Context $context -Arguments @('up', '-d', 'db', 'wordpress')
foreach ($service in @('db', 'wordpress')) {
    $containerId = (Invoke-Compose -Context $context -Arguments @('ps', '-q', $service) -Capture).StdOut.Trim()
    Assert-ContainerId -Value $containerId -Service $service | Out-Null
}
Wait-ComposeDatabase -Context $context
Wait-Http "$sourceUrl/" | Out-Null
$permissionsRepaired = Repair-WordPressDatabaseAccess -Context $context -Environment $environment
$databaseImported = Import-WordPressDatabaseIfEmpty -Context $context -Environment $environment -WorkRoot $WorkRoot -SqlPath $SqlPath
$core = Invoke-WpCli -Context $context -Arguments @('core', 'is-installed') -AllowFailure
if ($core.ExitCode -ne 0) { throw "WordPress no está instalado o WP-CLI no puede leerlo:`n$($core.Output)" }
$tables = (Invoke-WpCli -Context $context -Arguments @('db', 'tables', '--all-tables-with-prefix')).StdOut -split "`r?`n"
if ($tables.Count -lt 2) { throw 'No se detectaron tablas WordPress suficientes.' }
foreach ($option in @('home', 'siteurl')) {
    $current = (Invoke-WpCli -Context $context -Arguments @('option', 'get', $option, '--skip-plugins', '--skip-themes') -AllowFailure).StdOut.TrimEnd('/')
    if ($current -ne $sourceUrl) {
        Invoke-WpCli -Context $context -Arguments @('option', 'update', $option, $sourceUrl, '--skip-plugins', '--skip-themes') | Out-Null
    }
}
foreach ($route in @('/', '/inicio/')) {
    $response = Wait-Http ($sourceUrl + $route)
    Write-Host "$route -> HTTP $($response.StatusCode); final $($response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri)"
}
Write-Host "WordPress y WP-CLI responden correctamente en $sourceUrl" -ForegroundColor Green

Write-Section 'Node.js, npm y Playwright'
$toolchain = Ensure-NodeToolchain
Write-Host "Node: $($toolchain.Node)"
Write-Host "npm: $($toolchain.Npm)"
Invoke-Checked -Command 'npm' -Arguments @('ci') -WorkingDirectory $RepositoryRoot
foreach ($binary in @('playwright.cmd', 'astro.cmd')) {
    $path = Join-Path $RepositoryRoot "node_modules\.bin\$binary"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Falta el ejecutable local: $path" }
}
Invoke-Checked -Command 'npm' -Arguments @('run', 'install:browsers') -WorkingDirectory $RepositoryRoot

Write-Section 'Inventarios públicos'
$dataRoot = Join-Path $candidateRoot 'data'
$siteRoot = Join-Path $candidateRoot 'site'
$screenshotsRoot = Join-Path $candidateRoot 'screenshots'
$manifestPath = Join-Path $candidateRoot 'manifest.json'
if (-not ([IO.Path]::GetFullPath($candidateRoot)).StartsWith([IO.Path]::GetFullPath($migrationRoot), [StringComparison]::OrdinalIgnoreCase)) {
    throw "La captura candidata debe quedar dentro de $migrationRoot"
}
Remove-Item -LiteralPath $candidateRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$inventory = Export-WordPressPublicData -Context $context -Destination $dataRoot -SourceUrl $sourceUrl
Write-Host "Menús clásicos: $($inventory.Menus); navegaciones de bloques: $($inventory.NavigationPosts)"

Write-Section 'Captura estática'
do {
    $rollbackTag = 'pre-wordpress-reference-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $tagExists = (Invoke-NativeCapture -Command 'git' -Arguments @('tag', '--list', $rollbackTag) -WorkingDirectory $RepositoryRoot).StdOut.Trim()
    if ($tagExists) { Start-Sleep -Seconds 1 }
} while ($tagExists)
Invoke-Checked -Command 'git' -Arguments @(
    'tag', '-a', $rollbackTag, $baseCommit, '-m', 'Estado previo al snapshot WordPress recuperado'
) -WorkingDirectory $RepositoryRoot
Write-Host "Tag local de rollback: $rollbackTag" -ForegroundColor Green
$env:SITE_URL = 'https://shekinah-7dl.pages.dev'
Invoke-Checked -Command 'node' -Arguments @(
    'scripts/wordpress-reference/capture.mjs', '--source', $sourceUrl, '--output', $siteRoot,
    '--screenshots', $screenshotsRoot, '--manifest', $manifestPath, '--metadata', $dataRoot,
    '--max-pages', $MaxPages.ToString()
) -WorkingDirectory $RepositoryRoot
Invoke-Checked -Command 'node' -Arguments @(
    'scripts/wordpress-reference/verify.mjs', '--required', '--snapshot-root', $candidateRoot
) -WorkingDirectory $RepositoryRoot

if (Test-Path -LiteralPath $previousSnapshotRoot) {
    throw "La copia de resguardo del snapshot ya existe: $previousSnapshotRoot"
}
if (Test-Path -LiteralPath $snapshotRoot) {
    Move-Item -LiteralPath $snapshotRoot -Destination $previousSnapshotRoot
}
$snapshotPromoted = $true
Move-Item -LiteralPath $candidateRoot -Destination $snapshotRoot
$manifestPath = Join-Path $snapshotRoot 'manifest.json'

Write-Section 'Verificaciones bloqueantes'
foreach ($arguments in @(
    @('run', 'verify:snapshot:required'), @('run', 'check'), @('run', 'lint'),
    @('run', 'format:check'), @('run', 'build'), @('run', 'test:unit'),
    @('run', 'test:powershell'), @('run', 'test:e2e'),
    @('run', 'audit:output'), @('run', 'audit:secrets')
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
New-Item -ItemType Directory -Path $docsBackupRoot -Force | Out-Null
foreach ($name in @('MIGRATION-STATUS.md', 'TEST-REPORT.md', 'CI-VERIFICATION.md')) {
    Copy-Item -LiteralPath (Join-Path $RepositoryRoot "docs\$name") -Destination (Join-Path $docsBackupRoot $name) -Force
}
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
    Invoke-Checked -Command 'git' -Arguments @('status') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @('diff') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @('diff', '--cached') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @(
        'add', 'reference-snapshot', 'docs/MIGRATION-STATUS.md',
        'docs/TEST-REPORT.md', 'docs/CI-VERIFICATION.md'
    )
    Invoke-Checked -Command 'git' -Arguments @(
        'diff', '--cached', '--check', '--', '.', ':(exclude)reference-snapshot/site/**'
    )
    $staged = ((& git diff --cached --name-only) | Out-String).Trim()
    if (-not $staged) { throw 'No hay snapshot nuevo para confirmar.' }
    if ($staged -match '(?im)(^|/)(?:\.env(?:\.|$)|wp-config\.php$)|\.(?:sql|zip|tar|gz|bak|log)$') {
        throw "El staging contiene archivos prohibidos:`n$staged"
    }
    Invoke-Checked -Command 'npm' -Arguments @('run', 'audit:secrets') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @('diff', '--cached') -WorkingDirectory $RepositoryRoot
    Invoke-Checked -Command 'git' -Arguments @('commit', '-m', 'content: publish recovered WordPress reference snapshot')
    $snapshotCommitted = $true
    $publishedCommit = (Invoke-NativeCapture -Command 'git' -Arguments @('rev-parse', 'HEAD') -WorkingDirectory $RepositoryRoot).StdOut.Trim()
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
Write-Host 'Result: SUCCESS'
Write-Host "Source URL: $sourceUrl"
Write-Host "Snapshot pages: $($manifest.totals.pages)"
Write-Host "Snapshot resources: $($manifest.totals.resources)"
Write-Host "Snapshot images: $($manifest.totals.images)"
Write-Host "Snapshot files: $($manifest.totals.files)"
Write-Host "Snapshot bytes: $($manifest.totals.bytes)"
Write-Host "Forms: $($manifest.totals.forms)"
Write-Host "HTTP errors: $($manifest.totals.httpErrors)"
Write-Host "Console errors: $($manifest.totals.consoleErrors)"
Write-Host 'Visual diff: 0 pixels'
Write-Host "Rollback tag: $rollbackTag"
Write-Host "Commit: $(if ($publishedCommit) { $publishedCommit } else { 'not-published' })"
Write-Host "Push: $(if ($Publish) { 'success' } else { 'not-requested' })"
Write-Host "CI: $ci"
Write-Host "Deployment: $deploy"
Write-Host 'Production URL: https://shekinah-7dl.pages.dev'
if ($transcriptStarted) {
    Stop-Transcript | Out-Null
    $transcriptStarted = $false
}
