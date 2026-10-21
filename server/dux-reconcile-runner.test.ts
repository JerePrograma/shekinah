import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const runner = resolve(process.cwd(), 'scripts', 'run-dux-reconcile.mjs');
const fetchStub = pathToFileURL(resolve(
  process.cwd(),
  'server',
  'test-fixtures',
  'dux-reconcile-fetch-stub.mjs',
)).href;

describe('runner programado de reconciliación Dux', () => {
  it.each([
    ['Object.assign(new TypeError(privateValue), { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", message: privateValue } })', 'type_error', null, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
    ['Object.assign(new Error(privateValue), { code: "ECONNRESET" })', 'error', 'ECONNRESET', null],
    ['Object.assign(new TypeError(privateValue), { cause: { code: "UND_ERR_CONNECT_TIMEOUT", hostname: privateValue } })', 'type_error', null, 'UND_ERR_CONNECT_TIMEOUT'],
    ['new DOMException(privateValue, "TimeoutError")', 'timeout_error', null, null],
    ['new AggregateError([new Error(privateValue)], privateValue)', 'aggregate_error', null, null],
    ['Object.assign(new Error(privateValue), { name: privateValue, code: privateValue, cause: { code: privateValue } })', 'error', null, null],
    ['privateValue', 'unknown', null, null],
  ])('diagnostica transporte con campos cerrados: %s', (expression, errorClass, errorCode, causeCode) => {
    const result = runRequestFailure(`throw (${expression});`);
    expect(result.status).not.toBe(0);
    expect(requestDiagnostics(result)).toEqual([1, 2].map(attempt => ({
      version: 1, attempt, request: attempt, phase: 'fetch_headers', httpStatus: null,
      errorClass, errorCode, causeCode,
    })));
    expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=2');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_IDENTITIES=1');
    expect(result.stderr).toContain('DUX_RECONCILE_TRANSPORT; fase=fetch_headers; HTTP=none');
    expectPrivateDataAbsent(result);
  });

  it.each([
    ['return new Response(privateValue, { status: 502 });', 'read_body', 502, 2],
    ['return Response.json({}, { status: 524 });', 'classify_response', 524, 1],
  ])('conserva HTTP observado y distingue una respuesta inválida del fallo anterior a headers: %s', (response, phase, httpStatus, diagnostics) => {
    const result = runRequestFailure(response);
    expect(result.status).not.toBe(0);
    expect(requestDiagnostics(result)).toEqual(diagnostics === 1 ? [{
      version: 1, attempt: 2, request: 2, phase, httpStatus, errorClass: 'response_error', errorCode: null, causeCode: null,
    }] : [1, 2].map(attempt => ({
      version: 1, attempt, request: attempt, phase, httpStatus, errorClass: 'response_error', errorCode: null, causeCode: null,
    })));
    expect(result.stderr).toContain(`HTTP=${httpStatus}`);
    expect(result.stdout).toContain('DUX_RUNNER_TEST_IDENTITIES=1');
    expectPrivateDataAbsent(result);
  });

  it('conserva status HTTP si la conexión se pierde al leer el cuerpo y no registra sus datos', () => {
    const result = runRequestFailure(`return new Response(new ReadableStream({ start(controller) {
      controller.error(Object.assign(new TypeError(privateValue), { cause: { code: 'UND_ERR_SOCKET', socket: privateValue } }));
    } }), { status: 502 });`);
    expect(result.status).not.toBe(0);
    expect(requestDiagnostics(result)).toEqual([1, 2].map(attempt => ({
      version: 1, attempt, request: attempt, phase: 'read_body', httpStatus: 502,
      errorClass: 'type_error', errorCode: null, causeCode: 'UND_ERR_SOCKET',
    })));
    expectPrivateDataAbsent(result);
  });

  it('un 502 JSON con rechazo Dux conserva el código y termina sin reintento ni falso error de transporte', () => {
    const result = runRequestFailure(`return Response.json({ error: { code: 'DUX_PROVIDER_REJECTED', message: privateValue } }, { status: 502 });`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('respondió 502 (DUX_PROVIDER_REJECTED)');
    expect(requestDiagnostics(result)).toEqual([]);
    expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=1');
    expectPrivateDataAbsent(result);
  });

  it('no convierte en éxito un transporte incierto seguido de un lock activo', () => {
    const result = runScenario('timeout_then_in_progress');

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('DUX_SYNC_IN_PROGRESS');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_IDENTITIES=1');
  });

  it('no reintenta un error terminal del servidor aunque sea HTTP 500', () => {
    const result = runScenario('server_error_then_cooldown');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DUX_UNAVAILABLE');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=1');
  });

  it.each(['progress_completed', 'progress_transport_resume', 'gateway_then_completed'])(
    'continúa %s con una sola identidad hasta confirmar el catálogo', (scenario) => {
      const result = runScenario(scenario);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Catálogo Dux confirmado: run=dux_sync_runner_fixture productos=3');
      expect(result.stdout).toContain('DUX_RUNNER_TEST_IDENTITIES=1');
    },
  );

  it.each([
    'progress_identity', 'progress_run', 'progress_phase', 'progress_regression',
    'progress_count', 'progress_total', 'progress_delay', 'progress_final_run',
  ])('rechaza progreso incompatible %s sin iniciar otro ciclo', (scenario) => {
    const result = runScenario(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DUX_RECONCILE_PROGRESS_INVALID');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_IDENTITIES=1');
    expect(result.stdout).not.toContain('Catálogo Dux confirmado');
  });

  it.each([
    ['progress_limit', 'DUX_RECONCILE_STEP_LIMIT'],
    ['progress_deadline', 'DUX_RECONCILE_DEADLINE'],
    ['progress_without_final', 'cuerpo inválido'],
  ])('no declara éxito sin resultado final en %s', (scenario, expectedCode) => {
    const result = runScenario(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expectedCode);
    expect(result.stdout).not.toContain('Catálogo Dux confirmado');
    if (scenario === 'progress_limit') expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=80');
  });

  it('no considera éxito un overlap protegido observado en el primer intento', () => {
    const result = runScenario('initial_overlap');

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('DUX_SYNC_IN_PROGRESS');
  });

  it('no considera éxito un cooldown aunque aparezca en el primer intento', () => {
    const result = runScenario('initial_cooldown');

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('ciclo anterior sigue en cooldown');
  });

  it('no considera éxito que la integración remota esté deshabilitada', () => {
    const result = runScenario('disabled');

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('integración está deshabilitada');
  });

  it('confirma catálogo publicado por el mismo run sin equiparar productos con inventario cuantificado', () => {
    const result = runScenario('catalog_published');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('procesadas=2');
    expect(result.stdout).toContain('Catálogo Dux confirmado: run=dux_sync_runner_fixture productos=3');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=1');
  });

  it.each([
    'catalog_missing', 'catalog_disabled', 'catalog_pending_migration', 'catalog_run_mismatch',
    'catalog_missing_run', 'catalog_invalid_version', 'catalog_wrong_price_list',
    'catalog_invalid_count', 'catalog_time_mismatch', 'catalog_invalid_time',
  ])('rechaza %s sin repetir una lectura Dux cuyo inventario ya respondió', (scenario) => {
    const result = runScenario(scenario);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DUX_CATALOG_PUBLICATION_UNCONFIRMED');
    expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=1');
    expect(result.stdout).not.toContain('Reconciliación Dux completada');
    expect(result.stdout).not.toContain('Catálogo Dux confirmado');
  });

  it.each(['invalid_success_json', 'catalog_invalid_metric', 'catalog_partial_inventory'])(
    'un éxito HTTP inconsistente %s requiere atención sin reintentar Dux', (scenario) => {
      const result = runScenario(scenario);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain('DUX_RUNNER_TEST_REQUESTS=1');
      expect(result.stdout).not.toContain('Catálogo Dux confirmado');
    },
  );
});

function requestDiagnostics(result: SpawnSyncReturns<string>): unknown[] {
  return result.stderr.split('\n').filter(line => line.startsWith('dux_reconcile_request_failure '))
    .map((line): unknown => JSON.parse(line.slice('dux_reconcile_request_failure '.length)));
}

function expectPrivateDataAbsent(result: SpawnSyncReturns<string>): void {
  const output = `${result.stdout}\n${result.stderr}`;
  for (const value of ['test-scheduler-secret-at-least-32-characters', 'PRIVATE_NETWORK_VALUE',
    'https://private.invalid', 'Authorization: Bearer', 'PRIVATE_RESPONSE_BODY']) expect(output).not.toContain(value);
}

function runRequestFailure(action: string): SpawnSyncReturns<string> {
  const source = `
    const privateValue = 'PRIVATE_NETWORK_VALUE https://private.invalid Authorization: Bearer ' +
      process.env.SHEKINAH_RECONCILE_SECRET + ' PRIVATE_RESPONSE_BODY';
    let calls = 0;
    const identities = new Set();
    const nativeTimer = globalThis.setTimeout;
    globalThis.setTimeout = (callback, milliseconds, ...args) => nativeTimer(callback, Math.min(milliseconds, 1), ...args);
    process.on('exit', () => {
      console.log('DUX_RUNNER_TEST_REQUESTS=' + calls);
      console.log('DUX_RUNNER_TEST_IDENTITIES=' + identities.size);
    });
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      identities.add(JSON.parse(init.body).requestId);
      ${action}
    };
    await import(${JSON.stringify(pathToFileURL(runner).href)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 5_000,
    env: { ...process.env, SHEKINAH_RECONCILE_URL: 'https://shekinah.ar/api/internal/dux/reconcile',
      SHEKINAH_RECONCILE_SECRET: 'test-scheduler-secret-at-least-32-characters' },
  });
}

function runScenario(scenario: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--import', fetchStub, runner], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      DUX_RUNNER_TEST_SCENARIO: scenario,
      SHEKINAH_RECONCILE_URL: 'https://shekinah.ar/api/internal/dux/reconcile',
      SHEKINAH_RECONCILE_SECRET: 'test-scheduler-secret-at-least-32-characters',
    },
  });
}
