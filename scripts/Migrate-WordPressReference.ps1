[CmdletBinding()]
param(
    [string]$SourceUrl = '',
    [string]$WorkRoot = 'C:\laburo\shekinah-wordpress-reference',
    [string]$RepositoryRoot = 'C:\laburo\shekinah',
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

if ($SourceUrl) {
    Write-Warning '-SourceUrl se ignora deliberadamente. Run-FullMigration.ps1 lee LOCAL_PORT desde la restauración .env.'
}

$arguments = @{
    RepositoryRoot = $RepositoryRoot
    WorkRoot = $WorkRoot
    OriginalBackupRoot = $OriginalBackupRoot
    OriginalAuditRoot = $OriginalAuditRoot
    ProjectName = $ProjectName
    MaxPages = $MaxPages
    Publish = $Publish
    WaitForRemote = $WaitForRemote
}
if ($ComposePath) { $arguments.ComposePath = $ComposePath }
if ($SqlPath) { $arguments.SqlPath = $SqlPath }

& (Join-Path $PSScriptRoot 'Run-FullMigration.ps1') @arguments
