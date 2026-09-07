#requires -Version 7.0
#requires -Modules Microsoft.PowerShell.Utility
<#
.SYNOPSIS
Valida localmente o ejecuta UNA fase autorizada de publicación del catálogo Dux.
.DESCRIPTION
Validate no usa red ni credenciales. Preview y Production mutan únicamente la D1
elegida y los endpoints administrativos first-party indicados. Production exige
recibo Preview verde del mismo SHA y confirmación escrita en la consola.
No ejecutar fases remotas durante la iteración de código. Véase
docs/DUX_COMPLETE_CATALOG.md. No usar Start-Transcript: hay secretos en memoria.
#>
[CmdletBinding()]
param(
    [ValidateSet('Validate', 'Preview', 'Production')][string]$Phase = 'Validate',
    [string]$ExpectedCommit,
    [string]$AccountId,
    [string]$DatabaseId,
    [string]$DeploymentId,
    [string]$SiteOrigin,
    [string]$RequestOrigin,
    [string]$ExpectedBranchId,
    [string]$ExpectedDepositId,
    [string]$EvidenceDirectory,
    [string]$PreviewReceipt,
    [Security.SecureString]$AdminSessionCookie,
    [string]$WranglerPath = 'wrangler',
    [string]$GitHubCliPath = 'gh',
    [ValidateRange(1, 100000)][int]$ExpectedItems = 747,
    [ValidateRange(0, 100000)][int]$ExpectedUsable = 592,
    [ValidateRange(0, 100000)][int]$ExpectedPlaceholder = 87,
    [ValidateRange(0, 100000)][int]$ExpectedMissingOrZero = 68,
    [ValidateRange(0, 100000)][int]$ExpectedInvalid = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationNames = @(
    '0015_dux_catalog_snapshot.sql',
    '0016_dux_editorial_links_and_cutover.sql',
    '0017_dux_complete_public_catalog.sql'
)
$manifestPaths = @(
    'catalog/internal/dux-editorial-links-auto-import.json',
    'catalog/internal/dux-editorial-triage-v1.json'
)
$verificationLog = [Collections.Generic.List[object]]::new()
$receiptPath = $null
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$cfHeaders = $null
$mayNeedRollback = $false
$loggedIn = $false
$createdAdminSession = $false
$syncAttempted = $false
$bookmark = $null
$ciRunId = $null
$canonicalHttpsVerified = $false
$databaseName = if ($Phase -eq 'Production') { 'shekinah-commerce' } else { 'shekinah-commerce-preview' }
$environmentName = $Phase.ToLowerInvariant()

function Assert-Check([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "Verificación fallida: $Label" }
}

function Record-Check([string]$Label, $Detail = $null) {
    $entry = [ordered]@{ at = [DateTimeOffset]::UtcNow.ToString('o'); check = $Label; result = 'verified' }
    if ($null -ne $Detail) { $entry.detail = $Detail }
    $verificationLog.Add($entry)
    Write-Host "VERIFICADO: $Label"
    Save-Receipt 'running'
}

function Save-Receipt([string]$Status) {
    if ($null -eq $receiptPath) { return }
    [ordered]@{
        schemaVersion = 1; phase = $environmentName; status = $Status
        recordedAt = [DateTimeOffset]::UtcNow.ToString('o'); commit = $ExpectedCommit
        deploymentId = $DeploymentId; ciRunId = $ciRunId; accountId = $AccountId
        databaseId = $DatabaseId; databaseName = $databaseName; companyId = $companyId
        origin = $SiteOrigin; bookmark = $bookmark; files = $fileHashes
        requestOrigin = $RequestOrigin; canonicalHttpsVerified = $canonicalHttpsVerified
        canonicalVerification = if ($Phase -ceq 'Production' -and $RequestOrigin -cne $SiteOrigin) { 'pending_external' } elseif ($canonicalHttpsVerified) { 'verified_https' } else { 'not_verified' }
        syncAttempted = $syncAttempted; checks = @($verificationLog.ToArray())
    } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8NoBOM
}

function Invoke-Json([string]$Uri, [string]$Method = 'GET', $Body = $null, $Headers = @{}, [switch]$Admin) {
    Assert-Check ($Uri.StartsWith('https://', [StringComparison]::Ordinal)) 'TLS obligatorio'
    $requestArguments = @{
        Uri = $Uri; Method = $Method; Headers = $Headers
        MaximumRedirection = 0; TimeoutSec = 480; ErrorAction = 'Stop'
    }
    if ($Admin) { $requestArguments.WebSession = $session }
    if ($null -ne $Body) {
        $requestArguments.Body = $Body | ConvertTo-Json -Depth 12 -Compress
        $requestArguments.ContentType = 'application/json; charset=utf-8'
    }
    try { return Invoke-RestMethod @requestArguments }
    catch {
        $requestError = $_
        $diagnostic = 'sin estado HTTP disponible'
        try {
            $status = [int]$requestError.Exception.Response.StatusCode
            if ($status -ge 100 -and $status -le 599) { $diagnostic = "HTTP $status" }
        } catch { }
        # Nunca imprimir mensajes, headers, URL, cookies ni cuerpos del servidor.
        $allowedCodes = @(
            'ADMIN_CREDENTIALS_INVALID', 'ADMIN_SESSION_MISSING', 'ADMIN_SESSION_INVALID',
            'ADMIN_AUTH_CONFIG_INVALID', 'ADMIN_AUTH_UNAVAILABLE', 'ADMIN_AUDIT_UNAVAILABLE',
            'ACCESS_TOKEN_MISSING', 'ADMIN_LOGIN_RATE_LIMITED', 'ADMIN_RATE_LIMIT_CONFIG_MISSING',
            'ADMIN_RATE_LIMIT_UNAVAILABLE', 'DUX_RATE_LIMITED', 'ORIGIN_REQUIRED', 'ORIGIN_REJECTED',
            'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR', 'DUX_API_DISABLED', 'DUX_TOKEN_INVALID',
            'DUX_CONFIG_INVALID', 'DUX_UNAVAILABLE', 'DUX_RESPONSE_INVALID', 'DUX_SYNC_IN_PROGRESS',
            'DUX_SYNC_COOLDOWN', 'DUX_SYNC_LEASE_LOST', 'DUX_D1_WRITE_BUDGET_EXHAUSTED',
            'DUX_COMPANY_NOT_FOUND', 'DUX_BRANCH_NOT_FOUND', 'DUX_BRANCH_COMPANY_MISMATCH',
            'DUX_DEPOSIT_NOT_FOUND', 'DUX_DEPOSIT_COMPANY_MISMATCH', 'DUX_DEPOSIT_DISABLED',
            'DUX_CATALOG_TENANT_MISMATCH', 'DUX_CATALOG_COMPANY_MISMATCH',
            'DUX_CATALOG_CONTROL_MIGRATION_REQUIRED', 'DUX_CATALOG_MIGRATION_REQUIRED',
            'DUX_CATALOG_SNAPSHOT_INVALID', 'DUX_CATALOG_SNAPSHOT_UNAVAILABLE',
            'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT', 'DUX_TRIAGE_MIGRATION_REQUIRED',
            'DUX_TRIAGE_EVIDENCE_CONFLICT', 'DUX_EDITORIAL_LINK_CONFLICT'
        )
        try {
            $errorBody = $requestError.ErrorDetails.Message
            if ($errorBody.Length -le 65536) {
                $errorCode = ($errorBody | ConvertFrom-Json).error.code
                if ($errorCode -is [string] -and $errorCode -cin $allowedCodes) { $diagnostic += "; código $errorCode" }
            }
        } catch { }
        throw "La solicitud HTTPS falló o intentó redirigir ($diagnostic). Revisar el entorno sin repetir el sync."
    }
}

function Invoke-Cloudflare([string]$Path, [string]$Method = 'GET', $Body = $null) {
    $response = Invoke-Json "https://api.cloudflare.com/client/v4/accounts/$AccountId/$Path" $Method $Body $cfHeaders
    Assert-Check ($response.success -eq $true) 'respuesta autoritativa Cloudflare'
    return $response.result
}

function Read-D1([string]$Sql) {
    Assert-Check ($Sql -match '^\s*(SELECT\b|PRAGMA foreign_key_check\s*;)') 'consulta D1 de lectura permitida'
    $result = @(Invoke-Cloudflare "d1/database/$DatabaseId/query" 'POST' @{ sql = $Sql })
    Assert-Check ($result.Count -eq 1 -and $result[0].success -eq $true) 'consulta D1 correcta'
    return @($result[0].results)
}

function Invoke-Admin([string]$Path, [string]$Method = 'GET', $Body = $null) {
    $allowed = @(
        '/api/admin/auth/login', '/api/admin/auth/logout', '/api/admin/auth/session', '/api/admin/dux/status',
        '/api/admin/dux/catalog-control', '/api/admin/dux/editorial-links/import',
        '/api/admin/dux/editorial-triage/import', '/api/admin/dux/sync'
    )
    Assert-Check ($Path -cin $allowed) 'endpoint administrativo permitido'
    if ($Path -ceq '/api/admin/dux/sync') {
        Assert-Check (-not $script:syncAttempted) 'máximo un sync por fase; sin reintento automático'
        $script:syncAttempted = $true
        Save-Receipt 'running'
    }
    return Invoke-Json "$RequestOrigin$Path" $Method $Body @{ Origin = $RequestOrigin; 'Cache-Control' = 'no-cache' } -Admin
}

function Read-PublicCatalog {
    $catalog = Invoke-Json "$RequestOrigin/api/catalog" 'GET' $null @{ 'Cache-Control' = 'no-cache' }
    if ($Phase -ceq 'Production' -and $RequestOrigin -ceq $SiteOrigin) { $script:canonicalHttpsVerified = $true }
    return $catalog
}

function Assert-Control([bool]$Collection, [bool]$PublicCatalog) {
    $response = Invoke-Admin '/api/admin/dux/catalog-control'
    Assert-Check ($response.control.companyId -ceq $companyId) 'companyId del control'
    Assert-Check ($response.control.migrationApplied -eq $true) 'migración de controles disponible'
    Assert-Check ($response.control.snapshotCollectionEnabled -eq $Collection) 'snapshot_collection_enabled esperado'
    Assert-Check ($response.control.publicCatalogEnabled -eq $PublicCatalog) 'public_catalog_enabled esperado'
    Assert-Check ($response.control.publicCutoverEnabled -eq $false) 'public_cutover_enabled cerrado'
    return $response
}

function Assert-Tenant([switch]$AllowBootstrap) {
    $tenant = @(Read-D1 'SELECT company_id, branch_id, deposit_id FROM dux_tenant_context WHERE id = 1;')
    if ($tenant.Count -eq 0 -and $AllowBootstrap) {
        $inventory = @(Read-D1 'SELECT COUNT(*) AS amount FROM dux_inventory_items;')
        Assert-Check ($inventory.Count -eq 1 -and $inventory[0].amount -eq 0) 'tenant ausente sólo permitido para inventario vacío'
        Record-Check 'tenant ausente e inventario vacío; el único sync oficial debe verificar y publicar el tenant'
        return
    }
    Assert-Check ($tenant.Count -eq 1) 'tenant previamente verificado presente'
    Assert-Check ($tenant[0].company_id -ceq $companyId) 'empresa real coincide con manifiesto'
    Assert-Check ($tenant[0].branch_id -ceq $ExpectedBranchId) 'sucursal esperada'
    Assert-Check ($tenant[0].deposit_id -ceq $ExpectedDepositId) 'depósito esperado'
}

function Assert-BaselineTriage {
    $counts = @(Read-D1 "SELECT disposition, review_state, COUNT(*) AS amount FROM dux_editorial_triage WHERE company_id = '$companyId' GROUP BY disposition, review_state;")
    Assert-Check ($counts.Count -eq 3) 'triage sin decisiones inesperadas'
    foreach ($expected in @(
        @{ disposition = 'auto_confirmed'; state = 'auto_confirmed'; amount = 135 },
        @{ disposition = 'pending_manual_review'; state = 'pending'; amount = 294 },
        @{ disposition = 'discarded_enrichment'; state = 'discarded'; amount = 318 }
    )) {
        $actual = @($counts | Where-Object { $_.disposition -ceq $expected.disposition -and $_.review_state -ceq $expected.state })
        Assert-Check ($actual.Count -eq 1 -and $actual[0].amount -eq $expected.amount) "triage $($expected.disposition)"
    }
    $links = @(Read-D1 "SELECT COUNT(*) AS amount, SUM(active) AS active_count, COUNT(DISTINCT cod_item) AS unique_dux_count, COUNT(DISTINCT local_product_id) AS unique_local_count, SUM(reuse_images) AS reuse_images_count, SUM(reuse_description) AS reuse_description_count FROM dux_editorial_links WHERE company_id = '$companyId';")
    Assert-Check ($links.Count -eq 1 -and $links[0].amount -eq 135 -and $links[0].active_count -eq 135) '135 vínculos totales y activos; ninguna aprobación implícita'
    Assert-Check ($links[0].unique_dux_count -eq 135 -and $links[0].unique_local_count -eq 135) '135 identidades Dux y locales únicas'
    Assert-Check ($links[0].reuse_images_count -eq 134 -and $links[0].reuse_description_count -eq 127) 'reutilización autorizada: 134 imágenes y 127 descripciones'
}

function Assert-Snapshot {
    $control = Assert-Control $true $false
    Assert-Check ($null -eq $control.snapshotError -and $null -ne $control.snapshot) 'snapshot parseado por servidor'
    Assert-Check ($control.snapshot.itemCount -eq $ExpectedItems -and -not $control.snapshot.stale) 'snapshot fresco con conteo esperado'
    Assert-Check ($control.snapshot.checkoutEligibleCount -eq 0) 'checkout elegible 0'
    foreach ($key in $expectedPrices.Keys) {
        Assert-Check ($control.snapshot.priceCounts.$key -eq $expectedPrices[$key]) "precios $key esperados"
    }
    $rows = @(Read-D1 'SELECT inventory_run_id, catalog_version, item_count, payload_json, synced_at FROM dux_catalog_snapshots_v2 WHERE id = 1;')
    Assert-Check ($rows.Count -eq 1) 'snapshot v2 único'
    $payload = $rows[0].payload_json | ConvertFrom-Json
    Assert-Check ($payload.schemaVersion -eq 2 -and $payload.priceListName -ceq 'PRECIOS DEL NEGOCIO') 'contrato snapshot v2'
    Assert-Check ($rows[0].catalog_version -ceq $control.snapshot.catalogVersion) 'misma versión D1 y servidor'
    Assert-Check ($rows[0].inventory_run_id -ceq $script:syncRunId) 'snapshot pertenece al único sync ejecutado'
    Assert-Check (@($payload.items).Count -eq $ExpectedItems) 'cantidad efectiva snapshot'
    Assert-Check (@($payload.items.code | Sort-Object -Unique -CaseSensitive).Count -eq $ExpectedItems) 'códigos Dux únicos'
    Record-Check 'snapshot actual y estados de precio' @{ items = $ExpectedItems; prices = $expectedPrices; catalogVersion = $rows[0].catalog_version }
    return $payload
}

function Assert-PublicCatalog($Payload) {
    $catalog = Read-PublicCatalog
    Assert-Check ($catalog.source -ceq 'dux') 'universo público Dux'
    Assert-Check (@($catalog.products).Count -eq @($Payload.items).Count) 'cantidad pública igual a snapshot'
    $byCode = [Collections.Generic.Dictionary[string, object]]::new([StringComparer]::Ordinal)
    foreach ($item in $Payload.items) { $byCode.Add($item.code, $item) }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($product in $catalog.products) {
        Assert-Check ($byCode.ContainsKey($product.sku) -and $seen.Add($product.sku)) 'sin local-only ni códigos duplicados'
        $item = $byCode[$product.sku]
        Assert-Check ($product.name -ceq $item.name -and $product.priceStatus -ceq $item.priceStatus) 'nombre y estado de precio Dux'
        Assert-Check (@(Compare-Object @($product.categorySlugs) @($item.categories | ForEach-Object { $_.slug }) -CaseSensitive).Count -eq 0) 'categorías exclusivamente Dux'
        Assert-Check (@(Compare-Object @($product.categoryNames) @($item.categories | ForEach-Object { $_.name }) -CaseSensitive).Count -eq 0) 'nombres de categorías Dux'
        Assert-Check ($product.commerce.source -ceq 'dux' -and $product.commerce.checkoutEligible -eq $false) 'producto Dux no transaccionable'
        if ($item.priceStatus -ceq 'usable') {
            Assert-Check ($null -ne $product.price -and $product.price.amount -gt 2 -and $product.price.amount -eq $item.priceAmount -and $product.price.currency -ceq 'ARS') 'precio exclusivamente Dux usable'
        } else {
            Assert-Check ($null -eq $product.price -and $null -eq $item.priceAmount) 'sin sentinel ni precio local'
            Assert-Check (-not $product.PSObject.Properties['salePrice']) 'sin oferta cuando falta precio base'
        }
        Assert-Check (-not $product.PSObject.Properties['presentation'] -and -not $product.PSObject.Properties['shortDescription']) 'sin presentación ni descripción corta local'
    }
    $null = Assert-Control $true $true
    Record-Check 'API publica exactamente el universo Dux con checkout cerrado' @{ items = $seen.Count }
}

function Enable-PublicCatalog {
    $null = Invoke-Admin '/api/admin/dux/catalog-control' 'POST' @{
        publicCatalogEnabled = $true; confirmation = 'ENABLE_DUX_PUBLIC_CATALOG'
    }
}

# La fase local es ejecutable sin credenciales, sin red y sin modificar archivos.
$parseTokens = $null
$parseErrors = $null
$null = [Management.Automation.Language.Parser]::ParseFile($PSCommandPath, [ref]$parseTokens, [ref]$parseErrors)
Assert-Check ($parseErrors.Count -eq 0) 'sintaxis PowerShell'
$fileHashes = [ordered]@{}
foreach ($relative in @($manifestPaths) + @($migrationNames | ForEach-Object { "migrations/$_" })) {
    $filePath = Join-Path $repoRoot $relative
    Assert-Check (Test-Path -LiteralPath $filePath -PathType Leaf) "archivo versionado $relative"
    $fileHashes[$relative] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$linksManifest = Get-Content -LiteralPath (Join-Path $repoRoot $manifestPaths[0]) -Raw | ConvertFrom-Json
$triageManifest = Get-Content -LiteralPath (Join-Path $repoRoot $manifestPaths[1]) -Raw | ConvertFrom-Json
$companyId = $linksManifest.companyId
Assert-Check ($companyId -cmatch '^\d{1,20}$' -and $triageManifest.companyId -ceq $companyId) 'tenant consistente entre manifiestos'
Assert-Check ($linksManifest.expectedLinkCount -eq 135 -and @($linksManifest.links).Count -eq 135) '135 vínculos versionados'
Assert-Check (@($triageManifest.items).Count -eq 747) '747 clasificaciones baseline'
Assert-Check (@($triageManifest.items.duxCode | Sort-Object -Unique -CaseSensitive).Count -eq 747) '747 códigos baseline únicos'
$expectedPrices = [ordered]@{ usable = $ExpectedUsable; placeholder = $ExpectedPlaceholder; missing_or_zero = $ExpectedMissingOrZero; invalid = $ExpectedInvalid }
Assert-Check (($ExpectedUsable + $ExpectedPlaceholder + $ExpectedMissingOrZero + $ExpectedInvalid) -eq $ExpectedItems) 'suma de estados de precio igual al conteo esperado'
Record-Check 'sintaxis, archivos y manifiestos locales'
if ($Phase -eq 'Validate') {
    Write-Host 'VALIDACIÓN LOCAL COMPLETA. No se consultó red ni se ejecutaron migraciones, importaciones, sync o activación.'
    return
}

Assert-Check ($ExpectedCommit -cmatch '^[0-9a-f]{40}$') 'SHA completo obligatorio'
Assert-Check ($AccountId -cmatch '^[0-9a-f]{32}$') 'cuenta Cloudflare explícita'
Assert-Check ($DatabaseId -match '^[0-9a-f-]{36}$' -and $DeploymentId -match '^[0-9a-f-]{36}$') 'D1 y deployment explícitos'
Assert-Check ($ExpectedBranchId -cmatch '^\d+$' -and $ExpectedDepositId -cmatch '^\d+$') 'sucursal y depósito explícitos'
$siteUri = [Uri]$SiteOrigin
Assert-Check ($siteUri.Scheme -ceq 'https' -and $siteUri.UserInfo -eq '' -and $siteUri.AbsolutePath -eq '/' -and $siteUri.Query -eq '' -and $siteUri.Fragment -eq '' -and $siteUri.IsDefaultPort) 'origen HTTPS sin credenciales, ruta, query o puerto alternativo'
$SiteOrigin = $siteUri.GetLeftPart([UriPartial]::Authority)
if ($Phase -eq 'Production') { Assert-Check ($SiteOrigin -ceq 'https://shekinah.ar') 'origen productivo canónico' }
else { Assert-Check ($siteUri.Host.EndsWith('.shekinah-7dl.pages.dev', [StringComparison]::Ordinal)) 'origen preview aislado de producción' }
if ([string]::IsNullOrWhiteSpace($RequestOrigin)) { $RequestOrigin = $SiteOrigin }
$requestUri = [Uri]$RequestOrigin
Assert-Check ($requestUri.Scheme -ceq 'https' -and $requestUri.UserInfo -eq '' -and $requestUri.AbsolutePath -eq '/' -and $requestUri.Query -eq '' -and $requestUri.Fragment -eq '' -and $requestUri.IsDefaultPort) 'transporte HTTPS sin credenciales, ruta, query o puerto alternativo'
$RequestOrigin = $requestUri.GetLeftPart([UriPartial]::Authority)
if ($RequestOrigin -cne $SiteOrigin) {
    Assert-Check ($Phase -ceq 'Production') 'transporte distinto sólo permitido en Production'
    Assert-Check ($requestUri.Host.EndsWith('.shekinah-7dl.pages.dev', [StringComparison]::Ordinal)) 'transporte alternativo pertenece al proyecto Pages'
}
Assert-Check (-not [string]::IsNullOrWhiteSpace($EvidenceDirectory)) 'directorio de evidencia explícito'
$evidenceRoot = [IO.Path]::GetFullPath($EvidenceDirectory)
Assert-Check (-not ($evidenceRoot -eq $repoRoot -or $evidenceRoot.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) 'evidencia fuera del repositorio'
if ($Phase -eq 'Production') {
    Assert-Check (-not [string]::IsNullOrWhiteSpace($PreviewReceipt) -and (Test-Path -LiteralPath $PreviewReceipt -PathType Leaf)) 'recibo preview obligatorio'
    $preview = Get-Content -LiteralPath $PreviewReceipt -Raw | ConvertFrom-Json
    Assert-Check ($preview.schemaVersion -eq 1 -and $preview.phase -ceq 'preview' -and $preview.status -ceq 'passed' -and $preview.commit -ceq $ExpectedCommit) 'preview verde del mismo SHA'
    Assert-Check ($preview.databaseId -cne $DatabaseId -and $preview.databaseName -ceq 'shekinah-commerce-preview' -and $preview.accountId -ceq $AccountId -and $preview.companyId -ceq $companyId) 'aislamiento y tenant del preview'
    foreach ($relative in $fileHashes.Keys) { Assert-Check ($preview.files.$relative -ceq $fileHashes[$relative]) "hash preview $relative" }
    # PowerShell reciente convierte fechas JSON a DateTime; no volver a parsearlas según la cultura local.
    $previewRecordedAt = if ($preview.recordedAt -is [DateTime] -or $preview.recordedAt -is [DateTimeOffset]) {
        [DateTimeOffset]$preview.recordedAt
    } else { [DateTimeOffset]::Parse($preview.recordedAt, [Globalization.CultureInfo]::InvariantCulture) }
    $previewAgeHours = ([DateTimeOffset]::UtcNow - $previewRecordedAt).TotalHours
    Assert-Check ($previewAgeHours -ge 0 -and $previewAgeHours -le 24) 'preview verde en las últimas 24 horas'
    $confirmation = Read-Host "Escribí ACTIVAR CATALOGO PRODUCTION $ExpectedCommit para autorizar esta fase"
    Assert-Check ($confirmation -ceq "ACTIVAR CATALOGO PRODUCTION $ExpectedCommit") 'confirmación explícita de producción'
}
$null = Get-Command $WranglerPath -ErrorAction Stop
$null = Get-Command $GitHubCliPath -ErrorAction Stop
Assert-Check ((& node --version).Trim() -ceq ('v' + (Get-Content -LiteralPath (Join-Path $repoRoot '.node-version') -Raw).Trim())) 'Node del repositorio'
$gitBranch = (& git -C $repoRoot branch --show-current).Trim()
$gitHead = (& git -C $repoRoot rev-parse HEAD).Trim()
$gitRemoteHead = (& git -C $repoRoot ls-remote origin refs/heads/main)
Assert-Check ($LASTEXITCODE -eq 0 -and $gitBranch -ceq 'main' -and $gitHead -ceq $ExpectedCommit -and $gitRemoteHead.StartsWith($ExpectedCommit + "`t", [StringComparison]::Ordinal)) 'main, HEAD y origin/main publicados en SHA exacto'
Assert-Check (@(& git -C $repoRoot status --porcelain).Count -eq 0) 'working tree limpio'
$ciOutput = & $GitHubCliPath api "repos/JerePrograma/shekinah/actions/workflows/ci.yml/runs?head_sha=$ExpectedCommit&per_page=100" 2>$null
Assert-Check ($LASTEXITCODE -eq 0) 'GitHub Actions accesible'
$ciRuns = @((($ciOutput -join "`n") | ConvertFrom-Json).workflow_runs | Where-Object { $_.head_sha -ceq $ExpectedCommit -and $_.head_branch -ceq 'main' } | Sort-Object id -Descending)
Assert-Check ($ciRuns.Count -gt 0 -and $ciRuns[0].status -ceq 'completed' -and $ciRuns[0].conclusion -ceq 'success') 'último CI del SHA exacto exitoso'
$ciRunId = $ciRuns[0].id

$null = New-Item -ItemType Directory -Path $evidenceRoot -Force
$receiptPath = Join-Path $evidenceRoot ("dux-catalog-$environmentName-" + [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
Assert-Check (-not (Test-Path -LiteralPath $receiptPath)) 'recibo nuevo sin sobrescribir evidencia'
Record-Check 'Git, Node, CI y fase autorizada' @{ ciRunId = $ciRunId; commit = $ExpectedCommit }
$previousCfToken = $env:CLOUDFLARE_API_TOKEN
$previousCfAccount = $env:CLOUDFLARE_ACCOUNT_ID
$previousCi = $env:CI
$cfToken = $null
try {
    if ([string]::IsNullOrWhiteSpace($previousCfToken)) {
        $secureCfToken = Read-Host 'Token Cloudflare con acceso Pages de lectura y D1 del entorno elegido' -AsSecureString
        try { $cfToken = [Net.NetworkCredential]::new('', $secureCfToken).Password }
        finally { $secureCfToken.Dispose() }
    } else { $cfToken = $previousCfToken }
    Assert-Check (-not [string]::IsNullOrWhiteSpace($cfToken)) 'credencial Cloudflare disponible'
    $cfHeaders = @{ Authorization = "Bearer $cfToken" }
    $project = Invoke-Cloudflare 'pages/projects/shekinah'
    $deployment = Invoke-Cloudflare "pages/projects/shekinah/deployments/$DeploymentId"
    Assert-Check ($deployment.deployment_trigger.metadata.commit_hash -ceq $ExpectedCommit -and $deployment.environment -ceq $environmentName -and $deployment.latest_stage.status -ceq 'success') 'deployment Pages exitoso del SHA y entorno exactos'
    $config = $project.deployment_configs.$environmentName
    Assert-Check ($config.d1_databases.DB.id -ceq $DatabaseId) 'binding Pages DB objetivo'
    Assert-Check ($deployment.d1_databases.DB.id -ceq $DatabaseId) 'binding DB del deployment exacto'
    Assert-Check ($project.deployment_configs.preview.d1_databases.DB.id -cne $project.deployment_configs.production.d1_databases.DB.id) 'D1 preview y producción distintas'
    $database = Invoke-Cloudflare "d1/database/$DatabaseId"
    Assert-Check ($database.uuid -ceq $DatabaseId -and $database.name -ceq $databaseName) 'identidad D1 por API'
    if ($Phase -eq 'Production') {
        Assert-Check ($project.canonical_deployment.id -ceq $DeploymentId -and $project.canonical_deployment.deployment_trigger.metadata.commit_hash -ceq $ExpectedCommit) 'deployment canónico productivo del SHA exacto'
    }
    else { Assert-Check ($SiteOrigin -cin @($deployment.url) + @($deployment.aliases)) 'URL preview pertenece al deployment' }
    if ($RequestOrigin -cne $SiteOrigin) {
        Assert-Check ($RequestOrigin -ceq $deployment.url) 'transporte igual a URL inmutable del deployment verificado; ningún alias'
        Record-Check 'transporte HTTPS alternativo del mismo deployment productivo' @{ requestOrigin = $RequestOrigin; publicOrigin = $SiteOrigin }
        $verificationLog.Add([ordered]@{
            at = [DateTimeOffset]::UtcNow.ToString('o'); check = 'HTTPS y catálogo del dominio canónico requieren prueba funcional externa'
            result = 'pending_external'; origin = $SiteOrigin
        })
        Save-Receipt 'running'
        Write-Warning 'El transporte Pages no verifica HTTPS ni el funcionamiento de shekinah.ar. La prueba funcional canónica externa sigue siendo obligatoria.'
    }
    foreach ($environmentVariables in @($config.env_vars, $deployment.env_vars)) {
        Assert-Check ($environmentVariables.DUX_COMPANY_ID.value -ceq $companyId -and $environmentVariables.DUX_BRANCH_ID.value -ceq $ExpectedBranchId -and $environmentVariables.DUX_DEPOSIT_ID.value -ceq $ExpectedDepositId) 'tenant configurado y desplegado en Pages'
        foreach ($flag in @('COMMERCE_ENABLED', 'VITE_COMMERCE_ENABLED', 'MERCADO_LIBRE_CATALOG_ENABLED', 'VITE_MERCADO_LIBRE_CATALOG_ENABLED')) {
            Assert-Check ($environmentVariables.$flag.value -ceq 'false') "$flag configurado y desplegado cerrado"
        }
        Assert-Check ($environmentVariables.DUX_API_ENABLED.value -ceq 'true') 'lectura Dux preparada y desplegada por configuración externa autorizada'
    }
    Assert-Tenant -AllowBootstrap
    Record-Check 'deployment, binding, base y prerrequisito de tenant verificados'

    # Autenticar antes de migrar. Una sesión reutilizada requiere autorización
    # explícita del operador y la misma validación firmada que usa el navegador.
    if ($null -ne $AdminSessionCookie) {
        $cookieValue = $null
        try {
            $cookieValue = [Net.NetworkCredential]::new('', $AdminSessionCookie).Password
            Assert-Check ($cookieValue.Length -le 4096 -and $cookieValue -cmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') 'formato de sesión administrativa explícita'
            $cookie = [Net.Cookie]::new('__Host-shekinah-admin', $cookieValue, '/')
            $cookie.Secure = $true
            $cookie.HttpOnly = $true
            $session.Cookies.Add($requestUri, $cookie)
            $sessionResult = Invoke-Admin '/api/admin/auth/session'
            Assert-Check ($sessionResult.authenticated -eq $true -and $sessionResult.identity.source -ceq 'password') 'sesión administrativa existente validada por el servidor del entorno'
            $loggedIn = $true
        } finally {
            $cookieValue = $null
            $cookie = $null
        }
    } else {
        $username = Read-Host "Usuario administrativo de $environmentName"
        $securePassword = Read-Host "Contraseña administrativa de $environmentName" -AsSecureString
        $loginBody = $null
        try {
            $loginBody = @{ username = $username; password = [Net.NetworkCredential]::new('', $securePassword).Password }
            $loginResult = Invoke-Admin '/api/admin/auth/login' 'POST' $loginBody
            Assert-Check ($loginResult.authenticated -eq $true) 'sesión administrativa autenticada'
            $loggedIn = $true
            $createdAdminSession = $true
        } finally {
            if ($null -ne $loginBody) { $loginBody.password = $null }
            $securePassword.Dispose()
            $loginBody = $null
        }
    }
    Record-Check 'administrador autenticado antes de migraciones'
    $applied = @(Read-D1 'SELECT name FROM d1_migrations ORDER BY name;').name
    $prior = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'migrations') -Filter '*.sql' | Where-Object Name -match '^00(0[1-9]|1[0-4])_' | Select-Object -ExpandProperty Name)
    Assert-Check ($prior.Count -eq 14) '14 migraciones previas versionadas'
    foreach ($migration in $prior) { Assert-Check ($migration -cin $applied) "prerrequisito D1 $migration" }
    Assert-Check (@($applied | Where-Object { $_ -cnotin (@($prior) + $migrationNames) }).Count -eq 0) 'sin migraciones remotas desconocidas'
    $bookmarkResult = Invoke-Cloudflare "d1/database/$DatabaseId/time_travel/bookmark"
    $bookmark = $bookmarkResult.bookmark
    Assert-Check (-not [string]::IsNullOrWhiteSpace($bookmark)) 'bookmark Time Travel anterior a migraciones'
    Record-Check 'bookmark previo conservado' @{ bookmark = $bookmark }

    # Configuración aislada: sólo estos tres SQL y esta D1; nunca despliega Pages.
    $migrationDirectory = Join-Path $evidenceRoot ("migrations-$environmentName-" + [Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $migrationDirectory
    foreach ($migration in $migrationNames) { Copy-Item -LiteralPath (Join-Path $repoRoot "migrations/$migration") -Destination (Join-Path $migrationDirectory $migration) }
    $wranglerConfig = Join-Path $migrationDirectory 'wrangler.json'
    @{ name = 'shekinah-dux-catalog-operations'; account_id = $AccountId; d1_databases = @(@{ binding = 'DB'; database_name = $databaseName; database_id = $DatabaseId; migrations_dir = '.' }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $wranglerConfig -Encoding utf8NoBOM
    $env:CLOUDFLARE_API_TOKEN = $cfToken
    $env:CLOUDFLARE_ACCOUNT_ID = $AccountId
    $env:CI = 'true'
    $migrationOutput = & $WranglerPath d1 migrations apply $databaseName --remote --config $wranglerConfig --cwd $migrationDirectory 2>&1
    Assert-Check ($LASTEXITCODE -eq 0) 'Wrangler aplicó exclusivamente 0015, 0016 y 0017'
    $migrationOutput = $null
    $appliedAfter = @(Read-D1 'SELECT name FROM d1_migrations ORDER BY name;').name
    foreach ($migration in $migrationNames) { Assert-Check ($migration -cin $appliedAfter) "migración aplicada $migration" }
    Assert-Check (@(Read-D1 'PRAGMA foreign_key_check;').Count -eq 0) 'foreign_key_check limpio'
    $flags = @(Read-D1 'SELECT company_id, snapshot_collection_enabled, public_catalog_enabled, public_cutover_enabled FROM dux_catalog_control;')
    Assert-Check ($flags.Count -eq 1 -and $flags[0].company_id -ceq $companyId -and $flags[0].snapshot_collection_enabled -eq 0 -and $flags[0].public_catalog_enabled -eq 0 -and $flags[0].public_cutover_enabled -eq 0) 'los tres controles comienzan en 0'
    Record-Check 'migraciones, claves foráneas y tres controles cerrados'

    $null = Assert-Control $false $false
    $legacy = Read-PublicCatalog
    Assert-Check ($legacy.source -ceq 'legacy-bootstrap') 'catálogo local anterior al corte'
    $legacyIds = @($legacy.products.id | Sort-Object -CaseSensitive)
    $status = Invoke-Admin '/api/admin/dux/status'
    Assert-Check ($status.enabled -eq $true -and $status.lifecycleReady -eq $false -and $status.unitSemanticsReady -eq $false -and $status.counts.checkoutEligibleCount -eq 0) 'lectura Dux disponible y comercio bloqueado'
    $mayNeedRollback = $true
    $null = Invoke-Admin '/api/admin/dux/catalog-control' 'POST' @{ snapshotCollectionEnabled = $true }
    $null = Assert-Control $true $false
    $sync = Invoke-Admin '/api/admin/dux/sync' 'POST'
    $syncRunId = $sync.summary.runId
    Assert-Check ($syncRunId -match '^dux_sync_' -and $sync.catalog.inventoryRunId -ceq $syncRunId) 'única sincronización publica snapshot'
    # El bootstrap del servidor verifica Dux y publica el tenant junto al inventario.
    # Los imports que requieren tenant sólo pueden ejecutarse después de este control.
    Assert-Tenant
    $payload = Assert-Snapshot
    foreach ($import in @(
        @{ path = '/api/admin/dux/editorial-links/import'; count = 135 },
        @{ path = '/api/admin/dux/editorial-triage/import'; count = 747 }
    )) {
        $first = Invoke-Admin $import.path 'POST'
        Assert-Check ($first.expected -eq $import.count -and ($first.created -eq $import.count -or ($first.created -eq 0 -and $first.idempotent -eq $true))) 'primera importación fija válida'
        $second = Invoke-Admin $import.path 'POST'
        Assert-Check ($second.expected -eq $import.count -and $second.created -eq 0 -and $second.idempotent -eq $true) 'segunda importación idempotente'
        Record-Check "importación fija dos veces: $($import.path)" @{ firstCreated = $first.created; secondCreated = $second.created }
    }
    Assert-BaselineTriage
    $null = Assert-Control $true $false
    Record-Check '135 auto-confirmados, 294 pendientes, 318 enriquecimientos descartados'
    Enable-PublicCatalog
    Assert-PublicCatalog $payload
    $null = Invoke-Admin '/api/admin/dux/catalog-control' 'POST' @{ publicCatalogEnabled = $false }
    $null = Assert-Control $true $false
    $rolledBack = Read-PublicCatalog
    Assert-Check ($rolledBack.source -ceq 'legacy-bootstrap' -and @($rolledBack.products).Count -eq $legacyIds.Count) 'rollback devuelve catálogo local'
    Assert-Check (@(Compare-Object $legacyIds @($rolledBack.products.id | Sort-Object -CaseSensitive) -CaseSensitive).Count -eq 0) 'rollback conserva exactamente IDs locales'
    $payload = Assert-Snapshot
    Assert-BaselineTriage
    Assert-Check (@(Read-D1 'PRAGMA foreign_key_check;').Count -eq 0) 'claves foráneas después de rollback'
    Record-Check 'rollback probado sin borrar snapshot, triage o vínculos'
    Enable-PublicCatalog
    Assert-PublicCatalog $payload
    $mayNeedRollback = $false
    Save-Receipt 'passed'
    if ($Phase -ceq 'Production' -and $RequestOrigin -cne $SiteOrigin) {
        Write-Host "FASE OPERATIVA $Phase COMPLETA; COMPROBACIÓN CANÓNICA PENDIENTE. Recibo: $receiptPath"
    } else { Write-Host "FASE $Phase COMPLETA. Recibo: $receiptPath" }
} catch {
    if ($mayNeedRollback -and $loggedIn) {
        try {
            $null = Invoke-Admin '/api/admin/dux/catalog-control' 'POST' @{ publicCatalogEnabled = $false; snapshotCollectionEnabled = $false }
            $null = Assert-Control $false $false
            Record-Check 'cierre seguro tras fallo: catálogo y colección deshabilitados'
        } catch {
            $verificationLog.Add([ordered]@{ at = [DateTimeOffset]::UtcNow.ToString('o'); check = 'cierre seguro tras fallo'; result = 'failed' })
            Write-Warning 'No se pudo verificar el cierre remoto. No repetir el sync. Usar rollback del panel y comprobar los tres controles antes de continuar.'
        }
    }
    Save-Receipt 'failed'
    throw
} finally {
    if ($createdAdminSession) {
        try { $null = Invoke-Admin '/api/admin/auth/logout' 'POST' }
        catch { Write-Warning 'No se pudo confirmar logout; la cookie sólo permanece en la sesión de este proceso.' }
    }
    $session = $null
    $cfHeaders = $null
    $cfToken = $null
    $env:CLOUDFLARE_API_TOKEN = $previousCfToken
    $env:CLOUDFLARE_ACCOUNT_ID = $previousCfAccount
    $env:CI = $previousCi
}
