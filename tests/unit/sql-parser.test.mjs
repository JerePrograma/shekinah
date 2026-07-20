import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeMysqlValue,
  detectTablePrefix,
  parseInsertRows,
} from '../../scripts/migration/lib/sql-parser.mjs';

test('detecta el prefijo de tablas sin asumir wp_', () => {
  const sql = [
    'CREATE TABLE `abc_posts` (`ID` bigint);',
    'CREATE TABLE `abc_options` (`option_id` bigint);',
    'CREATE TABLE `abc_postmeta` (`meta_id` bigint);',
  ].join('\n');
  assert.equal(detectTablePrefix(sql), 'abc_');
});

test('analiza INSERT con comas, saltos y escapes dentro de cadenas', () => {
  const sql =
    'INSERT INTO `wp_posts` (`ID`, `post_title`, `post_content`) VALUES\n' +
    "(1, 'Título, uno', 'Línea 1\\nLínea 2'),\n" +
    "(2, 'It\\'s safe', 'a:1:{s:3:\"key\";s:5:\"value\";}');\n";
  const rows = parseInsertRows(sql, 'wp_posts');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].post_title, 'Título, uno');
  assert.equal(rows[0].post_content, 'Línea 1\nLínea 2');
  assert.equal(rows[1].post_title, "It's safe");
  assert.equal(rows[1].post_content, 'a:1:{s:3:"key";s:5:"value";}');
});

test('decodifica tipos escalares sin ejecutar SQL', () => {
  assert.equal(decodeMysqlValue('NULL'), null);
  assert.equal(decodeMysqlValue('42'), 42);
  assert.equal(decodeMysqlValue("'texto'"), 'texto');
});
