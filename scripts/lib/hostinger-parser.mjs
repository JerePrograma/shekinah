import { createHash } from 'node:crypto';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableValue(value) {
  if (value instanceof Date) return { $type: 'Date', value: value.toISOString() };
  if (value instanceof RegExp) return { $type: 'RegExp', source: value.source, flags: value.flags };
  if (value instanceof URL) return { $type: 'URL', value: value.href };
  if (value instanceof Map) {
    return {
      $type: 'Map',
      value: [...value.entries()]
        .map(([key, item]) => [stableValue(key), stableValue(item)])
        .sort((left, right) => JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0]))),
    };
  }
  if (value instanceof Set) {
    return {
      $type: 'Set',
      value: [...value]
        .map(stableValue)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };
  }
  if (typeof value === 'bigint') return { $type: 'BigInt', value: value.toString() };
  if (ArrayBuffer.isView(value)) return { $type: value.constructor.name, value: [...value] };
  if (value === Infinity || value === -Infinity) return { $type: 'Infinity', sign: value < 0 ? -1 : 1 };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: '\u00a0', quot: '"' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/giu, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith('#')) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[key] ?? match;
  });
}

export function scanStartTags(html, tagName) {
  const tags = [];
  const errors = [];
  const lower = html.toLowerCase();
  const needle = `<${tagName.toLowerCase()}`;
  let offset = 0;
  while ((offset = lower.indexOf(needle, offset)) >= 0) {
    const boundary = lower[offset + needle.length];
    if (boundary && !/[\s/>]/u.test(boundary)) {
      offset += needle.length;
      continue;
    }
    let quote = null;
    let cursor = offset + needle.length;
    for (; cursor < html.length; cursor += 1) {
      const character = html[cursor];
      if (quote && character === quote) quote = null;
      else if (!quote && (character === '"' || character === "'")) quote = character;
      else if (!quote && character === '>') break;
    }
    if (cursor >= html.length) {
      errors.push({ offset, code: 'TRUNCATED_TAG', message: `Etiqueta <${tagName}> truncada.` });
      break;
    }
    tags.push({ offset, raw: html.slice(offset, cursor + 1) });
    offset = cursor + 1;
  }
  return { tags, errors };
}

export function parseAttributes(tag) {
  const result = {};
  const body = tag.replace(/^<[^\s>]+/u, '').replace(/\/?\s*>$/u, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
  for (const match of body.matchAll(pattern)) {
    result[match[1]] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function unknownAstroType(tag, payload) {
  return { $type: 'UnknownAstroType', tag, payload };
}

export function decodeAstro(value) {
  const seen = new WeakMap();
  const visit = (node) => {
    if (!Array.isArray(node)) return node;
    if (seen.has(node)) return seen.get(node);
    const [tag, payload] = node;
    if (!Number.isInteger(tag)) {
      const result = [];
      seen.set(node, result);
      for (const item of node) result.push(visit(item));
      return result;
    }
    if (tag === 0) {
      const result = {};
      seen.set(node, result);
      for (const [key, item] of Object.entries(payload ?? {})) result[key] = visit(item);
      return result;
    }
    if (tag === 1) {
      const result = [];
      seen.set(node, result);
      for (const item of payload ?? []) result.push(visit(item));
      return result;
    }
    if (tag === 2) return new RegExp(payload?.[0] ?? '', payload?.[1] ?? '');
    if (tag === 3) return new Date(payload);
    if (tag === 4) return new Map((payload ?? []).map(([key, item]) => [visit(key), visit(item)]));
    if (tag === 5) return new Set((payload ?? []).map(visit));
    if (tag === 6) return BigInt(payload);
    if (tag === 7) return new URL(payload);
    if (tag === 8) return Uint8Array.from(payload ?? []);
    if (tag === 9) return Uint16Array.from(payload ?? []);
    if (tag === 10) return Uint32Array.from(payload ?? []);
    if (tag === 11) return Number(payload) < 0 ? -Infinity : Infinity;
    return unknownAstroType(tag, visit(payload));
  };
  return visit(value);
}

export function extractAstroIslands(html, sourceFile = '<memory>') {
  const scanned = scanStartTags(html, 'astro-island');
  const islands = [];
  const errors = scanned.errors.map((error) => ({ ...error, sourceFile }));
  for (const [index, item] of scanned.tags.entries()) {
    const attributes = parseAttributes(item.raw);
    if (!attributes.props) {
      errors.push({
        sourceFile,
        index,
        offset: item.offset,
        code: 'MISSING_PROPS',
        message: 'astro-island no contiene props.',
      });
      continue;
    }
    try {
      islands.push({
        index,
        offset: item.offset,
        componentUrl: attributes['component-url'] ?? null,
        rendererUrl: attributes['renderer-url'] ?? null,
        value: decodeAstro(JSON.parse(attributes.props)),
      });
    } catch (error) {
      errors.push({
        sourceFile,
        index,
        offset: item.offset,
        code: 'INVALID_PROPS_JSON',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { islands, errors };
}
