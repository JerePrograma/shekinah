import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const endpoint = 'https://shekinah.ar/api/internal/mercadolibre/editorial';
const secret = process.env.SHEKINAH_EDITORIAL_SECRET;
assert(typeof secret === 'string' && secret.length >= 32, 'Falta autenticación editorial.');
const deadline = Date.now() + 45 * 60 * 1000;
let runId = null;
while (Date.now() < deadline) {
  const response = await fetch(endpoint, {method:'POST',redirect:'error',signal:AbortSignal.timeout(110_000),
    headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({runId})});
  assert(response.body !== null, 'Respuesta editorial vacía.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 500_000) { await reader.cancel(); throw Error('Respuesta editorial demasiado grande.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (response.status === 409 && value.error?.code === 'ML_EDITORIAL_BUSY') { await delay(5000); continue; }
  assert(response.ok, `La actualización editorial falló (HTTP ${response.status}).`);
  assert(typeof value.id === 'string' && /^ml_editorial_[a-f0-9-]{36}$/u.test(value.id), 'Ejecución editorial inválida.');
  if (runId !== null) assert.equal(value.id, runId); runId = value.id;
  console.log(JSON.stringify({id:runId,status:value.status,phase:value.phase,items:value.items,contentCompleted:value.contentCompleted,associations:value.associations}));
  if (value.status === 'succeeded') process.exit(0);
  assert.equal(value.status, 'running', 'No se publicó una importación editorial completa.');
  await delay(1000);
}
throw Error('La importación editorial excedió el tiempo disponible; se conserva la publicación anterior.');
