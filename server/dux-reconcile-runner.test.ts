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
