const scenario = process.env.DUX_RUNNER_TEST_SCENARIO;
let calls = 0;

const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, milliseconds, ...arguments_) => (
  nativeSetTimeout(callback, Math.min(Number(milliseconds), 1), ...arguments_)
);

globalThis.fetch = async () => {
  calls += 1;
  if (scenario === 'server_error_then_cooldown') {
    return calls === 1
      ? jsonResponse(500, 'DUX_UNAVAILABLE')
      : jsonResponse(429, 'DUX_SYNC_COOLDOWN');
  }
  if (scenario === 'timeout_then_in_progress') {
    if (calls === 1) throw new DOMException('simulated timeout', 'TimeoutError');
    return jsonResponse(409, 'DUX_SYNC_IN_PROGRESS');
  }
  if (scenario === 'initial_overlap') {
    return jsonResponse(409, 'DUX_SYNC_IN_PROGRESS');
  }
  if (scenario === 'initial_cooldown') {
    return jsonResponse(429, 'DUX_SYNC_COOLDOWN');
  }
  if (scenario === 'disabled') {
    return new Response(JSON.stringify({ status: 'disabled' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error('Escenario de runner Dux no reconocido.');
};

function jsonResponse(status, code) {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: {
      'content-type': 'application/json',
      'retry-after': '0',
    },
  });
}
