const INSERT_PREFIX = 'INSERT INTO `';

function findStatementEnd(source, start) {
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === "'") {
        inString = false;
      }
      continue;
    }

    if (character === "'") {
      inString = true;
    } else if (character === ';') {
      return index;
    }
  }

  throw new Error('Sentencia INSERT sin punto y coma de cierre.');
}

function splitTopLevelTuples(source) {
  const tuples = [];
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /[\s,]/u.test(source[index])) index += 1;
    if (index >= source.length) break;
    if (source[index] !== '(') {
      throw new Error(`Se esperaba "(" en la posición ${index}.`);
    }

    const start = ++index;
    let depth = 1;
    let inString = false;
    let escaped = false;

    while (index < source.length && depth > 0) {
      const character = source[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === "'") inString = false;
      } else if (character === "'") {
        inString = true;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
      }

      index += 1;
    }

    if (depth !== 0) throw new Error('Tupla SQL sin cierre.');
    tuples.push(source.slice(start, index - 1));
  }

  return tuples;
}

function splitFields(tuple) {
  const fields = [];
  let buffer = '';
  let inString = false;
  let escaped = false;

  for (const character of tuple) {
    if (inString) {
      buffer += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === "'") inString = false;
    } else if (character === "'") {
      inString = true;
      buffer += character;
    } else if (character === ',') {
      fields.push(buffer.trim());
      buffer = '';
    } else {
      buffer += character;
    }
  }

  fields.push(buffer.trim());
  return fields;
}

export function decodeMysqlValue(rawValue) {
  const value = rawValue.trim();
  if (value.toUpperCase() === 'NULL') return null;

  if (value.startsWith("'") && value.endsWith("'")) {
    const source = value.slice(1, -1);
    const escapes = new Map([
      ['0', '\0'],
      ['b', '\b'],
      ['n', '\n'],
      ['r', '\r'],
      ['t', '\t'],
      ['Z', '\u001a'],
      ["'", "'"],
      ['"', '"'],
      ['\\', '\\'],
      ['%', '%'],
      ['_', '_'],
    ]);

    let result = '';
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === '\\' && index + 1 < source.length) {
        const next = source[index + 1];
        result += escapes.get(next) ?? next;
        index += 1;
      } else {
        result += source[index];
      }
    }
    return result;
  }

  if (/^-?\d+$/u.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/u.test(value)) return Number.parseFloat(value);
  return value;
}

export function detectTablePrefix(sql) {
  const candidates = new Map();
  const matcher = /CREATE TABLE `([^`]+)`/gu;
  const coreNames = [
    'posts',
    'postmeta',
    'options',
    'users',
    'usermeta',
    'terms',
    'term_taxonomy',
    'term_relationships',
    'comments',
    'commentmeta',
  ];

  for (const match of sql.matchAll(matcher)) {
    const table = match[1];
    const suffix = coreNames.find((name) => table.endsWith(name));
    if (!suffix) continue;
    const prefix = table.slice(0, -suffix.length);
    candidates.set(prefix, (candidates.get(prefix) ?? 0) + 1);
  }

  const sorted = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) throw new Error('No se pudo identificar el prefijo de tablas.');
  return sorted[0][0];
}

export function listCreatedTables(sql) {
  return [...sql.matchAll(/CREATE TABLE `([^`]+)`/gu)].map((match) => match[1]);
}

export function parseInsertRows(sql, tableName) {
  const rows = [];
  let cursor = 0;
  const marker = `${INSERT_PREFIX}${tableName}\``;

  while (true) {
    const statementStart = sql.indexOf(marker, cursor);
    if (statementStart === -1) break;

    const columnsStart = sql.indexOf('(', statementStart + marker.length);
    const columnsEnd = sql.indexOf(')', columnsStart + 1);
    if (columnsStart === -1 || columnsEnd === -1) {
      throw new Error(`Columnas inválidas en INSERT de ${tableName}.`);
    }

    const valuesKeyword = sql.indexOf('VALUES', columnsEnd);
    if (valuesKeyword === -1) throw new Error(`VALUES ausente en INSERT de ${tableName}.`);

    const statementEnd = findStatementEnd(sql, valuesKeyword + 6);
    const columns = sql
      .slice(columnsStart + 1, columnsEnd)
      .split(',')
      .map((column) => column.trim().replaceAll('`', ''));

    const tupleSource = sql.slice(valuesKeyword + 6, statementEnd);
    for (const tuple of splitTopLevelTuples(tupleSource)) {
      const values = splitFields(tuple).map(decodeMysqlValue);
      if (values.length !== columns.length) {
        throw new Error(
          `Cantidad de valores (${values.length}) distinta de columnas (${columns.length}) en ${tableName}.`,
        );
      }
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    }

    cursor = statementEnd + 1;
  }

  return rows;
}

export function extractPublicWordPressData(sql) {
  const prefix = detectTablePrefix(sql);
  const posts = parseInsertRows(sql, `${prefix}posts`);
  const postmeta = parseInsertRows(sql, `${prefix}postmeta`);
  const options = parseInsertRows(sql, `${prefix}options`);
  const terms = parseInsertRows(sql, `${prefix}terms`);
  const taxonomies = parseInsertRows(sql, `${prefix}term_taxonomy`);
  const relationships = parseInsertRows(sql, `${prefix}term_relationships`);

  const safeOptionNames = new Set([
    'siteurl',
    'home',
    'blogname',
    'blogdescription',
    'WPLANG',
    'show_on_front',
    'page_on_front',
    'page_for_posts',
    'template',
    'stylesheet',
    'permalink_structure',
    'site_icon',
    'wp_page_for_privacy_policy',
  ]);

  const safeOptions = Object.fromEntries(
    options
      .filter((option) => safeOptionNames.has(String(option.option_name)))
      .map((option) => [option.option_name, option.option_value]),
  );

  const safePostmetaKeys = new Set([
    '_wp_page_template',
    '_thumbnail_id',
    '_wp_attached_file',
    '_wp_attachment_metadata',
    '_wp_attachment_image_alt',
  ]);

  return {
    prefix,
    tableCount: listCreatedTables(sql).length,
    options: safeOptions,
    posts: posts.map((post) => ({
      ID: post.ID,
      post_author: post.post_author,
      post_date: post.post_date,
      post_modified: post.post_modified,
      post_content: post.post_content,
      post_title: post.post_title,
      post_excerpt: post.post_excerpt,
      post_status: post.post_status,
      post_name: post.post_name,
      post_parent: post.post_parent,
      guid: post.guid,
      menu_order: post.menu_order,
      post_type: post.post_type,
      post_mime_type: post.post_mime_type,
    })),
    postmeta: postmeta.filter((meta) => safePostmetaKeys.has(String(meta.meta_key))),
    terms,
    taxonomies,
    relationships,
  };
}
