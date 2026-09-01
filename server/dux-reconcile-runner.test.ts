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
    ['server_error_then_cooldown', 'DUX_SYNC_COOLDOWN'],
    ['timeout_then_in_progress', 'DUX_SYNC_IN_PROGRESS'],
  ])('no convierte en éxito un ciclo incierto seguido de %s', (scenario, expectedCode) => {
    const result = runScenario(scenario);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(expectedCode);
  });

  it('considera benigno un overlap protegido observado en el primer intento', () => {
    const result = runScenario('initial_overlap');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ya existe un ciclo protegido por el lock D1');
  });

  it('no considera éxito un cooldown aunque aparezca en el primer intento', () => {
    const result = runScenario('initial_cooldown');

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('ciclo anterior sigue en cooldown');
  });
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
