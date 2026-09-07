#requires -Version 7.0
<#
Pruebas locales del procedimiento operativo. Ejecutar con pwsh -NoProfile -File
tests/finalize-dux-catalog.tests.ps1. Cada caso corre aislado, con HTTP, Git,
Wrangler, GitHub CLI y credenciales completamente simulados. No consulta la red.
#>
param([ValidateSet('all','success','missing-tenant','missing-tenant-inventory','missing-tenant-after-sync','wrong-tenant','sync-failure','production-no-receipt','unsafe-target','price-mismatch','editorial-mismatch','rollback-failure','http-known-code','http-untrusted-code','production-canonical','production-expired-receipt','production-future-receipt','transport-production','transport-wrong-host','transport-preview-phase','transport-preview-deployment','transport-alias','transport-different-canonical','transport-no-credentials')][string]$Scenario='all')
$ErrorActionPreference='Stop'
$scenarios=@('success','missing-tenant','missing-tenant-inventory','missing-tenant-after-sync','wrong-tenant','sync-failure','production-no-receipt','unsafe-target','price-mismatch','editorial-mismatch','rollback-failure','http-known-code','http-untrusted-code','production-canonical','production-expired-receipt','production-future-receipt','transport-production','transport-wrong-host','transport-preview-phase','transport-preview-deployment','transport-alias','transport-different-canonical','transport-no-credentials')
if($Scenario -eq 'all') {
 $pwshExecutable=Join-Path $PSHOME $(if($IsWindows){'pwsh.exe'}else{'pwsh'})
 foreach($case in $scenarios) {
  & $pwshExecutable -NoProfile -File $PSCommandPath -Scenario $case
  if($LASTEXITCODE -ne 0){throw "Mock fallido: $case"}
 }
 Write-Host "MOCK TESTS PASS: $($scenarios.Count)/$($scenarios.Count)"
 return
}
$global:testRepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$env:CLOUDFLARE_API_TOKEN='mock-only-not-a-real-secret'
$global:testState=@{ collection=$false; public=$false; migrations=$false; syncCount=0; imports=@{}; networkCount=0; postTenantVerified=$false; publicEnables=0; rollbacks=0; credentialPrompts=0; adminRequests=0; loginCount=0 }
$global:testSha='a'*40
$global:testDb='11111111-1111-1111-1111-111111111111'
$global:testDeployment='33333333-3333-3333-3333-333333333333'
$global:testPayload=@{schemaVersion=2;priceListName='PRECIOS DEL NEGOCIO';items=@(
 @{code='A';name='Producto A';priceStatus='usable';priceAmount=3;categories=@()},
 @{code='B';name='Producto B';priceStatus='placeholder';priceAmount=$null;categories=@()},
 @{code='C';name='Producto C';priceStatus='missing_or_zero';priceAmount=$null;categories=@()}
)}
$global:testScenario=$Scenario
$global:testDirectory=Join-Path ([IO.Path]::GetTempPath()) ('shekinah-dux-script-tests/evidence-'+$Scenario+'-'+[Guid]::NewGuid().ToString('N'))
function global:node { 'v'+(Get-Content -LiteralPath (Join-Path $global:testRepoRoot '.node-version') -Raw).Trim(); $global:LASTEXITCODE=0 }
function global:git {
  $global:LASTEXITCODE=0
  if($args -contains 'branch'){'main'}
  elseif($args -contains 'rev-parse'){$global:testSha}
  elseif($args -contains 'ls-remote'){ $global:testSha+"`trefs/heads/main" }
  elseif($args -contains 'status'){return}
  else {throw 'Unexpected mocked Git command'}
}
function global:fakeGh { $global:LASTEXITCODE=0; @{workflow_runs=@(@{id=123;head_sha=$global:testSha;head_branch='main';status='completed';conclusion='success'})}|ConvertTo-Json -Depth 8 }
function global:fakeWrangler { $global:testState.migrations=$true; $global:LASTEXITCODE=0 }
function global:Read-Host {
 param($Prompt,[switch]$AsSecureString)
 if($Prompt -like '*ACTIVAR CATALOGO PRODUCTION*'){return ('ACTIVAR CATALOGO PRODUCTION '+$global:testSha)}
 $global:testState.credentialPrompts++
 if($global:testScenario -eq 'transport-no-credentials'){throw 'Credenciales administrativas no proporcionadas al proceso simulado'}
 if($AsSecureString){ConvertTo-SecureString 'mock-only-not-a-real-secret' -AsPlainText -Force}else{'test-admin'}
}
function global:Invoke-RestMethod {
 param($Uri,$Method,$Headers,$Body,$WebSession,$MaximumRedirection,$TimeoutSec,$ErrorAction,$ContentType)
 $global:testState.networkCount++
 if($MaximumRedirection -ne 0 -or -not $Uri.StartsWith('https://')){throw 'TLS/redirect protection missing'}
 if($Uri.StartsWith('https://api.cloudflare.com/')) {
  $result=$null
  if($Uri -match '/pages/projects/shekinah$') {
   $vars=@{};foreach($flag in @('COMMERCE_ENABLED','VITE_COMMERCE_ENABLED','MERCADO_LIBRE_CATALOG_ENABLED','VITE_MERCADO_LIBRE_CATALOG_ENABLED')){$vars[$flag]=@{value='false'}}
   $vars.DUX_COMPANY_ID=@{value='12862'};$vars.DUX_BRANCH_ID=@{value='1'};$vars.DUX_DEPOSIT_ID=@{value='25566'};$vars.DUX_API_ENABLED=@{value='true'}
   $otherDb='22222222-2222-2222-2222-222222222222'
   $previewDb=if($global:testPhase -eq 'Production'){$otherDb}else{$global:testDb}
   $productionDb=if($global:testPhase -eq 'Production'){$global:testDb}else{$otherDb}
   $canonicalId=if($global:testScenario -eq 'transport-different-canonical'){'44444444-4444-4444-4444-444444444444'}else{$global:testDeployment}
   $result=@{canonical_deployment=@{id=$canonicalId;deployment_trigger=@{metadata=@{commit_hash=$global:testSha}}};deployment_configs=@{preview=@{d1_databases=@{DB=@{id=$previewDb}};env_vars=$vars};production=@{d1_databases=@{DB=@{id=$productionDb}};env_vars=$vars}}}
  } elseif($Uri -match '/deployments/') {
   $vars=@{};foreach($flag in @('COMMERCE_ENABLED','VITE_COMMERCE_ENABLED','MERCADO_LIBRE_CATALOG_ENABLED','VITE_MERCADO_LIBRE_CATALOG_ENABLED')){$vars[$flag]=@{value='false'}}
   $vars.DUX_COMPANY_ID=@{value='12862'};$vars.DUX_BRANCH_ID=@{value='1'};$vars.DUX_DEPOSIT_ID=@{value='25566'};$vars.DUX_API_ENABLED=@{value='true'}
   $deployedDb=if($global:testScenario -eq 'unsafe-target'){'22222222-2222-2222-2222-222222222222'}else{$global:testDb}
   $result=@{deployment_trigger=@{metadata=@{commit_hash=$global:testSha}};environment=$global:testPhase.ToLowerInvariant();latest_stage=@{status='success'};url=$global:testDeploymentUrl;aliases=@('https://main.shekinah-7dl.pages.dev');env_vars=$vars;d1_databases=@{DB=@{id=$deployedDb}}}
  }
  elseif($Uri -match '/time_travel/bookmark$') {$result=@{bookmark='mock-bookmark'}}
  elseif($Uri -match '/query$') {
   $sql=($Body|ConvertFrom-Json).sql;$rows=@()
   if($sql -match '^SELECT company_id, branch_id') {
    $missing=$global:testScenario -in @('missing-tenant','missing-tenant-inventory','missing-tenant-after-sync')
    if(-not $missing -or ($global:testState.syncCount -eq 1 -and $global:testScenario -ne 'missing-tenant-after-sync')) {
     $company=if($global:testScenario -eq 'wrong-tenant'){'99999'}else{'12862'}
     $rows=@(@{company_id=$company;branch_id='1';deposit_id='25566'})
     if($global:testState.syncCount -eq 1){$global:testState.postTenantVerified=$true}
    }
   }
   elseif($sql -match '^SELECT COUNT\(\*\) AS amount FROM dux_inventory_items;') { $rows=@(@{amount=$(if($global:testScenario -eq 'missing-tenant-inventory'){749}else{0})}) }
   elseif($sql -match 'SELECT name FROM d1_migrations') { $rows=@(Get-ChildItem -LiteralPath (Join-Path $global:testRepoRoot 'migrations') -Filter '*.sql'|Where-Object { $global:testState.migrations -or $_.Name -match '^00(0[1-9]|1[0-4])_' }|ForEach-Object{@{name=$_.Name}}) }
   elseif($sql -match '^PRAGMA foreign_key_check') {$rows=@()}
   elseif($sql -match '^SELECT company_id, snapshot_collection_enabled') {$rows=@(@{company_id='12862';snapshot_collection_enabled=0;public_catalog_enabled=0;public_cutover_enabled=0})}
   elseif($sql -match '^SELECT disposition') {$rows=@(@{disposition='auto_confirmed';review_state='auto_confirmed';amount=135},@{disposition='pending_manual_review';review_state='pending';amount=294},@{disposition='discarded_enrichment';review_state='discarded';amount=318})}
   elseif($sql -match 'FROM dux_editorial_links') {$rows=@(@{amount=135;active_count=135;unique_dux_count=135;unique_local_count=135;reuse_images_count=134;reuse_description_count=$(if($global:testScenario -eq 'editorial-mismatch'){126}else{127})})}
   elseif($sql -match 'FROM dux_catalog_snapshots_v2') {$rows=@(@{catalog_version=('b'*64);inventory_run_id='dux_sync_mock';item_count=3;payload_json=($global:testPayload|ConvertTo-Json -Depth 10);synced_at=[DateTimeOffset]::UtcNow.ToString('o')})}
   else {throw ('Unexpected SQL '+$sql)}
   $result=@(@{success=$true;results=$rows})
  } elseif($Uri -match '/d1/database/'){$result=@{uuid=$global:testDb;name=$(if($global:testPhase -eq 'Production'){'shekinah-commerce'}else{'shekinah-commerce-preview'})}}
  else {throw 'Unexpected Cloudflare path'}
  return @{success=$true;result=$result}|ConvertTo-Json -Depth 20|ConvertFrom-Json
 }
 $path=([Uri]$Uri).AbsolutePath
 if(([Uri]$Uri).GetLeftPart([UriPartial]::Authority) -cne $global:testRequestOrigin){throw 'Request sent to an unexpected transport host'}
 if($path.StartsWith('/api/admin/')) {
  $global:testState.adminRequests++
  if($Headers.Origin -cne $global:testRequestOrigin -or $null -eq $WebSession){throw 'Administrative origin or session missing'}
  if($path -ne '/api/admin/auth/login' -and $global:testState.loginCount -ne 1){throw 'Administrative request inherited a session without login'}
 }
 if($path -eq '/api/admin/auth/login'){
  $global:testState.loginCount++
  if($global:testState.credentialPrompts -ne 2 -or $WebSession.Cookies.Count -ne 0){throw 'Login did not request credentials or inherited cookies'}
  if($global:testScenario -in @('http-known-code','http-untrusted-code')) {
   $response=[Net.Http.HttpResponseMessage]::new([Net.HttpStatusCode]::Unauthorized)
   $exception=[Microsoft.PowerShell.Commands.HttpResponseException]::new('SECRET_EXCEPTION_MUST_NOT_LEAK', $response)
   $record=[Management.Automation.ErrorRecord]::new($exception,'MockHttpError',[Management.Automation.ErrorCategory]::InvalidOperation,$null)
   $code=if($global:testScenario -eq 'http-known-code'){'ADMIN_CREDENTIALS_INVALID'}else{'SECRET_UNTRUSTED_CODE_MUST_NOT_LEAK'}
   $record.ErrorDetails=[Management.Automation.ErrorDetails]::new((@{error=@{code=$code;message='SECRET_RESPONSE_MUST_NOT_LEAK'}}|ConvertTo-Json -Depth 5))
   throw $record
  }
  return @{authenticated=$true}
 }
 if($path -eq '/api/admin/auth/logout'){return}
 if($path -eq '/api/admin/dux/catalog-control'){
  if($Method -eq 'POST'){$data=$Body|ConvertFrom-Json -AsHashtable;if($data.ContainsKey('publicCutoverEnabled')){throw 'Commercial flag mutation forbidden'};if($global:testScenario -eq 'rollback-failure' -and $data.ContainsKey('publicCatalogEnabled') -and -not $data.publicCatalogEnabled){throw 'Simulated rollback outage'};if($data.ContainsKey('snapshotCollectionEnabled')){$global:testState.collection=$data.snapshotCollectionEnabled};if($data.ContainsKey('publicCatalogEnabled')){if($data.publicCatalogEnabled){if($data.confirmation -ne 'ENABLE_DUX_PUBLIC_CATALOG'){throw 'Confirmation missing'};$global:testState.publicEnables++}else{if($global:testState.public){$global:testState.rollbacks++}};$global:testState.public=$data.publicCatalogEnabled}}
  $snapshot=if($global:testState.syncCount -gt 0){@{itemCount=3;stale=$false;checkoutEligibleCount=0;priceCounts=@{usable=1;placeholder=1;missing_or_zero=1;invalid=0};catalogVersion=('b'*64)}}else{$null}
  if($global:testScenario -eq 'price-mismatch' -and $null -ne $snapshot){$snapshot.priceCounts.usable=0}
  return @{control=@{companyId='12862';migrationApplied=$true;snapshotCollectionEnabled=$global:testState.collection;publicCatalogEnabled=$global:testState.public;publicCutoverEnabled=$false};snapshotError=$null;snapshot=$snapshot}
 }
 if($path -eq '/api/catalog'){
  if(-not $global:testState.public){return @{source='legacy-bootstrap';products=@(@{id='local-a'},@{id='local-b'})}}
  $products=@($global:testPayload.items|ForEach-Object { @{id=$_.code;sku=$_.code;name=$_.name;priceStatus=$_.priceStatus;price=$(if($_.priceStatus -eq 'usable'){@{amount=$_.priceAmount;currency='ARS'}}else{$null});commerce=@{source='dux';checkoutEligible=$false};categorySlugs=@();categoryNames=@()} })
  return @{source='dux';products=$products}|ConvertTo-Json -Depth 20|ConvertFrom-Json
 }
 if($path -match '/import$'){
  if($null -ne $Body){throw 'Import body forbidden'}
  if($global:testState.syncCount -ne 1 -or -not $global:testState.postTenantVerified){throw 'Import before official sync and strict tenant verification'}
  $count=if($path -match 'triage'){747}else{135};$again=$global:testState.imports.ContainsKey($path)
  if($again){$global:testState.imports[$path]++}else{$global:testState.imports[$path]=1}
  return @{expected=$count;created=$(if($again){0}else{$count});idempotent=$again}
 }
 if($path -eq '/api/admin/dux/status'){return @{enabled=$true;lifecycleReady=$false;unitSemanticsReady=$false;counts=@{checkoutEligibleCount=0}}}
 if($path -eq '/api/admin/dux/sync'){
  if(-not $global:testState.collection -or $global:testState.public -or $global:testState.imports.Count -ne 0){throw 'Unexpected controls or imports before sync'}
  $global:testState.syncCount++;if($global:testScenario -eq 'sync-failure'){throw 'Simulated timeout'}
  return @{summary=@{runId='dux_sync_mock'};catalog=@{inventoryRunId='dux_sync_mock'}}
 }
 throw 'Unexpected site path'
}
$phase=if($Scenario -like 'production-*' -or ($Scenario -like 'transport-*' -and $Scenario -ne 'transport-preview-phase')){'Production'}else{'Preview'}
$origin=if($phase -eq 'Production'){'https://shekinah.ar'}else{'https://test.shekinah-7dl.pages.dev'}
$global:testPhase=$phase
$global:testDeploymentUrl=if($phase -eq 'Production'){'https://33333333.shekinah-7dl.pages.dev'}else{$origin}
$optionalArguments=@{}
$global:testRequestOrigin=$origin
if($Scenario -like 'transport-*') {
 $global:testRequestOrigin=switch($Scenario){
  'transport-wrong-host' {'https://attacker.example'}
  'transport-preview-phase' {'https://33333333.shekinah-7dl.pages.dev'}
  'transport-preview-deployment' {'https://preview.shekinah-7dl.pages.dev'}
  'transport-alias' {'https://main.shekinah-7dl.pages.dev'}
  default {$global:testDeploymentUrl}
 }
 $optionalArguments.RequestOrigin=$global:testRequestOrigin
}
if($phase -eq 'Production' -and $Scenario -ne 'production-no-receipt') {
 $previewDirectory=Join-Path $global:testDirectory 'preview'
 $null=New-Item -ItemType Directory -Path $previewDirectory -Force
 $hashes=@{}
 foreach($relative in @('catalog/internal/dux-editorial-links-auto-import.json','catalog/internal/dux-editorial-triage-v1.json','migrations/0015_dux_catalog_snapshot.sql','migrations/0016_dux_editorial_links_and_cutover.sql','migrations/0017_dux_complete_public_catalog.sql')){$hashes[$relative]=(Get-FileHash -LiteralPath (Join-Path $global:testRepoRoot $relative) -Algorithm SHA256).Hash.ToLowerInvariant()}
 $optionalArguments.PreviewReceipt=Join-Path $previewDirectory 'receipt.json'
 $recordedAt=switch($Scenario){'production-expired-receipt'{[DateTimeOffset]::UtcNow.AddHours(-25)}'production-future-receipt'{[DateTimeOffset]::UtcNow.AddMinutes(5)}default{[DateTimeOffset]::UtcNow}}
 @{schemaVersion=1;phase='preview';status='passed';commit=$global:testSha;databaseId='22222222-2222-2222-2222-222222222222';databaseName='shekinah-commerce-preview';accountId=('a'*32);companyId='12862';recordedAt=$recordedAt.ToString('o');files=$hashes}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $optionalArguments.PreviewReceipt -Encoding utf8NoBOM
}
if($Scenario -eq 'transport-no-credentials'){$env:ADMIN_USERNAME='must-not-use-environment';$env:ADMIN_PASSWORD='must-not-use-environment'}
$caught=$null
try {
 & (Join-Path $global:testRepoRoot 'scripts/finalize-dux-catalog.ps1') -Phase $phase -ExpectedCommit $global:testSha -AccountId ('a'*32) -DatabaseId $global:testDb -DeploymentId $global:testDeployment -SiteOrigin $origin -ExpectedBranchId '1' -ExpectedDepositId '25566' -EvidenceDirectory $global:testDirectory -WranglerPath fakeWrangler -GitHubCliPath fakeGh -ExpectedItems 3 -ExpectedUsable 1 -ExpectedPlaceholder 1 -ExpectedMissingOrZero 1 -ExpectedInvalid 0 @optionalArguments
}catch{$caught=$_.Exception.Message;Write-Host "EXPECTED/OBSERVED ERROR: $caught"}
if($Scenario -in @('success','missing-tenant','production-canonical','transport-production')) {
 if($caught -or $global:testState.syncCount -ne 1 -or -not $global:testState.public -or -not $global:testState.collection){throw 'Successful phase failed its assertions'}
 if($global:testState.publicEnables -ne 2 -or $global:testState.rollbacks -ne 1 -or $global:testState.imports.Count -ne 2 -or @($global:testState.imports.Values|Where-Object {$_ -ne 2}).Count -ne 0){throw 'Imports, rollback and reactivation did not complete exactly once'}
 $receipt=Get-Content -Raw (Get-ChildItem -LiteralPath $global:testDirectory -Filter '*.json').FullName|ConvertFrom-Json
 if($receipt.status -ne 'passed' -or -not $receipt.syncAttempted){throw 'Success receipt invalid'}
 if($receipt.origin -cne $origin -or $receipt.requestOrigin -cne $global:testRequestOrigin){throw 'Receipt confused public origin and transport'}
 if($Scenario -eq 'production-canonical' -and -not $receipt.canonicalHttpsVerified){throw 'Direct canonical HTTPS verification missing'}
 if($Scenario -eq 'transport-production' -and ($receipt.canonicalHttpsVerified -or $receipt.canonicalVerification -cne 'pending_external' -or @($receipt.checks|Where-Object result -eq 'pending_external').Count -ne 1)){throw 'Alternate transport incorrectly certified canonical HTTPS'}
}elseif($Scenario -eq 'sync-failure'){
 if(-not $caught -or $global:testState.syncCount -ne 1 -or $global:testState.public -or $global:testState.collection){throw 'Failure did not close controls or retried sync'}
}elseif($Scenario -in @('wrong-tenant','unsafe-target','missing-tenant-inventory')){
 if(-not $caught -or $global:testState.migrations -or $global:testState.syncCount -ne 0){throw 'Tenant mismatch did not stop before mutation'}
}elseif($Scenario -eq 'missing-tenant-after-sync'){
 if($caught -notlike '*tenant previamente verificado presente*' -or $global:testState.syncCount -ne 1 -or $global:testState.imports.Count -ne 0 -or $global:testState.public -or $global:testState.collection){throw 'Missing tenant after sync did not stop imports and close controls'}
}elseif($Scenario -in @('price-mismatch','editorial-mismatch')){
 if(-not $caught -or $global:testState.syncCount -ne 1 -or $global:testState.public -or $global:testState.collection){throw 'Price mismatch did not close catalog/collection after one sync'}
 if($Scenario -eq 'editorial-mismatch' -and $caught -notlike '*reutilización autorizada: 134 imágenes y 127 descripciones*'){throw 'Editorial permissions mismatch was not detected'}
}elseif($Scenario -eq 'rollback-failure'){
 $receipt=Get-Content -Raw (Get-ChildItem -LiteralPath $global:testDirectory -Filter '*.json').FullName|ConvertFrom-Json
 if(-not $caught -or $global:testState.syncCount -ne 1 -or $receipt.status -ne 'failed' -or @($receipt.checks|Where-Object result -eq 'failed').Count -ne 1){throw 'Unverifiable rollback did not produce failed receipt'}
}elseif($Scenario -in @('http-known-code','http-untrusted-code')){
 if($caught -notlike '*HTTP 401*' -or $caught -like '*SECRET_*' -or $global:testState.syncCount -ne 0 -or $global:testState.imports.Count -ne 0){throw 'HTTP diagnostic missing status or exposing untrusted information'}
 if($Scenario -eq 'http-known-code' -and $caught -notlike '*código ADMIN_CREDENTIALS_INVALID*'){throw 'Known error code missing'}
 if($Scenario -eq 'http-untrusted-code' -and $caught -like '*código*'){throw 'Unknown error code was exposed'}
}elseif($Scenario -eq 'transport-no-credentials'){
 if($caught -notlike '*Credenciales administrativas no proporcionadas*' -or $global:testState.credentialPrompts -ne 1 -or $global:testState.adminRequests -ne 0 -or $global:testState.syncCount -ne 0 -or $global:testState.collection -or $global:testState.public){throw 'Transport reused credentials or an inherited session'}
}elseif($Scenario -like 'transport-*'){
 if(-not $caught -or $global:testState.migrations -or $global:testState.credentialPrompts -ne 0 -or $global:testState.adminRequests -ne 0 -or $global:testState.syncCount -ne 0){throw 'Unsafe transport did not stop before credentials and mutations'}
}elseif($Scenario -in @('production-expired-receipt','production-future-receipt')){
 if($caught -notlike '*preview verde en las últimas 24 horas*' -or $global:testState.networkCount -ne 0 -or $global:testState.migrations -or $global:testState.syncCount -ne 0){throw 'Invalid preview date did not stop before HTTP and mutations'}
}else{
 if(-not $caught -or $global:testState.networkCount -ne 0 -or $global:testState.migrations){throw 'Production without receipt made remote requests'}
}
Write-Host "MOCK TEST PASS: $Scenario"
