import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeRecoveredHtml } from '../../scripts/migration/lib/sanitize.mjs';
import { isUnsafeArchivePath } from '../../scripts/migration/lib/zip-inspector.mjs';

test('elimina scripts, eventos y comentarios de bloques', () => {
  const source =
    '<!-- wp:paragraph --><p onclick="alert(1)">Hola</p><script>bad()</script><!-- /wp:paragraph -->';
  const result = sanitizeRecoveredHtml(source);
  assert.equal(result, '<p>Hola</p>');
});

test('reescribe medios del dominio anterior como rutas locales', () => {
  const source =
    '<img src="https://chocolate-chimpanzee-908881.hostingersite.com/wp-content/uploads/2026/07/a.png">';
  assert.equal(sanitizeRecoveredHtml(source), '<img src="/images/a.png">');
});

test('detecta path traversal y rutas absolutas en archivos comprimidos', () => {
  assert.equal(isUnsafeArchivePath('../secret.txt'), true);
  assert.equal(isUnsafeArchivePath('/etc/passwd'), true);
  assert.equal(isUnsafeArchivePath('C:/Windows/file'), true);
  assert.equal(isUnsafeArchivePath('wp-content/uploads/image.png'), false);
});
