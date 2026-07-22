import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    parsed[key] = next && !next.startsWith('--') ? next : 'true';
    if (parsed[key] !== 'true') index += 1;
  }
  return parsed;
}

export async function loadContract(contractPath) {
  return JSON.parse(await readFile(path.resolve(contractPath), 'utf8'));
}

function decodeEntities(value) {
  const named = new Map([
    ['amp', '&'],
    ['lt', '<'],
    ['gt', '>'],
    ['quot', '"'],
    ['apos', "'"],
    ['nbsp', ' '],
  ]);
  return value
    .replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/giu, (_, hexadecimal) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16)),
    )
    .replace(/&([a-z]+);/giu, (full, name) => named.get(name.toLowerCase()) ?? full);
}

export function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<(?:script|style|noscript|svg)\b[\s\S]*?<\/(?:script|style|noscript|svg)>/giu, ' ')
      .replace(/<!--([\s\S]*?)-->/gu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeRoute(value, baseUrl = 'https://example.invalid/') {
  if (!value || /^(?:#|mailto:|tel:|javascript:)/iu.test(value)) return null;
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURI(url.pathname);
  } catch {
    pathname = url.pathname;
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (pathname !== '/' && !path.posix.extname(pathname) && !pathname.endsWith('/')) pathname += '/';
  return pathname;
}

export function extractNavigationPaths(html, baseUrl) {
  const paths = new Set();
  const navigationFragments = [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/giu)].map(
    (match) => match[0],
  );
  for (const fragment of navigationFragments) {
    for (const match of fragment.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)) {
      const route = normalizeRoute(match[1], baseUrl);
      if (route) paths.add(route);
    }
  }
  return paths;
}

export function validatePublicSettings(settings, contract) {
  const errors = [];
  if (settings.blogname !== contract.displayName) {
    errors.push(`blogname debe ser ${contract.displayName}; recibido: ${settings.blogname}`);
  }
  if (settings.show_on_front !== 'page') {
    errors.push(`show_on_front debe ser page; recibido: ${settings.show_on_front}`);
  }
  if (!Number.isInteger(Number(settings.page_on_front)) || Number(settings.page_on_front) < 1) {
    errors.push(`page_on_front debe ser un ID positivo; recibido: ${settings.page_on_front}`);
  }
  if (!Number.isInteger(Number(settings.page_for_posts)) || Number(settings.page_for_posts) < 1) {
    errors.push(`page_for_posts debe ser un ID positivo; recibido: ${settings.page_for_posts}`);
  }
  return errors;
}

export function validatePublishedContent(items, contract) {
  const errors = [];
  const publishedSlugs = new Set(items.map((item) => String(item.post_name ?? '')));
  if (
    !items.some((item) => item.post_type === 'page' && item.post_name === contract.frontPageSlug)
  ) {
    errors.push(`falta la página publicada ${contract.frontPageSlug}`);
  }
  if (
    !items.some((item) => item.post_type === 'page' && item.post_name === contract.postsPageSlug)
  ) {
    errors.push(`falta la página publicada ${contract.postsPageSlug}`);
  }
  for (const slug of contract.forbiddenPublishedSlugs ?? []) {
    if (publishedSlugs.has(slug)) errors.push(`el contenido ${slug} no debe permanecer publicado`);
  }
  return errors;
}

export function validateHomeHtml(html, contract, baseUrl) {
  const errors = [];
  const text = visibleText(html);
  const lowerText = text.toLocaleLowerCase('es');
  for (const required of contract.requiredHomeText ?? []) {
    if (!text.includes(required)) errors.push(`la portada no contiene: ${required}`);
  }
  for (const forbidden of contract.forbiddenVisibleText ?? []) {
    if (lowerText.includes(forbidden.toLocaleLowerCase('es'))) {
      errors.push(`la portada contiene texto prohibido: ${forbidden}`);
    }
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '';
  if (
    !visibleText(title)
      .toLocaleLowerCase('es')
      .includes(contract.displayName.toLocaleLowerCase('es'))
  ) {
    errors.push(`el title no contiene ${contract.displayName}`);
  }
  const navigation = extractNavigationPaths(html, baseUrl);
  for (const requiredRoute of contract.requiredNavigationPaths ?? []) {
    const normalized = normalizeRoute(requiredRoute, baseUrl);
    if (!navigation.has(normalized)) errors.push(`la navegación no contiene ${normalized}`);
  }
  const forms = (html.match(/<form\b/giu) ?? []).length;
  if (forms > Number(contract.maxStaticForms ?? 0)) {
    errors.push(
      `la portada contiene ${forms} formulario(s); máximo permitido: ${contract.maxStaticForms}`,
    );
  }
  return errors;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

export async function validateSnapshotRoot(snapshotRoot, contract) {
  const root = path.resolve(snapshotRoot);
  const siteRoot = path.join(root, 'site');
  const settings = JSON.parse(
    await readFile(path.join(root, 'data', 'public-settings.json'), 'utf8'),
  );
  const published = JSON.parse(
    await readFile(path.join(root, 'data', 'published-content.json'), 'utf8'),
  );
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const homeHtml = await readFile(path.join(siteRoot, 'index.html'), 'utf8');
  const errors = [
    ...validatePublicSettings(settings, contract),
    ...validatePublishedContent(published, contract),
    ...validateHomeHtml(homeHtml, contract, manifest.productionOrigin),
  ];

  if (Number(manifest.totals?.forms ?? 0) > Number(contract.maxStaticForms ?? 0)) {
    errors.push(
      `el manifiesto contiene ${manifest.totals?.forms ?? 0} formulario(s); máximo permitido: ${contract.maxStaticForms}`,
    );
  }

  const forbidden = (contract.forbiddenVisibleText ?? []).map((value) => [
    value,
    value.toLocaleLowerCase('es'),
  ]);
  for (const file of await walk(siteRoot)) {
    if (path.extname(file).toLowerCase() !== '.html') continue;
    const text = visibleText(await readFile(file, 'utf8')).toLocaleLowerCase('es');
    for (const [original, lowered] of forbidden) {
      if (text.includes(lowered)) {
        errors.push(
          `${path.relative(siteRoot, file).replaceAll(path.sep, '/')}: texto prohibido ${original}`,
        );
      }
    }
  }

  return {
    errors,
    settings,
    manifest,
    published,
  };
}
