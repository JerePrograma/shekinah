import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import ts from 'typescript';
import type { getOrCreateWebRequestIdentity, readWebRequestIdentity, finishWebRequestIdentity } from '../../src/commerce/web-request-session';
type SessionModule = {
  getOrCreateWebRequestIdentity: typeof getOrCreateWebRequestIdentity;
  readWebRequestIdentity: typeof readWebRequestIdentity;
  finishWebRequestIdentity: typeof finishWebRequestIdentity;
};

// Sólo interceptado por Playwright. No se agrega ninguna ruta de depuración al producto.
const modulePath = '/__web_request_session_fixture__.js';
const moduleSource = ts.transpileModule(readFileSync(resolve(process.cwd(), 'src/commerce/web-request-session.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

test('IndexedDB real: dos pestañas reclaman una sola identidad y la recuperan tras recarga', async ({ context, page }) => {
  await context.route(`**${modulePath}`, (route) => route.fulfill({ contentType: 'text/javascript', body: moduleSource }));
  await page.goto('/carrito');
  const second = await context.newPage(); await second.goto('/carrito');
  const results = await Promise.all([page, second].map((tab) => tab.evaluate(async (path) => {
    const module = await import(path) as SessionModule;
    return Promise.all(Array.from({ length: 8 }, () => module.getOrCreateWebRequestIdentity()));
  }, modulePath)));
  expect(new Set(results.flat().map((value) => value.idempotencyKey)).size).toBe(1);
  expect(new Set(results.flat().map((value) => value.ownerSecret)).size).toBe(1);
  const first = results[0]?.[0];
  if (first === undefined) throw new Error('No se recuperó la identidad del navegador.');
  expect(Object.keys(first)).toEqual(['idempotencyKey', 'ownerSecret']);
  await page.reload();
  const recovered = await page.evaluate(async (path) => { const module = await import(path) as SessionModule; return module.readWebRequestIdentity(); }, modulePath);
  expect(recovered).toEqual(first);
});

test('IndexedDB real: un cierre obsoleto no elimina el intento nuevo de otra pestaña', async ({ context, page }) => {
  await context.route(`**${modulePath}`, (route) => route.fulfill({ contentType: 'text/javascript', body: moduleSource }));
  await page.goto('/carrito');
  const result = await page.evaluate(async (path) => {
    const module = await import(path) as SessionModule;
    const previous = await module.getOrCreateWebRequestIdentity();
    await module.finishWebRequestIdentity(previous.idempotencyKey);
    const current = await module.getOrCreateWebRequestIdentity();
    await module.finishWebRequestIdentity(previous.idempotencyKey);
    return { current, persisted: await module.readWebRequestIdentity(), previous };
  }, modulePath);
  expect(result.persisted).toEqual(result.current);
  expect(result.current.idempotencyKey).not.toBe(result.previous.idempotencyKey);
});
