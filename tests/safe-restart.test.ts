import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSafeRestartActionUrl,
  buildSafeRestartHeaders,
  fetchSafeRestartStatus,
  getSafeRestartEndpoint,
  pollSafeRestartUntilSettled,
  probeSafeRestartEndpoint,
  runSafeRestartPreflight,
  SafeRestartApiError,
  triggerSafeRestart,
  unlockSafeRestartKillSwitch,
  type SafeRestartStatus,
} from '../src/api/safeRestart.ts'

const makeStatus = (overrides: Partial<SafeRestartStatus> = {}): SafeRestartStatus => ({
  supported: true,
  engine_version: '1.0.0',
  state: 'idle',
  phase: 'idle',
  killswitch_active: false,
  momo_running: true,
  auto_unlocked: false,
  killswitch_max_sec: 30,
  job_id: '',
  started_at: 0,
  updated_at: 0,
  finished_at: 0,
  elapsed_sec: 0,
  message: '',
  error: '',
  log_tail: '',
  ...overrides,
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('safeRestart API client', () => {
  it('derives endpoint from backend.host by default and honors trimmed safeRestartUrl override', () => {
    assert.equal(getSafeRestartEndpoint(null), null)
    assert.equal(getSafeRestartEndpoint({ host: '   ' }), null)

    assert.equal(
      getSafeRestartEndpoint({ host: '192.168.2.1' }),
      'http://192.168.2.1/cgi-bin/momo-safe-restart',
    )

    assert.equal(
      getSafeRestartEndpoint({ host: 'fd00::1' }),
      'http://[fd00::1]/cgi-bin/momo-safe-restart',
    )

    assert.equal(
      getSafeRestartEndpoint({
        host: '192.168.2.1',
        safeRestartUrl: '  http://192.168.2.1:9097/custom/restart///  ',
      }),
      'http://192.168.2.1:9097/custom/restart',
    )

    assert.equal(
      buildSafeRestartActionUrl('http://192.168.2.1/cgi-bin/momo-safe-restart', 'status'),
      'http://192.168.2.1/cgi-bin/momo-safe-restart?action=status',
    )
  })

  it('sends both Authorization Bearer and X-Momo-Secret headers when secret is present', () => {
    assert.deepEqual(buildSafeRestartHeaders(''), { Accept: 'application/json' })
    assert.deepEqual(buildSafeRestartHeaders('top-secret'), {
      Accept: 'application/json',
      Authorization: 'Bearer top-secret',
      'X-Momo-Secret': 'top-secret',
    })
  })

  it('fetches status with dual auth headers and GET ?action=status', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return jsonResponse(makeStatus({ state: 'idle', momo_running: true }))
    }

    const res = await fetchSafeRestartStatus(
      { host: '192.168.2.1', password: 'my-secret' },
      { fetchImpl: mockFetch },
    )

    assert.equal(capturedUrl, 'http://192.168.2.1/cgi-bin/momo-safe-restart?action=status')
    assert.equal(capturedInit?.method, 'GET')
    assert.deepEqual(capturedInit?.headers, {
      Accept: 'application/json',
      Authorization: 'Bearer my-secret',
      'X-Momo-Secret': 'my-secret',
    })
    assert.equal(res.supported, true)
    assert.equal(res.momo_running, true)
  })

  it('probeSafeRestartEndpoint fails silently on 401/404/network/invalid JSON', async () => {
    const unauthorizedProbe = await probeSafeRestartEndpoint(
      { host: '192.168.2.1', password: 'wrong' },
      { fetchImpl: async () => jsonResponse({ error: 'unauthorized' }, 401) },
    )
    assert.deepEqual(unauthorizedProbe, { available: false, status: null })

    const networkProbe = await probeSafeRestartEndpoint(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch')
        },
      },
    )
    assert.deepEqual(networkProbe, { available: false, status: null })

    const invalidPayloadProbe = await probeSafeRestartEndpoint(
      { host: '192.168.2.1', password: 'secret' },
      { fetchImpl: async () => new Response('<html>404</html>', { status: 200 }) },
    )
    assert.deepEqual(invalidPayloadProbe, { available: false, status: null })

    const okProbe = await probeSafeRestartEndpoint(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: async () =>
          jsonResponse(makeStatus({ killswitch_active: true, state: 'failed' })),
      },
    )
    assert.equal(okProbe.available, true)
    assert.equal(okProbe.status?.killswitch_active, true)
  })

  it('handles triggerSafeRestart 202 and 409 conflict with running payload', async () => {
    const runningStatus = makeStatus({
      state: 'running',
      phase: 'killswitch_on',
      killswitch_active: true,
      job_id: 'job-123',
    })

    const accepted = await triggerSafeRestart(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: async (input, init) => {
          assert.equal(String(input), 'http://192.168.2.1/cgi-bin/momo-safe-restart?action=restart')
          assert.equal(init?.method, 'POST')
          return jsonResponse(runningStatus, 202)
        },
      },
    )
    assert.equal(accepted.job_id, 'job-123')
    assert.equal(accepted.killswitch_active, true)

    await assert.rejects(
      () =>
        triggerSafeRestart(
          { host: '192.168.2.1', password: 'secret' },
          { fetchImpl: async () => jsonResponse(runningStatus, 409) },
        ),
      (err: unknown) => {
        assert.ok(err instanceof SafeRestartApiError)
        assert.equal(err.code, 'conflict')
        assert.equal(err.httpStatus, 409)
        assert.equal(err.payload?.job_id, 'job-123')
        return true
      },
    )
  })

  it('handles unlock and preflight including 401 and 422 error payloads without global axios', async () => {
    const unlocked = await unlockSafeRestartKillSwitch(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: async (input, init) => {
          assert.equal(String(input), 'http://192.168.2.1/cgi-bin/momo-safe-restart?action=unlock')
          assert.equal(init?.method, 'POST')
          return jsonResponse(makeStatus({ killswitch_active: false }))
        },
      },
    )
    assert.equal(unlocked.killswitch_active, false)

    await assert.rejects(
      () =>
        fetchSafeRestartStatus(
          { host: '192.168.2.1', password: 'bad' },
          { fetchImpl: async () => jsonResponse({ error: 'Unauthorized' }, 401) },
        ),
      (err: unknown) => {
        assert.ok(err instanceof SafeRestartApiError)
        assert.equal(err.code, 'unauthorized')
        assert.equal(err.httpStatus, 401)
        return true
      },
    )

    const failedPreflight = makeStatus({
      state: 'failed',
      phase: 'preflight',
      error: 'sing-box check failed',
      log_tail: 'FATAL decode config: invalid json',
    })

    await assert.rejects(
      () =>
        runSafeRestartPreflight(
          { host: '192.168.2.1', password: 'secret' },
          {
            fetchImpl: async (input, init) => {
              assert.equal(
                String(input),
                'http://192.168.2.1/cgi-bin/momo-safe-restart?action=preflight',
              )
              assert.equal(init?.method, 'POST')
              return jsonResponse(failedPreflight, 422)
            },
          },
        ),
      (err: unknown) => {
        assert.ok(err instanceof SafeRestartApiError)
        assert.equal(err.httpStatus, 422)
        assert.equal(err.payload?.log_tail, 'FATAL decode config: invalid json')
        return true
      },
    )
  })

  it('polls across transient network errors until settled and aborts on fatal 401', async () => {
    const phases: SafeRestartStatus[] = []
    const pollErrors: number[] = []
    let call = 0

    const mockFetch: typeof fetch = async () => {
      call += 1
      if (call === 1) {
        return jsonResponse(
          makeStatus({ state: 'running', phase: 'killswitch_on', killswitch_active: true }),
        )
      }
      if (call === 2 || call === 3) {
        throw new TypeError('temporary socket reset')
      }
      if (call === 4) {
        return jsonResponse(
          makeStatus({ state: 'running', phase: 'verifying', killswitch_active: true }),
        )
      }
      return jsonResponse(
        makeStatus({ state: 'done', phase: 'done', killswitch_active: false, elapsed_sec: 7 }),
      )
    }

    const finalStatus = await pollSafeRestartUntilSettled(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: mockFetch,
        sleepImpl: async () => {},
        maxConsecutiveErrors: 5,
        onUpdate: (s) => phases.push(s),
        onPollError: (_e, count) => pollErrors.push(count),
      },
    )

    assert.equal(finalStatus.state, 'done')
    assert.equal(finalStatus.elapsed_sec, 7)
    assert.deepEqual(
      phases.map((s) => s.phase),
      ['killswitch_on', 'verifying', 'done'],
    )
    assert.deepEqual(pollErrors, [1, 2])

    // Fatal 401 must reject immediately without retrying
    let authCalls = 0
    await assert.rejects(
      () =>
        pollSafeRestartUntilSettled(
          { host: '192.168.2.1', password: 'bad' },
          {
            fetchImpl: async () => {
              authCalls += 1
              return jsonResponse({ error: 'Unauthorized' }, 401)
            },
            sleepImpl: async () => {},
            maxConsecutiveErrors: 5,
          },
        ),
      (err: unknown) => {
        assert.ok(err instanceof SafeRestartApiError)
        assert.equal(err.code, 'unauthorized')
        return true
      },
    )
    assert.equal(authCalls, 1)
  })

  it('normalizes auto_unlocked and killswitch_max_sec with safe backward-compatible defaults', async () => {
    const legacyPayload = {
      supported: true,
      engine_version: '1.0.0',
      state: 'idle',
      phase: 'idle',
      killswitch_active: false,
      momo_running: true,
      job_id: '',
      started_at: 0,
      updated_at: 0,
      finished_at: 0,
      elapsed_sec: 0,
      message: '',
      error: '',
      log_tail: '',
    }

    const legacyStatus = await fetchSafeRestartStatus(
      { host: '192.168.2.1', password: 'secret' },
      { fetchImpl: async () => jsonResponse(legacyPayload) },
    )
    assert.equal(legacyStatus.auto_unlocked, false)
    assert.equal(legacyStatus.killswitch_max_sec, 30)

    const autoUnlockedFailure = await fetchSafeRestartStatus(
      { host: '192.168.2.1', password: 'secret' },
      {
        fetchImpl: async () =>
          jsonResponse(
            makeStatus({
              state: 'failed',
              phase: 'failed',
              killswitch_active: false,
              momo_running: false,
              auto_unlocked: true,
              killswitch_max_sec: 30,
              elapsed_sec: 30,
              error: 'Momo failed to recover within 30s; WAN auto-restored',
              log_tail: 'FATAL start failed',
            }),
          ),
      },
    )
    assert.equal(autoUnlockedFailure.state, 'failed')
    assert.equal(autoUnlockedFailure.auto_unlocked, true)
    assert.equal(autoUnlockedFailure.killswitch_max_sec, 30)
    assert.equal(autoUnlockedFailure.momo_running, false)
    assert.equal(autoUnlockedFailure.killswitch_active, false)
  })
})
