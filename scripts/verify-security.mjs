import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const publicHeadersPath = join(projectRoot, 'public', '_headers');
const distRoot = join(projectRoot, 'dist');
const catalogAssetManifestPath = join(projectRoot, 'catalog', 'catalog-assets.json');

const expectedHeaders = new Map([
  [
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'self'; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'none'",
  ],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  [
    'Permissions-Policy',
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()',
  ],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
  ['X-XSS-Protection', '0'],
]);

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]);

function fail(message) {
  throw new Error(message);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function walkFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function parseHeaders(content) {
  const headers = new Map();

  for (const line of content.split(/\r?\n/u)) {
    if (line.trim().length === 0 || line.startsWith('#') || line.trim() === '/*') {
      continue;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      fail(`Línea inválida en public/_headers: ${line}`);
    }

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (headers.has(name)) {
      fail(`Encabezado duplicado en public/_headers: ${name}`);
    }

    headers.set(name, value);
  }

  return headers;
}

function verifyHeadersFile(path) {
  if (!existsSync(path)) {
    fail(`No existe el archivo de encabezados: ${relative(projectRoot, path)}`);
  }

  const content = readText(path);

  if (content.includes("'unsafe-inline'") || content.includes("'unsafe-eval'")) {
    fail('La CSP contiene una directiva insegura.');
  }

  const actualHeaders = parseHeaders(content);

  if (actualHeaders.size !== expectedHeaders.size) {
    fail('La cantidad de encabezados de seguridad no coincide con la esperada.');
  }

  for (const [name, expectedValue] of expectedHeaders) {
    if (actualHeaders.get(name) !== expectedValue) {
      fail(`El encabezado ${name} no coincide con el valor esperado.`);
    }
  }
}

function verifyProductionSource() {
  const productionFiles = [
    join(projectRoot, 'index.html'),
    ...walkFiles(join(projectRoot, 'src')),
    ...walkFiles(join(projectRoot, 'public')),
  ].filter(
    (path) =>
      textExtensions.has(extname(path)) &&
      !path.includes(`${join('src', 'generated-public')}${path.includes('\\') ? '\\' : '/'}`),
  );

  const forbiddenPatterns = [
    { name: 'URL HTTP o HTTPS', pattern: /https?:\/\//iu },
    { name: 'iframe', pattern: /<iframe\b/iu },
    { name: 'fetch', pattern: /\bfetch\s*\(/u },
    { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/u },
    { name: 'WebSocket', pattern: /\bWebSocket\s*\(/u },
    { name: 'EventSource', pattern: /\bEventSource\s*\(/u },
    { name: 'sendBeacon', pattern: /\bsendBeacon\s*\(/u },
    {
      name: 'tracker conocido',
      pattern:
        /google-analytics|googletagmanager|cloudflareinsights|hotjar|facebook\.net|segment\.com/iu,
    },
    { name: 'Hostinger API', pattern: /api-ecommerce\.hostinger\.com/iu },
    { name: 'CDN original', pattern: /cdn\.zyrosite\.com/iu },
    { name: 'ID interno de producto', pattern: /\bprod_[a-z0-9]+\b/iu },
    { name: 'ID interno de variante', pattern: /\bvariant_[a-z0-9]+\b/iu },
    { name: 'ID interno de categoría', pattern: /\bpcol_[a-z0-9]+\b/iu },
    { name: 'ID interno de tienda', pattern: /\bstore_[a-z0-9]+\b/iu },
    { name: 'URL original', pattern: /\boriginalUrl\b/iu },
    { name: 'HTML histórico', pattern: /\bdescriptionHtml\b/iu },
  ];

  for (const path of productionFiles) {
    const content = readText(path);

    for (const forbiddenPattern of forbiddenPatterns) {
      if (forbiddenPattern.pattern.test(content)) {
        fail(
          `${forbiddenPattern.name} detectado en ${relative(projectRoot, path)}.`,
        );
      }
    }
  }
}

function verifyTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    fail(`No se pudo ejecutar git ls-files: ${result.stderr}`);
  }

  const trackedFiles = result.stdout.split('\0').filter(Boolean);
  const environmentFiles = trackedFiles.filter((path) => {
    const name = path.split('/').at(-1) ?? '';

    return /^\.env(?:\.|$)/u.test(name) && name !== '.env.example';
  });

  if (environmentFiles.length > 0) {
    fail(`Hay archivos de entorno rastreados: ${environmentFiles.join(', ')}`);
  }

  const assetManifest = JSON.parse(readText(catalogAssetManifestPath));
  const expectedImageFiles = [
    'public/assets/logo-shekinah.png',
    ...assetManifest.images.map(({ path }) => `public${path}`),
  ].sort();
  const imageFiles = walkFiles(join(projectRoot, 'public'))
    .map((path) => relative(projectRoot, path).replaceAll('\\', '/'))
    .filter((path) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu.test(path))
    .sort();

  if (JSON.stringify(imageFiles) !== JSON.stringify(expectedImageFiles)) {
    fail(`Los activos visuales no coinciden con el manifiesto: ${imageFiles.join(', ')}`);
  }

  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bAIza[0-9A-Za-z_-]{20,}\b/u,
    /\bsk-[A-Za-z0-9]{20,}\b/u,
    /\bCLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)\s*[:=]\s*['"][^'"]+['"]/u,
  ];

  for (const trackedFile of trackedFiles) {
    const path = join(projectRoot, trackedFile);

    if (!existsSync(path) || statSync(path).size > 2_000_000) {
      continue;
    }

    const extension = extname(path).toLowerCase();

    if (
      extension !== '' &&
      !textExtensions.has(extension) &&
      !new Set(['.md', '.txt', '.yml', '.yaml']).has(extension)
    ) {
      continue;
    }

    const content = readText(path);

    if (secretPatterns.some((pattern) => pattern.test(content))) {
      fail(`Posible secreto detectado en ${trackedFile}.`);
    }
  }
}

function verifyStaticFallback() {
  const forbiddenPaths = [
    join(projectRoot, 'public', '404.html'),
    join(projectRoot, 'public', '_redirects'),
    join(distRoot, '404.html'),
    join(distRoot, '_redirects'),
  ];

  for (const path of forbiddenPaths) {
    if (existsSync(path)) {
      fail(
        `El fallback SPA nativo requiere que no exista ${relative(projectRoot, path)}.`,
      );
    }
  }
}

function verifyDist() {
  if (!existsSync(distRoot)) {
    fail('No existe dist. Ejecutá el build antes de verificar seguridad.');
  }

  const distHeadersPath = join(distRoot, '_headers');
  verifyHeadersFile(distHeadersPath);

  if (readText(distHeadersPath) !== readText(publicHeadersPath)) {
    fail('dist/_headers no es idéntico a public/_headers.');
  }

  const distFiles = walkFiles(distRoot);
  const sourceMaps = distFiles.filter((path) => extname(path) === '.map');

  if (sourceMaps.length > 0) {
    fail(
      `Se encontraron source maps en dist: ${sourceMaps
        .map((path) => relative(projectRoot, path))
        .join(', ')}`,
    );
  }

  const indexPath = join(distRoot, 'index.html');
  const indexContent = readText(indexPath);
  if (indexContent.includes('/src/main.tsx')) {
    fail('dist/index.html todavía referencia /src/main.tsx.');
  }
  const resourceReferences = [
    ...indexContent.matchAll(
      /<(?:img|link|script)\b[^>]*(?:href|src)=["']([^"']+)["']/giu,
    ),
  ].map((match) => match[1]);

  for (const reference of resourceReferences) {
    if (
      reference === undefined ||
      /^(?:https?:)?\/\//iu.test(reference) ||
      /^data:/iu.test(reference)
    ) {
      fail(`Referencia externa o embebida detectada en dist/index.html: ${reference}`);
    }
  }

  const allowedUrlPatterns = [
    /^http:\/\/www\.w3\.org\//u,
    /^https:\/\/react\.dev\/errors\//u,
  ];

  const forbiddenDistPatterns = [
    /api-ecommerce\.hostinger\.com/iu,
    /cdn\.zyrosite\.com/iu,
    /\b(?:prod|variant|pcol|store)_[a-z0-9]+\b/iu,
    /\boriginalUrl\b/iu,
    /\bdescriptionHtml\b/iu,
    /\bXMLHttpRequest\b/u,
    /\bWebSocket\s*\(/u,
    /\bEventSource\s*\(/u,
  ];

  for (const path of distFiles.filter((file) =>
    textExtensions.has(extname(file)),
  )) {
    const content = readText(path);
    if (forbiddenDistPatterns.some((pattern) => pattern.test(content))) {
      fail(`Contenido interno o conexión prohibida en ${relative(projectRoot, path)}.`);
    }
    const urls = content.match(/https?:\/\/[^\s"'`<>\\)]+/gu) ?? [];

    for (const url of urls) {
      if (!allowedUrlPatterns.some((pattern) => pattern.test(url))) {
        fail(
          `URL externa inesperada en ${relative(projectRoot, path)}: ${url}`,
        );
      }
    }
  }

  const catalogImages = distFiles.filter((file) =>
    relative(distRoot, file).replaceAll('\\', '/').startsWith('images/original/catalog/'),
  );
  if (catalogImages.length !== 484) {
    fail(`dist debe contener 484 imágenes de catálogo y contiene ${catalogImages.length}.`);
  }
}

verifyHeadersFile(publicHeadersPath);
verifyProductionSource();
verifyTrackedFiles();
verifyStaticFallback();
verifyDist();

console.log(
  'Seguridad estática verificada: rutas SPA, encabezados, CSP, recursos, secretos y dist.',
);
