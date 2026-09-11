[CmdletBinding()]
param(
    [ValidateSet('preview', 'production', 'both')]
    [string]$Target = 'both',

    [switch]$Apply,

    [string]$ExpectedCommit = '',

    [switch]$SelfTestJsonParser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $RepoRoot 'wrangler.jsonc'
$MigrationRoot = Join-Path $RepoRoot 'migrations'
$EvidenceRoot = Join-Path $RepoRoot '.wrangler\commerce-d1-rollout'
$ExpectedNewMigrations = @(
    '0020_web_order_requests.sql',
    '0021_assisted_dux_checkout.sql',
    '0022_assisted_dux_order_number_unique.sql',
    '0023_assisted_dux_lifecycle_financial_guard.sql'
)
$RequiredObjects = @(
    'idx_web_request_id',
    'idx_web_request_token',
    'web_request_initial_guard',
    'web_request_snapshot_immutable',
    'web_request_resolution_guard',
    'web_request_preserve_history',
    'idx_orders_web_request_id',
    'web_request_checkout_order_insert_guard',
    'web_request_checkout_source_immutable',
    'assisted_order_items_require_dux_catalog_snapshot',
    'dux_order_link_assisted_guard',
    'idx_dux_assisted_order_number_unique',
    'dux_assisted_release_financial_guard',
    'dux_assisted_finalize_financial_guard'
)
$RequiredIntentColumns = @(
    'intent_kind', 'web_request_id', 'web_request_token_hash', 'web_request_owner_hash',
    'web_request_fingerprint', 'web_request_json', 'web_request_status',
    'web_request_updated_at', 'web_request_resolved_at', 'web_request_resolved_by'
)
$RequiredOrderColumns = @('web_request_id', 'assisted_checkout_fingerprint')
$RequiredLinkColumns = @('verification_method', 'verification_actor', 'verification_note')

function ConvertFrom-JsonCompat {
    param([Parameter(Mandatory = $true)][string]$Text)
    return $Text | ConvertFrom-Json
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash($Bytes)
    }
    finally {
        $sha256.Dispose()
    }
    return (($hashBytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $encoding = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Remove-TerminalNoise {
    param([Parameter(Mandatory = $true)][string]$Text)

    $clean = $Text.TrimStart([char]0xFEFF)
    $escape = [string][char]27
    $escapedEscape = [regex]::Escape($escape)
    $oscPattern = $escapedEscape + '\].*?(?:\x07|' + $escapedEscape + '\\)'
    $csiPattern = $escapedEscape + '\[[0-?]*[ -/]*[@-~]'
    $clean = [regex]::Replace(
        $clean,
        $oscPattern,
        '',
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    return [regex]::Replace($clean, $csiPattern, '')
}

function Convert-WranglerJsonText {
    param([Parameter(Mandatory = $true)][string]$Text)

    $clean = Remove-TerminalNoise $Text
    $trimmed = $clean.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw 'Wrangler no devolvió contenido JSON.'
    }

    try {
        return ConvertFrom-JsonCompat $trimmed
    }
    catch {
        # Wrangler/npm pueden contaminar stdout aun con --json. El fallback no
        # acepta texto arbitrario: busca un documento JSON completo y válido.
    }

    for ($start = 0; $start -lt $clean.Length; $start++) {
        $first = $clean[$start]
        if ($first -ne '{' -and $first -ne '[') {
            continue
        }
        for ($end = $clean.Length - 1; $end -gt $start; $end--) {
            $last = $clean[$end]
            if ($last -ne '}' -and $last -ne ']') {
                continue
            }
            $candidate = $clean.Substring($start, $end - $start + 1).Trim()
            try {
                return ConvertFrom-JsonCompat $candidate
            }
            catch {
                continue
            }
        }
    }

    throw 'No se pudo interpretar la salida JSON de Wrangler.'
}

function Save-WranglerJsonDiagnostic {
    param([Parameter(Mandatory = $true)][string]$Text)

    New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = Get-Sha256Hex $bytes
    $path = Join-Path $EvidenceRoot 'last-wrangler-json-failure.txt'
    $content = @(
        "captured_at=$((Get-Date).ToUniversalTime().ToString('o'))"
        "length=$($Text.Length)"
        "sha256=$hash"
        '--- raw output ---'
        $Text
    ) -join [Environment]::NewLine
    Write-Utf8NoBomFile $path $content
    return $path
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$Json
    )
    $output = @(& $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    if ($LASTEXITCODE -ne 0) {
        throw "Falló: $FilePath $($Arguments -join ' ')"
    }
    if (-not $Json) {
        return @($output)
    }
    $text = @($output) -join "`n"
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw "El comando no devolvió JSON: $FilePath $($Arguments -join ' ')"
    }
    try {
        return Convert-WranglerJsonText $text
    }
    catch {
        $diagnosticPath = Save-WranglerJsonDiagnostic $text
        throw "$($_.Exception.Message) Salida cruda guardada localmente en: $diagnosticPath"
    }
}

function Wrangler-Args {
    param([string]$Environment, [string[]]$Command)
    $args = @('--yes', 'wrangler@4.131.0') + $Command + @('--config', $ConfigPath)
    if ($Environment -eq 'production') {
        $args += @('--env', 'production')
    }
    return $args
}

function Invoke-WranglerJson {
    param([string]$Environment, [string[]]$Command)
    return Invoke-Native -FilePath 'npx' -Arguments (Wrangler-Args $Environment ($Command + @('--json'))) -Json
}

function Invoke-Wrangler {
    param([string]$Environment, [string[]]$Command)
    Invoke-Native -FilePath 'npx' -Arguments (Wrangler-Args $Environment $Command) | Out-Host
}

function Read-Property {
    param([object]$Value, [string]$Name)
    if ($null -eq $Value) { return $null }
    $property = $Value.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function D1-Rows {
    param([object]$Payload)
    $rows = @()
    foreach ($entry in @($Payload)) {
        $results = Read-Property $entry 'results'
        if ($null -ne $results) {
            $rows += @($results)
            continue
        }
        $result = Read-Property $entry 'result'
        if ($null -eq $result) { continue }
        foreach ($nested in @($result)) {
            $nestedResults = Read-Property $nested 'results'
            if ($null -ne $nestedResults) {
                $rows += @($nestedResults)
            }
        }
    }
    return @($rows)
}

function Test-WranglerJsonParser {
    $json = '[{"results":[{"name":"0019_test.sql"}],"success":true}]'
    $escape = [string][char]27
    $bell = [string][char]7
    $bom = [string][char]0xFEFF
    $samples = @(
        $json,
        "npm notice wrapper`n$json",
        "Proxy environment variables detected. $json trailing notice",
        ($bom + $json),
        ($escape + '[32m' + $json + $escape + '[0m'),
        ($escape + ']0;wrangler' + $bell + $json)
    )

    foreach ($sample in $samples) {
        $payload = @(Convert-WranglerJsonText $sample)
        $rows = @(D1-Rows $payload)
        if ($rows.Count -ne 1 -or [string]$rows[0].name -ne '0019_test.sql') {
            throw 'Self-test del parser JSON de Wrangler falló.'
        }
    }

    $invalidRejected = $false
    try {
        Convert-WranglerJsonText 'salida sin JSON válido' | Out-Null
    }
    catch {
        $invalidRejected = $true
    }
    if (-not $invalidRejected) {
        throw 'Self-test del parser aceptó texto inválido.'
    }

    $diagnosticPath = Save-WranglerJsonDiagnostic 'diagnostic-self-test'
    if (-not (Test-Path -LiteralPath $diagnosticPath -PathType Leaf)) {
        throw 'Self-test no pudo persistir el diagnóstico JSON.'
    }
    $diagnostic = Get-Content -LiteralPath $diagnosticPath -Raw
    if (-not $diagnostic.Contains('sha256=') -or -not $diagnostic.Contains('diagnostic-self-test')) {
        throw 'Self-test generó un diagnóstico JSON inválido.'
    }
    Remove-Item -LiteralPath $diagnosticPath -Force

    Write-Host "Parser JSON de Wrangler verificado: $($samples.Count) variantes válidas, diagnóstico portable y rechazo de texto inválido."
}

function Query-D1 {
    param([string]$Environment, [string]$Sql)
    $payload = Invoke-WranglerJson $Environment @('d1', 'execute', 'DB', '--remote', '--command', $Sql)
    return D1-Rows $payload
}

function Assert-GitState {
    Push-Location $RepoRoot
    try {
        $branch = (@(Invoke-Native 'git' @('branch', '--show-current')) -join '').Trim()
        if ($branch -ne 'main') { throw "La rama activa debe ser main; actual: $branch" }
        Invoke-Native 'git' @('fetch', 'origin') | Out-Null
        $head = (@(Invoke-Native 'git' @('rev-parse', 'HEAD')) -join '').Trim()
        $remote = (@(Invoke-Native 'git' @('rev-parse', 'origin/main')) -join '').Trim()
        if ($head -ne $remote) { throw 'HEAD no coincide con origin/main. Ejecutá git pull --ff-only origin main.' }
        $dirty = @(& git status --porcelain --untracked-files=no)
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar git status.' }
        if ($dirty.Count -ne 0) { throw 'Hay cambios tracked locales. Preservalos y dejá el árbol limpio antes de migrar D1.' }
        if ($ExpectedCommit -ne '' -and $head -ne $ExpectedCommit) {
            throw "HEAD $head no coincide con -ExpectedCommit $ExpectedCommit."
        }
        Write-Host "Git verificado en main: $head"
    }
    finally {
        Pop-Location
    }
}

function Assert-LocalMigrations {
    $migrations = @(Get-ChildItem -LiteralPath $MigrationRoot -Filter '*.sql' -File | Sort-Object Name)
    foreach ($required in $ExpectedNewMigrations) {
        if (-not (Test-Path -LiteralPath (Join-Path $MigrationRoot $required) -PathType Leaf)) {
            throw "Falta la migración requerida: $required"
        }
    }
    $newer = @($migrations | Where-Object {
        $_.Name -match '^(\d{4})_' -and [int]$Matches[1] -gt 23
    })
    if ($newer.Count -ne 0) {
        throw "Hay migraciones posteriores a 0023. Este script no las aplicará implícitamente: $($newer.Name -join ', ')"
    }
}

function Assert-ConfigIdentity {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw 'No existe wrangler.jsonc local. No se puede identificar preview y producción.'
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw
    $ids = @([regex]::Matches($config, '"database_id"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    $names = @([regex]::Matches($config, '"database_name"\s*:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    $bindings = @([regex]::Matches($config, '"binding"\s*:\s*"DB"'))
    if ($ids.Count -ne 2 -or $names.Count -ne 2 -or $bindings.Count -lt 2) {
        throw 'wrangler.jsonc debe definir exactamente una D1 DB para preview y otra para env.production, ambas con binding DB.'
    }
    if ($ids[0] -eq $ids[1] -or $names[0] -eq $names[1]) {
        throw 'Preview y producción apuntan a la misma D1. Migración abortada.'
    }
    $placeholders = @(($ids + $names) | Where-Object { $_ -match 'REEMPLAZAR|CHANGE_ME|PLACEHOLDER' })
    if ($placeholders.Count -ne 0) {
        throw 'wrangler.jsonc todavía contiene placeholders de D1.'
    }
}

function Get-AppliedMigrationNames {
    param([string]$Environment)
    $rows = Query-D1 $Environment 'SELECT name FROM d1_migrations ORDER BY id;'
    return @($rows | ForEach-Object { [string]$_.name })
}

function Assert-MigrationState {
    param([string]$Environment)
    $applied = @(Get-AppliedMigrationNames $Environment)
    $allLocalThrough19 = @(Get-ChildItem -LiteralPath $MigrationRoot -Filter '*.sql' -File |
        Where-Object { $_.Name -match '^(\d{4})_' -and [int]$Matches[1] -le 19 } |
        Sort-Object Name |
        ForEach-Object Name)
    foreach ($required in $allLocalThrough19) {
        if ($applied -notcontains $required) {
            throw "$Environment no tiene aplicada la base histórica requerida: $required"
        }
    }
    $firstMissing = $ExpectedNewMigrations.Count
    for ($index = 0; $index -lt $ExpectedNewMigrations.Count; $index++) {
        if ($applied -notcontains $ExpectedNewMigrations[$index]) {
            $firstMissing = $index
            break
        }
    }
    for ($index = $firstMissing; $index -lt $ExpectedNewMigrations.Count; $index++) {
        if ($applied -contains $ExpectedNewMigrations[$index]) {
            throw "$Environment tiene un estado no contiguo de migraciones 0020-0023. Revisión manual requerida."
        }
    }
    return @($ExpectedNewMigrations | Where-Object { $applied -notcontains $_ })
}

function Save-Bookmark {
    param([string]$Environment, [string]$Directory)
    $payload = Invoke-WranglerJson $Environment @('d1', 'time-travel', 'info', 'DB')
    $path = Join-Path $Directory "$Environment-before.json"
    $json = $payload | ConvertTo-Json -Depth 100
    Write-Utf8NoBomFile $path $json
    Write-Host "Bookmark Time Travel guardado: $path"
}

function Assert-Columns {
    param([string]$Environment, [string]$Table, [string[]]$Required)
    $rows = Query-D1 $Environment "PRAGMA table_info($Table);"
    $names = @($rows | ForEach-Object { [string]$_.name })
    foreach ($column in $Required) {
        if ($names -notcontains $column) { throw "${Environment}: falta $Table.$column" }
    }
}

function Verify-Environment {
    param([string]$Environment)
    $pending = @(Assert-MigrationState $Environment)
    if ($pending.Count -ne 0) {
        throw "$Environment sigue con migraciones pendientes: $($pending -join ', ')"
    }
    $quoted = $RequiredObjects | ForEach-Object { "'$_'" }
    $objects = Query-D1 $Environment "SELECT name FROM sqlite_schema WHERE name IN ($($quoted -join ','));"
    $names = @($objects | ForEach-Object { [string]$_.name })
    foreach ($required in $RequiredObjects) {
        if ($names -notcontains $required) { throw "${Environment}: falta objeto crítico $required" }
    }
    Assert-Columns $Environment 'checkout_intents' $RequiredIntentColumns
    Assert-Columns $Environment 'orders' $RequiredOrderColumns
    Assert-Columns $Environment 'dux_order_links' $RequiredLinkColumns
    $foreignKeys = @(Query-D1 $Environment 'PRAGMA foreign_key_check;')
    if ($foreignKeys.Count -ne 0) {
        throw "${Environment}: PRAGMA foreign_key_check devolvió $($foreignKeys.Count) incidencia(s)."
    }
    Write-Host "$Environment verificado: 0020-0023 aplicadas, objetos críticos presentes y foreign keys válidas."
}

function Process-Environment {
    param(
        [string]$Environment,
        [string[]]$ExpectedPending,
        [string]$EvidenceDirectory
    )
    Write-Host "`n=== $Environment ==="
    $currentPending = @(Assert-MigrationState $Environment)
    if (($currentPending -join '|') -ne ($ExpectedPending -join '|')) {
        throw "$Environment cambió desde el preflight. No se aplicará nada con un estado remoto distinto al revisado."
    }
    if ($currentPending.Count -eq 0) {
        Write-Host '0020-0023 ya están aplicadas; se ejecutará sólo la verificación.'
        Verify-Environment $Environment
        return
    }
    Write-Host "Pendientes: $($currentPending -join ', ')"
    if (-not $Apply) {
        Write-Host 'Dry-run: no se aplicaron migraciones. Volvé a ejecutar con -Apply.'
        return
    }
    Save-Bookmark $Environment $EvidenceDirectory
    Invoke-Wrangler $Environment @('d1', 'migrations', 'apply', 'DB', '--remote')
    Verify-Environment $Environment
}

if ($SelfTestJsonParser) {
    Test-WranglerJsonParser
    return
}

Assert-GitState
Assert-LocalMigrations
Assert-ConfigIdentity

$targets = if ($Target -eq 'both') { @('preview', 'production') } else { @($Target) }
$preflight = @{}
foreach ($environment in $targets) {
    $preflight[$environment] = @(Assert-MigrationState $environment)
    $pendingLabel = if ($preflight[$environment].Count -eq 0) {
        'ninguna'
    }
    else {
        $preflight[$environment] -join ', '
    }
    Write-Host "Preflight ${environment}: pendientes $pendingLabel"
}

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmssZ')
$evidenceDirectory = Join-Path $EvidenceRoot $timestamp
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null

foreach ($environment in $targets) {
    Process-Environment $environment @($preflight[$environment]) $evidenceDirectory
}

if (-not $Apply) {
    Write-Host "`nDry-run completado. No se modificó D1."
    Write-Host 'Para aplicar: ./scripts/apply-commerce-d1.ps1 -Target both -Apply -ExpectedCommit <SHA_COMPLETO>'
}
else {
    Write-Host "`nMigración D1 finalizada para: $($targets -join ', '). Evidencia local: $evidenceDirectory"
}
