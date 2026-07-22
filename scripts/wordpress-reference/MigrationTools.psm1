Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Format-NativeCommand {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string[]]$RedactValues = @()
    )

    $rendered = @($Command) + @($Arguments | ForEach-Object {
        $value = [string]$_
        foreach ($secret in $RedactValues) {
            if ($secret) { $value = $value.Replace($secret, '[redacted]') }
        }
        if ($value -match '[\s"'']') { '"' + $value.Replace('"', '\"') + '"' } else { $value }
    })
    $rendered -join ' '
}

function Protect-NativeText {
    param([string]$Text, [string[]]$RedactValues = @())

    $protected = $Text
    foreach ($secret in $RedactValues) {
        if ($secret) { $protected = $protected.Replace($secret, '[redacted]') }
    }
    $protected
}

function Invoke-NativeCapture {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$WorkingDirectory = '',
        [switch]$AllowFailure,
        [string[]]$RedactValues = @()
    )

    $displayCommand = Format-NativeCommand -Command $Command -Arguments $Arguments -RedactValues $RedactValues
    Write-Host "`$ $displayCommand" -ForegroundColor DarkGray
    $stdoutPath = [IO.Path]::GetTempFileName()
    $stderrPath = [IO.Path]::GetTempFileName()
    $previous = Get-Location
    $exitCode = 1
    try {
        if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
        try {
            & $Command @Arguments 1> $stdoutPath 2> $stderrPath
            $exitCode = $LASTEXITCODE
        }
        catch {
            $_.Exception.Message | Set-Content -LiteralPath $stderrPath -Encoding utf8NoBOM
        }
    }
    finally {
        Set-Location -LiteralPath $previous
    }

    try {
        $stdout = if ((Get-Item -LiteralPath $stdoutPath).Length) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
        $stderr = if ((Get-Item -LiteralPath $stderrPath).Length) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    }
    finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
    $stdout = (Protect-NativeText -Text $stdout -RedactValues $RedactValues).TrimEnd("`r", "`n")
    $stderr = (Protect-NativeText -Text $stderr -RedactValues $RedactValues).TrimEnd("`r", "`n")
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $details = @($stdout, $stderr) | Where-Object { $_ }
        $exception = [InvalidOperationException]::new(
            "Falló el comando nativo con código ${exitCode}: $displayCommand$([Environment]::NewLine)$($details -join [Environment]::NewLine)"
        )
        $exception.Data['Command'] = $displayCommand
        $exception.Data['ExitCode'] = $exitCode
        throw $exception
    }
    [pscustomobject]@{
        Command = $displayCommand
        ExitCode = $exitCode
        StdOut = $stdout
        StdErr = $stderr
        Output = (@($stdout, $stderr) | Where-Object { $_ }) -join [Environment]::NewLine
    }
}

function Invoke-NativeCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$WorkingDirectory = '',
        [string[]]$RedactValues = @()
    )

    $result = Invoke-NativeCapture -Command $Command -Arguments $Arguments -WorkingDirectory $WorkingDirectory -RedactValues $RedactValues
    if ($result.StdOut) { Write-Host $result.StdOut }
    if ($result.StdErr) { Write-Host $result.StdErr -ForegroundColor DarkYellow }
    $result
}

function Invoke-Checked {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$WorkingDirectory = '',
        [string[]]$RedactValues = @()
    )

    Invoke-NativeCommand -Command $Command -Arguments $Arguments -WorkingDirectory $WorkingDirectory -RedactValues $RedactValues | Out-Null
}

function Invoke-Captured {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$AllowFailure,
        [string[]]$RedactValues = @()
    )

    Invoke-NativeCapture -Command $Command -Arguments $Arguments -AllowFailure:$AllowFailure -RedactValues $RedactValues
}

function Invoke-Compose {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Capture,
        [switch]$AllowFailure,
        [string[]]$RedactValues = @()
    )

    $all = @('compose', '-p', $Context.ProjectName, '-f', $Context.ComposePath) + $Arguments
    if ($Capture) {
        return Invoke-NativeCapture -Command 'docker' -Arguments $all -AllowFailure:$AllowFailure -RedactValues $RedactValues
    }
    Invoke-NativeCommand -Command 'docker' -Arguments $all -RedactValues $RedactValues | Out-Null
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

function ConvertTo-SnapshotTimestamp {
    [CmdletBinding()]
    param([Parameter(Mandatory)][object]$Value)

    if ($Value -is [DateTimeOffset]) { return $Value }
    if ($Value -is [DateTime]) { return [DateTimeOffset]$Value }
    [DateTimeOffset]::Parse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    )
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
        $node24Directory = Join-Path $env:ProgramFiles 'nodejs'
        $node24 = Join-Path $node24Directory 'node.exe'
        if ((Test-Path -LiteralPath $node24 -PathType Leaf) -and
            (Get-MajorVersion ((& $node24 --version) | Out-String)) -ge 24) {
            $env:Path = $node24Directory + [IO.Path]::PathSeparator + $env:Path
        }
        else {
            $nvmInfo = Get-Command nvm -ErrorAction SilentlyContinue
            $nvmCommand = if ($nvmInfo) { $nvmInfo.Source } else { '' }
            if (-not $nvmCommand -and $env:NVM_HOME) {
                $nvmCandidate = Join-Path $env:NVM_HOME 'nvm.exe'
                if (Test-Path -LiteralPath $nvmCandidate -PathType Leaf) { $nvmCommand = $nvmCandidate }
            }
            if ($nvmCommand) {
                Invoke-Checked -Command $nvmCommand -Arguments @('install', '24')
                Invoke-Checked -Command $nvmCommand -Arguments @('use', '24')
                Update-ProcessPath
            }
            elseif (Get-Command winget -ErrorAction SilentlyContinue) {
                $installed = Invoke-NativeCapture -Command 'winget' -Arguments @(
                    'list', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--source', 'winget'
                ) -AllowFailure
                if ($installed.ExitCode -ne 0) {
                    throw 'Se requiere Node.js 24. winget está disponible, pero el paquete OpenJS.NodeJS.LTS no está instalado; no se hará una instalación global implícita.'
                }
                Invoke-NativeCapture -Command 'winget' -Arguments @(
                    'upgrade', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--source', 'winget',
                    '--silent', '--accept-package-agreements', '--accept-source-agreements'
                ) -AllowFailure | Out-Null
                Update-ProcessPath
                if ((Test-Path -LiteralPath $node24 -PathType Leaf) -and
                    (Get-MajorVersion ((& $node24 --version) | Out-String)) -ge 24) {
                    $env:Path = $node24Directory + [IO.Path]::PathSeparator + $env:Path
                }
            }
            else {
                throw 'Se requiere Node.js 24. No se encontró una instalación existente ni una herramienta segura para activarla.'
            }
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

function Assert-ContainerId {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Value, [string]$Service = 'container')

    if ($Value -notmatch '^[a-f0-9]{12,64}$') {
        throw "Docker devolvió un identificador inválido para ${Service}: '$Value'"
    }
    $Value
}

function Wait-ComposeDatabase {
    [CmdletBinding()]
    param([Parameter(Mandatory)][hashtable]$Context, [int]$TimeoutSeconds = 180)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $last = 'not-created'
    do {
        $id = (Invoke-Compose -Context $Context -Arguments @('ps', '-q', 'db') -Capture).StdOut.Trim()
        if ($id) {
            Assert-ContainerId -Value $id -Service 'db' | Out-Null
            $inspect = Invoke-Captured -Command 'docker' -Arguments @(
                'inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $id
            ) -AllowFailure
            $last = $inspect.StdOut.Trim()
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
    ) -RedactValues @($password, $rootPassword)
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
    if ($tables.ExitCode -eq 0 -and $tables.StdOut.Trim()) { return $false }

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

    $containerId = (Invoke-Compose -Context $Context -Arguments @('ps', '-q', 'db') -Capture).StdOut.Trim()
    if (-not $containerId) { throw 'No se resolvió el contenedor MariaDB.' }
    Assert-ContainerId -Value $containerId -Service 'db' | Out-Null
    $temporary = '/tmp/shekinah-reference-import.sql'
    Invoke-Checked -Command 'docker' -Arguments @('cp', $SqlPath, "$containerId`:$temporary")
    try {
        Invoke-Compose -Context $Context -Arguments @(
            'exec', '-T', '-e', "MYSQL_PWD=$password", 'db', 'sh', '-lc',
            "mariadb -u'$user' '$name' < '$temporary'"
        ) -RedactValues @($password)
    }
    finally {
        Invoke-Compose -Context $Context -Arguments @('exec', '-T', 'db', 'rm', '-f', $temporary) -Capture -AllowFailure | Out-Null
    }
    $after = Invoke-WpCli -Context $Context -Arguments @('db', 'tables', '--all-tables-with-prefix') -AllowFailure
    if ($after.ExitCode -ne 0 -or -not $after.StdOut.Trim()) {
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

function Write-Utf8LfText {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )

    $normalized = $Content.Replace("`r`n", "`n").Replace("`r", "`n").TrimEnd("`n") + "`n"
    [IO.File]::WriteAllText($Path, $normalized, [Text.UTF8Encoding]::new($false))
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
        Write-Utf8LfText -Path $Destination -Content '[]'
        return @()
    }
    $text = if ($result.StdOut.Trim()) { $result.StdOut.Trim() } else { '[]' }
    try { $parsed = $text | ConvertFrom-Json }
    catch { throw "WP-CLI no devolvió JSON válido para $($Arguments -join ' '):`n$text" }
    Write-Utf8LfText -Path $Destination -Content $text
    $parsed
}

function Export-WordPressPublicData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][hashtable]$Context,
        [Parameter(Mandatory)][string]$Destination,
        [Parameter(Mandatory)][string]$SourceUrl,
        [string]$ProductionOrigin = 'https://shekinah-7dl.pages.dev'
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Export-WpJson -Context $Context -Arguments @(
        'plugin', 'list', '--fields=name,status,version,update,update_version,auto_update',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination 'plugins.json') | Out-Null
    Export-WpJson -Context $Context -Arguments @(
        'theme', 'list', '--fields=name,status,version,update,update_version,auto_update',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination 'themes.json') | Out-Null
    Export-WpJson -Context $Context -Arguments @(
        'post', 'list', '--post_type=post,page,wp_navigation,wp_template,wp_template_part',
        '--post_status=publish',
        '--fields=ID,post_type,post_title,post_name,post_date_gmt,post_modified_gmt,post_parent,menu_order,comment_status,ping_status',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination 'published-content.json') | Out-Null
    Export-WpJson -Context $Context -Arguments @(
        'term', 'list', 'category', '--fields=term_id,name,slug,count,parent',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination 'categories.json') -Optional | Out-Null
    Export-WpJson -Context $Context -Arguments @(
        'term', 'list', 'post_tag', '--fields=term_id,name,slug,count',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination 'tags.json') -Optional | Out-Null

    $menus = @(Export-WpJson -Context $Context -Arguments @(
        'menu', 'list', '--fields=term_id,name,slug,count', '--format=json',
        '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination '.menus.tmp.json') -Optional)
    $classicMenus = @(
        foreach ($menu in $menus) {
            $slug = if ($menu.PSObject.Properties.Name -contains 'slug') { [string]$menu.slug } else { '' }
            $items = @()
            if ($slug) {
                $result = Invoke-WpCli -Context $Context -Arguments @(
                    'menu', 'item', 'list', $slug,
                    '--fields=db_id,type,title,url,target,object,object_id,parent,position',
                    '--format=json', '--skip-plugins', '--skip-themes'
                ) -AllowFailure
                if ($result.ExitCode -eq 0 -and $result.StdOut.Trim()) {
                    try { $items = @($result.StdOut | ConvertFrom-Json) }
                    catch { throw "WP-CLI no devolvió items de menú válidos para ${slug}." }
                }
            }
            [ordered]@{ menu = $menu; items = $items }
        }
    )
    $navigation = @(Export-WpJson -Context $Context -Arguments @(
        'post', 'list', '--post_type=wp_navigation', '--post_status=publish',
        '--fields=ID,post_title,post_name,post_date_gmt,post_modified_gmt',
        '--format=json', '--skip-plugins', '--skip-themes'
    ) -Destination (Join-Path $Destination '.navigation.tmp.json') -Optional)
    $navigationJson = [ordered]@{ classicMenus = $classicMenus; navigationPosts = $navigation } |
        ConvertTo-Json -Depth 20
    $navigationJson = $navigationJson.Replace($SourceUrl.TrimEnd('/'), $ProductionOrigin.TrimEnd('/'))
    $navigationJson = $navigationJson.Replace('http://chocolate-chimpanzee-908881.hostingersite.com', $ProductionOrigin.TrimEnd('/'))
    $navigationJson = $navigationJson.Replace('https://chocolate-chimpanzee-908881.hostingersite.com', $ProductionOrigin.TrimEnd('/'))
    Write-Utf8LfText -Path (Join-Path $Destination 'navigation.json') -Content $navigationJson
    Remove-Item -LiteralPath (Join-Path $Destination '.menus.tmp.json'), (Join-Path $Destination '.navigation.tmp.json') -Force

    $publicOptionsPhp = @'
$names = array("blogname", "blogdescription", "permalink_structure", "show_on_front", "page_on_front", "page_for_posts", "timezone_string", "gmt_offset", "date_format", "time_format", "posts_per_page", "default_comment_status", "blog_public", "template", "stylesheet");
$values = array();
foreach ($names as $name) { $values[$name] = get_option($name); }
echo wp_json_encode($values);
'@
    $publicOptionsResult = Invoke-WpCli -Context $Context -Arguments @(
        'eval', $publicOptionsPhp, '--skip-plugins', '--skip-themes'
    )
    try { $publicOptions = $publicOptionsResult.StdOut | ConvertFrom-Json }
    catch { throw 'WP-CLI no devolvió opciones públicas válidas.' }
    $publicOptionsJson = $publicOptions | ConvertTo-Json -Depth 10
    $publicOptionsJson = $publicOptionsJson.Replace($SourceUrl.TrimEnd('/'), $ProductionOrigin.TrimEnd('/'))
    $publicOptionsJson = $publicOptionsJson.Replace('chocolate-chimpanzee-908881.hostingersite.com', ([Uri]$ProductionOrigin).Host)
    Write-Utf8LfText -Path (Join-Path $Destination 'public-settings.json') -Content $publicOptionsJson

    [pscustomobject]@{ Menus = $classicMenus.Count; NavigationPosts = $navigation.Count }
}

Export-ModuleMember -Function *
