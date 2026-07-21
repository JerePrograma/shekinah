Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$WorkingDirectory = ''
    )

    $previous = Get-Location
    try {
        if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Falló ($LASTEXITCODE): $Command $($Arguments -join ' ')"
        }
    }
    finally {
        Set-Location -LiteralPath $previous
    }
}

function Invoke-Captured {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & $Command @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Falló ($exitCode): $Command $($Arguments -join ' ')`n$($output | Out-String)"
    }
    [pscustomobject]@{ ExitCode = $exitCode; Output = (($output | Out-String).Trim()) }
}

function Invoke-Compose {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Capture,
        [switch]$AllowFailure
    )

    $all = @('compose', '-p', $Context.ProjectName, '-f', $Context.ComposePath) + $Arguments
    if ($Capture) {
        return Invoke-Captured -Command 'docker' -Arguments $all -AllowFailure:$AllowFailure
    }
    Invoke-Checked -Command 'docker' -Arguments $all
}

function Read-DotEnv {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
    }
    $values
}

function Get-EnvValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Values,
        [Parameter(Mandatory)][string[]]$Names,
        [string]$Default = ''
    )

    foreach ($name in $Names) {
        if ($Values.ContainsKey($name) -and [string]$Values[$name]) {
            return [string]$Values[$name]
        }
    }
    $Default
}

function Get-MajorVersion {
    param([Parameter(Mandatory)][string]$Text)
    $match = [regex]::Match($Text, '(?<!\d)(\d+)(?:\.\d+){0,2}')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    0
}

function Update-ProcessPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machine, $user, $env:Path) -join [IO.Path]::PathSeparator
}

function Ensure-NodeToolchain {
    [CmdletBinding()]
    param()

    $nodeMajor = if (Get-Command node -ErrorAction SilentlyContinue) {
        Get-MajorVersion ((& node --version) | Out-String)
    } else { 0 }

    if ($nodeMajor -lt 24) {
        if (Get-Command nvm -ErrorAction SilentlyContinue) {
            Invoke-Checked -Command 'nvm' -Arguments @('install', '24')
            Invoke-Checked -Command 'nvm' -Arguments @('use', '24')
            Update-ProcessPath
        }
        elseif (Get-Command winget -ErrorAction SilentlyContinue) {
            Invoke-Checked -Command 'winget' -Arguments @(
                'install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--silent',
                '--accept-package-agreements', '--accept-source-agreements'
            )
            Update-ProcessPath
        }
        else {
            throw 'Se requiere Node.js 24. No se encontró nvm-windows ni winget.'
        }
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js no está disponible en PATH.'
    }
    $nodeVersion = ((& node --version) | Out-String).Trim()
    if ((Get-MajorVersion $nodeVersion) -lt 24) {
        throw "Se requiere Node.js 24 o superior. Versión activa: $nodeVersion. Si winget actualizó Node, abra un PowerShell nuevo y vuelva a ejecutar."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'npm no está disponible en PATH.'
    }
    $npmVersion = ((& npm --version) | Out-String).Trim()
    if ((Get-MajorVersion $npmVersion) -lt 11) {
        Invoke-Checked -Command 'npm' -Arguments @('install', '--global', 'npm@11')
        Update-ProcessPath
        $npmVersion = ((& npm --version) | Out-String).Trim()
    }
    if ((Get-MajorVersion $npmVersion) -lt 11) {
        throw "Se requiere npm 11 o superior. Versión activa: $npmVersion."
    }
    [pscustomobject]@{ Node = $nodeVersion; Npm = $npmVersion }
}

function Get-PathFingerprint {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $item = Get-Item -LiteralPath $resolved -Force
    $records = if ($item.PSIsContainer) {
        @(
            foreach ($file in Get-ChildItem -LiteralPath $resolved -File -Recurse -Force | Sort-Object FullName) {
                $relative = [IO.Path]::GetRelativePath($resolved, $file.FullName).Replace('\', '/')
                $sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                "$relative|$($file.Length)|$sha"
            }
        )
    }
    else {
        $sha = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
        @("$($item.Name)|$($item.Length)|$sha")
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($records -join "`n"))
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [Convert]::ToHexString($algorithm.ComputeHash($bytes)).ToLowerInvariant() }
    finally { $algorithm.Dispose() }
    [pscustomobject]@{ Path = $resolved; Files = $records.Count; Fingerprint = $fingerprint }
}

function Wait-ComposeDatabase {
    [CmdletBinding()]
    param([Parameter(Mandatory)][hashtable]$Context, [int]$TimeoutSeconds = 180)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $last = 'not-created'
    do {
        $id = (Invoke-Compose -Context $Context -Arguments @('ps', '-q', 'db') -Capture).Output.Trim()
        if ($id) {
            $inspect = Invoke-Captured -Command 'docker' -Arguments @(
                'inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $id
            ) -AllowFailure
            $last = $inspect.Output.Trim()
            if ($last -eq 'healthy') { return }
            $ping = Invoke-Compose -Context $Context -Arguments @(
                'exec', '-T', 'db', 'sh', '-lc',
                'mariadb-admin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null'
            ) -Capture -AllowFailure
            if ($ping.ExitCode -eq 0) { return }
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    $logs = Invoke-Compose -Context $Context -Arguments @('logs', '--tail', '100', 'db') -Capture -AllowFailure
    throw "MariaDB no quedó disponible. Estado: $last`n$($logs.Output)"
}

function Invoke-WpCli {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $composeArguments = @(
        'run', '--rm', 'wpcli', '--allow-root', '--path=/var/www/html'
    ) + $Arguments
    Invoke-Compose -Context $Context -Arguments $composeArguments -Capture -AllowFailure:$AllowFailure
}

function Repair-WordPressDatabaseAccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][hashtable]$Environment
    )

    $probe = Invoke-WpCli -Context $Context -Arguments @('db', 'query', 'SELECT 1;', '--skip-column-names') -AllowFailure
    if ($probe.ExitCode -eq 0) { return $false }

    $name = Get-EnvValue $Environment @('WORDPRESS_DB_NAME', 'MARIADB_DATABASE', 'MYSQL_DATABASE', 'DB_NAME')
    $user = Get-EnvValue $Environment @('WORDPRESS_DB_USER', 'MARIADB_USER', 'MYSQL_USER', 'DB_USER')
    $password = Get-EnvValue $Environment @('WORDPRESS_DB_PASSWORD', 'MARIADB_PASSWORD', 'MYSQL_PASSWORD', 'DB_PASSWORD')
    $rootPassword = Get-EnvValue $Environment @('MARIADB_ROOT_PASSWORD', 'MYSQL_ROOT_PASSWORD')
    if ($name -notmatch '^[A-Za-z0-9_]+$' -or $user -notmatch '^[A-Za-z0-9_.-]+$' -or
        -not $password -or -not $rootPassword) {
        throw 'WP-CLI no conecta y .env no contiene credenciales válidas para reparar permisos.'
    }

    $safeUser = $user.Replace("'", "''")
    $safePassword = $password.Replace("'", "''")
    $sql = "CREATE DATABASE IF NOT EXISTS ``$name``; CREATE USER IF NOT EXISTS '$safeUser'@'%' IDENTIFIED BY '$safePassword'; ALTER USER '$safeUser'@'%' IDENTIFIED BY '$safePassword'; GRANT ALL PRIVILEGES ON ``$name``.* TO '$safeUser'@'%'; FLUSH PRIVILEGES;"
    Invoke-Compose -Context $Context -Arguments @(
        'exec', '-T', '-e', "MYSQL_PWD=$rootPassword", 'db', 'mariadb', '-uroot', '-e', $sql
    )
    $check = Invoke-WpCli -Context $Context -Arguments @('db', 'query', 'SELECT 1;', '--skip-column-names') -AllowFailure
    if ($check.ExitCode -ne 0) { throw "No se reparó la conexión WP-CLI:`n$($check.Output)" }
    $true
}

function Import-WordPressDatabaseIfEmpty {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][hashtable]$Environment,
        [Parameter(Mandatory)][string]$WorkRoot,
        [string]$SqlPath = ''
    )

    $tables = Invoke-WpCli -Context $Context -Arguments @('db', 'tables', '--all-tables-with-prefix') -AllowFailure
    if ($tables.ExitCode -eq 0 -and $tables.Output.Trim()) { return $false }

    if (-not $SqlPath) {
        $candidates = @(Get-ChildItem -LiteralPath $WorkRoot -File -Recurse -Filter '*.sql' -ErrorAction SilentlyContinue)
        if ($candidates.Count -ne 1) {
            throw "La base está vacía y se encontraron $($candidates.Count) SQL. Use -SqlPath para seleccionar uno."
        }
        $SqlPath = $candidates[0].FullName
    }
    if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) { throw "No existe el SQL: $SqlPath" }

    $name = Get-EnvValue $Environment @('WORDPRESS_DB_NAME', 'MARIADB_DATABASE', 'MYSQL_DATABASE', 'DB_NAME')
    $user = Get-EnvValue $Environment @('WORDPRESS_DB_USER', 'MARIADB_USER', 'MYSQL_USER', 'DB_USER')
    $password = Get-EnvValue $Environment @('WORDPRESS_DB_PASSWORD', 'MARIADB_PASSWORD', 'MYSQL_PASSWORD', 'DB_PASSWORD')
    if ($name -notmatch '^[A-Za-z0-9_]+$' -or $user -notmatch '^[A-Za-z0-9_.-]+$' -or -not $password) {
        throw 'Faltan datos de base válidos en .env para importar el SQL.'
    }

    $containerId = (Invoke-Compose -Context $Context -Arguments @('ps', '-q', 'db') -Capture).Output.Trim()
    if (-not $containerId) { throw 'No se resolvió el contenedor MariaDB.' }
    $temporary = '/tmp/shekinah-reference-import.sql'
    Invoke-Checked -Command 'docker' -Arguments @('cp', $SqlPath, "$containerId`:$temporary")
    try {
        Invoke-Compose -Context $Context -Arguments @(
            'exec', '-T', '-e', "MYSQL_PWD=$password", 'db', 'sh', '-lc',
            "mariadb -u'$user' '$name' < '$temporary'"
        )
    }
    finally {
        Invoke-Compose -Context $Context -Arguments @('exec', '-T', 'db', 'rm', '-f', $temporary) -Capture -AllowFailure | Out-Null
    }
    $after = Invoke-WpCli -Context $Context -Arguments @('db', 'tables', '--all-tables-with-prefix') -AllowFailure
    if ($after.ExitCode -ne 0 -or -not $after.Output.Trim()) {
        throw 'El SQL se importó, pero WordPress no detecta tablas.'
    }
    $true
}

function Wait-Http {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Uri, [int]$TimeoutSeconds = 180)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $last = ''
    do {
        try {
            $response = Invoke-WebRequest -Uri $Uri -MaximumRedirection 10 -TimeoutSec 20 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return $response }
            $last = "HTTP $($response.StatusCode)"
        }
        catch { $last = $_.Exception.Message }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "No respondió $Uri. Último error: $last"
}

function Export-WpJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Destination,
        [switch]$Optional
    )

    $result = Invoke-WpCli -Context $Context -Arguments $Arguments -AllowFailure:$Optional
    if ($result.ExitCode -ne 0) {
        Set-Content -LiteralPath $Destination -Value "[]`n" -Encoding utf8NoBOM
        return @()
    }
    $text = if ($result.Output.Trim()) { $result.Output.Trim() } else { '[]' }
    try { $parsed = $text | ConvertFrom-Json }
    catch { throw "WP-CLI no devolvió JSON válido para $($Arguments -join ' '):`n$text" }
    Set-Content -LiteralPath $Destination -Value ($text + "`n") -Encoding utf8NoBOM
    $parsed
}

Export-ModuleMember -Function *
