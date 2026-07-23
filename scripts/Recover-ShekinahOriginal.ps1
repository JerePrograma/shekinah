[CmdletBinding()]
param(
    [string]$RepoPath = 'C:\laburo\shekinah',
    [string]$ReferencePath = 'C:\laburo\shekinah-wordpress-reference',
    [string]$ArchivePath = '',
    [switch]$DownloadAssets,
    [switch]$RestoreWordPress,
    [switch]$RunVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedArchiveSha256 = '9ecc8d7d2846d34392880cac5f1f41be62794cacf84843c5ec0fb19988fa8ced'
$ExpectedArchiveSize = 185111245L
$OriginalOrigin = 'https://herbalarioonline.com'
$LogRootName = '.migration-work\logs'
$CaptureRootName = '.migration-work\hostinger-public'
$GeneratedRootName = 'generated\hostinger-original'
$AssetRootName = 'public\images\original\catalog'

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Title)
    Write-Host ''
    Write-Host ('=== {0} ===' -f $Title) -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory = ''
    )
    $PreviousLocation = Get-Location
    try {
        if ($WorkingDirectory) {
            Set-Location -LiteralPath $WorkingDirectory
        }
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw ('{0} finalizó con código {1}' -f $Command, $LASTEXITCODE)
        }
    }
    finally {
        Set-Location -LiteralPath $PreviousLocation
    }
}

function Get-CommandPath {
    param([Parameter(Mandatory = $true)][string]$Name)
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $Command) {
        throw ('No se encontró {0} en PATH.' -f $Name)
    }
    return $Command.Source
}

function ConvertTo-Version {
    param([Parameter(Mandatory = $true)][string]$Value)
    $Match = [regex]::Match($Value, '(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)')
    if (-not $Match.Success) {
        throw ('No se pudo interpretar la versión: {0}' -f $Value)
    }
    return [version]::new(
        [int]$Match.Groups['major'].Value,
        [int]$Match.Groups['minor'].Value,
        [int]$Match.Groups['patch'].Value
    )
}

function Assert-MinimumVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][version]$Actual,
        [Parameter(Mandatory = $true)][version]$Minimum
    )
    if ($Actual -lt $Minimum) {
        throw ('{0} {1} no cumple el mínimo {2}.' -f $Name, $Actual, $Minimum)
    }
}

function Get-SanitizedGitStatus {
    param([Parameter(Mandatory = $true)][string]$Repository)
    $Output = & git -C $Repository status --short
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo obtener git status --short.'
    }
    return @($Output)
}

function Assert-Archive {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw ('No se encontró el RAR: {0}' -f $Path)
    }
    $Item = Get-Item -LiteralPath $Path
    if ($Item.Length -ne $ExpectedArchiveSize) {
        throw ('Tamaño RAR inesperado. Esperado {0}; real {1}.' -f $ExpectedArchiveSize, $Item.Length)
    }
    $ActualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedArchiveSha256) {
        throw ('SHA-256 RAR inválido. Esperado {0}; real {1}.' -f $ExpectedArchiveSha256, $ActualHash)
    }
    Write-Host ('RAR verificado: {0} bytes; SHA-256 {1}' -f $Item.Length, $ActualHash)
}

function Expand-ReferenceArchive {
    param(
        [Parameter(Mandatory = $true)][string]$SourceArchive,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    if (Test-Path -LiteralPath $Destination) {
        Write-Host ('Referencia ya existente; no se extrae nuevamente: {0}' -f $Destination)
        return
    }
    $SevenZip = Get-Command '7z.exe' -ErrorAction SilentlyContinue
    $WinRar = Get-Command 'WinRAR.exe' -ErrorAction SilentlyContinue
    if (-not $SevenZip -and -not $WinRar) {
        throw 'Se requiere 7-Zip o WinRAR para extraer el RAR. No se descargan ejecutables automáticamente.'
    }
    $Parent = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $Parent)) {
        New-Item -ItemType Directory -Path $Parent | Out-Null
    }
    $Temporary = Join-Path $Parent ('.shekinah-reference-extract-{0}' -f [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $Temporary | Out-Null
    try {
        if ($SevenZip) {
            Invoke-Checked -Command $SevenZip.Source -Arguments @('x', '-y', ('-o{0}' -f $Temporary), $SourceArchive)
        }
        else {
            Invoke-Checked -Command $WinRar.Source -Arguments @('x', '-ibck', '-o+', $SourceArchive, ('{0}\' -f $Temporary))
        }
        $Candidate = Get-ChildItem -LiteralPath $Temporary -Directory | Select-Object -First 1
        if ($Candidate -and (Test-Path -LiteralPath (Join-Path $Candidate.FullName 'wordpress'))) {
            Move-Item -LiteralPath $Candidate.FullName -Destination $Destination
        }
        elseif (Test-Path -LiteralPath (Join-Path $Temporary 'wordpress')) {
            Move-Item -LiteralPath $Temporary -Destination $Destination
            $Temporary = ''
        }
        else {
            throw 'La estructura extraída no contiene wordpress/.'
        }
    }
    finally {
        if ($Temporary -and (Test-Path -LiteralPath $Temporary)) {
            Remove-Item -LiteralPath $Temporary -Recurse -Force
        }
    }
}

function Assert-ReferenceStructure {
    param([Parameter(Mandatory = $true)][string]$Path)
    $Required = @(
        'wordpress\wp-content\uploads',
        'wordpress\wp-content\themes\hostinger-ai-theme',
        'db-init\01-wordpress.sql',
        'compose.yaml'
    )
    foreach ($Relative in $Required) {
        $Target = Join-Path $Path $Relative
        if (-not (Test-Path -LiteralPath $Target)) {
            throw ('Falta en la referencia: {0}' -f $Relative)
        }
    }
    Write-Host 'Estructura WordPress de referencia verificada.'
}

function Assert-ComposeSafeForRestore {
    param([Parameter(Mandatory = $true)][string]$Path)
    $ComposePath = Join-Path $Path 'compose.yaml'
    $Compose = Get-Content -LiteralPath $ComposePath -Raw
    if ($Compose -match '(?m)^\s*-\s*["'']?\$\{LOCAL_PORT\}:80["'']?\s*$') {
        throw 'RestoreWordPress bloqueado: compose.yaml publica ${LOCAL_PORT}:80 sin enlazarlo a 127.0.0.1. No se modificará ni ejecutará el respaldo original.'
    }
    if ($Compose -notmatch '127\.0\.0\.1') {
        throw 'RestoreWordPress bloqueado: no se encontró un binding explícito a 127.0.0.1.'
    }
    if ($Compose -match '(?i)(https?://|webhook|smtp|mailgun|sendgrid)') {
        throw 'RestoreWordPress bloqueado: compose.yaml contiene referencias externas que requieren revisión manual.'
    }
}

$StartedAt = Get-Date
$ExitCode = 0
$LogPath = ''
try {
    Write-Section 'ENTORNO'
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        throw ('Se requiere PowerShell 7 o superior. Versión actual: {0}' -f $PSVersionTable.PSVersion)
    }
    $GitPath = Get-CommandPath -Name 'git'
    $NodePath = Get-CommandPath -Name 'node'
    $NpmPath = Get-CommandPath -Name 'npm'
    $GitVersion = ConvertTo-Version (& $GitPath --version)
    $NodeVersion = ConvertTo-Version (& $NodePath --version)
    $NpmVersion = ConvertTo-Version (& $NpmPath --version)
    Assert-MinimumVersion -Name 'Git' -Actual $GitVersion -Minimum ([version]'2.40.0')
    Assert-MinimumVersion -Name 'Node.js' -Actual $NodeVersion -Minimum ([version]'24.0.0')
    Assert-MinimumVersion -Name 'npm' -Actual $NpmVersion -Minimum ([version]'11.0.0')
    Write-Host ('PowerShell {0}; Git {1}; Node {2}; npm {3}' -f $PSVersionTable.PSVersion, $GitVersion, $NodeVersion, $NpmVersion)

    Write-Section 'REPOSITORIO'
    if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
        throw ('No existe RepoPath: {0}' -f $RepoPath)
    }
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
    if (-not (Test-Path -LiteralPath (Join-Path $RepoPath '.git'))) {
        throw ('RepoPath no es un checkout Git: {0}' -f $RepoPath)
    }
    $LogRoot = Join-Path $RepoPath $LogRootName
    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    $LogPath = Join-Path $LogRoot ('recover-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Start-Transcript -LiteralPath $LogPath | Out-Null

    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'status')
    $InitialDirty = Get-SanitizedGitStatus -Repository $RepoPath
    if ($InitialDirty.Count -gt 0) {
        throw ('Existen cambios locales; no se modificará el checkout:' + [Environment]::NewLine + ($InitialDirty -join [Environment]::NewLine))
    }
    $Branch = (& $GitPath -C $RepoPath branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo determinar la rama.' }
    if ($Branch -ne 'main') {
        Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'switch', 'main')
    }
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'remote', '-v')
    $Remote = (& $GitPath -C $RepoPath remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer origin.' }
    if ($Remote -notmatch 'JerePrograma/shekinah(?:\.git)?$') {
        throw ('origin inesperado: {0}' -f $Remote)
    }
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'rev-parse', 'HEAD')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'log', '-1', '--oneline')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'fetch', 'origin')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'pull', '--ff-only', 'origin', 'main')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'status', '--short')

    Write-Section 'RESPALDO WORDPRESS'
    if ($ArchivePath) {
        $ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
        Assert-Archive -Path $ArchivePath
        Expand-ReferenceArchive -SourceArchive $ArchivePath -Destination $ReferencePath
    }
    if (Test-Path -LiteralPath $ReferencePath -PathType Container) {
        $ReferencePath = (Resolve-Path -LiteralPath $ReferencePath).Path
        Assert-ReferenceStructure -Path $ReferencePath
    }
    elseif ($RestoreWordPress) {
        throw ('RestoreWordPress requiere ReferencePath válido: {0}' -f $ReferencePath)
    }
    else {
        Write-Warning ('ReferencePath no existe; se continúa solo con Hostinger público: {0}' -f $ReferencePath)
    }

    if ($RestoreWordPress) {
        Write-Section 'RESTAURACIÓN LOCAL OPCIONAL'
        Get-CommandPath -Name 'docker' | Out-Null
        Invoke-Checked -Command 'docker' -Arguments @('compose', 'version')
        Assert-ComposeSafeForRestore -Path $ReferencePath
        throw 'La restauración no se ejecutó: debe existir evidencia imposible de extraer del SQL/uploads y compose.yaml debe estar aislado explícitamente. El respaldo actual no cumple ese requisito sin una copia runtime sanitizada.'
    }

    Write-Section 'CAPTURA HOSTINGER PÚBLICO'
    $CaptureRoot = Join-Path $RepoPath $CaptureRootName
    Invoke-Checked -Command $NodePath -Arguments @(
        'scripts/crawl-hostinger-original.mjs',
        '--origin', $OriginalOrigin,
        '--output', $CaptureRoot,
        '--concurrency', '2',
        '--max-pages', '2000'
    ) -WorkingDirectory $RepoPath

    Write-Section 'IMPORTACIÓN NORMALIZADA'
    $ImportArguments = @(
        'scripts/import-hostinger-original.mjs',
        '--source', (Join-Path $CaptureRoot 'html'),
        '--output', (Join-Path $RepoPath $GeneratedRootName),
        '--assets', (Join-Path $RepoPath $AssetRootName)
    )
    if ($DownloadAssets) {
        $ImportArguments += '--download-assets'
    }
    Invoke-Checked -Command $NodePath -Arguments $ImportArguments -WorkingDirectory $RepoPath
    Invoke-Checked -Command $NodePath -Arguments @('scripts/validate-catalog.mjs') -WorkingDirectory $RepoPath

    if ($RunVerification) {
        Write-Section 'VALIDACIÓN COMPLETA'
        Invoke-Checked -Command $NpmPath -Arguments @('install', '--package-lock=false', '--no-audit', '--no-fund') -WorkingDirectory $RepoPath
        Invoke-Checked -Command $NpmPath -Arguments @('run', 'verify') -WorkingDirectory $RepoPath
    }

    Write-Section 'DIFF'
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'status', '--short')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'diff', '--stat')
    Invoke-Checked -Command $GitPath -Arguments @('-C', $RepoPath, 'diff', '--check')

    Write-Host 'La recuperación terminó sin commit automático. Revisá manifiestos, activos y diff antes de publicar.' -ForegroundColor Green
}
catch {
    $ExitCode = 1
    Write-Error $_
}
finally {
    if ($LogPath) {
        try { Stop-Transcript | Out-Null } catch { }
    }
    $Elapsed = (Get-Date) - $StartedAt
    Write-Host ''
    Write-Host ('Resultado: {0}; duración: {1}; log: {2}' -f ($(if ($ExitCode -eq 0) { 'PASS' } else { 'FAIL' }), $Elapsed, $LogPath))
}
exit $ExitCode
