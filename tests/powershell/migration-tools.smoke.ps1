Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Import-Module (Join-Path $PSScriptRoot '..\..\scripts\wordpress-reference\MigrationTools.psm1') -Force -DisableNameChecking

$parseTargets = @(
    (Join-Path $PSScriptRoot '..\..\scripts\Run-FullMigration.ps1'),
    (Join-Path $PSScriptRoot '..\..\scripts\Migrate-WordPressReference.ps1'),
    (Join-Path $PSScriptRoot '..\..\scripts\wordpress-reference\MigrationTools.psm1')
)
foreach ($target in $parseTargets) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path -LiteralPath $target), [ref]$tokens, [ref]$errors
    )
    if ($errors.Count) { throw "$target contiene $($errors.Count) error(es) sintácticos." }
}

$envFile = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($envFile, "`n# comentario`nLOCAL_PORT = `"8081`"`nSINGLE='a=b'`nPLAIN=x=y`n")
    $values = Read-DotEnv $envFile
    if ($values.LOCAL_PORT -ne '8081' -or $values.SINGLE -ne 'a=b' -or $values.PLAIN -ne 'x=y') {
        throw 'Read-DotEnv no conservó comillas o signos igual correctamente.'
    }
}
finally { Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue }

Assert-ContainerId -Value ('a' * 64) -Service 'self-test' | Out-Null
$rejected = $false
try {
    Assert-ContainerId -Value 'Usage: docker compose' -Service 'self-test' | Out-Null
}
catch { $rejected = $true }
if (-not $rejected) { throw 'Assert-ContainerId aceptó texto de ayuda.' }

Write-Host 'PowerShell migration smoke: PASS'
