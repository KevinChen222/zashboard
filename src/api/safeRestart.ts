export type SafeRestartState = 'idle' | 'running' | 'done' | 'failed'

export type SafeRestartPhase =
  | 'idle'
  | 'preflight'
  | 'killswitch_on'
  | 'restarting'
  | 'verifying'
  | 'killswitch_off'
  | 'done'
  | 'failed'

export interface SafeRestartStatus {
  supported: boolean
  engine_version: string
  state: SafeRestartState
  phase: SafeRestartPhase
  killswitch_active: boolean
  momo_running: boolean
  auto_unlocked?: boolean
  killswitch_max_sec?: number
  job_id: string
  started_at: number
  updated_at: number
  finished_at: number
  elapsed_sec: number
  message: string
  error: string
  log_tail: string
}

export interface SafeRestartBackendInput {
  host?: string
  password?: string
  safeRestartUrl?: string
}

export type SafeRestartAction = 'status' | 'restart' | 'unlock' | 'preflight'

export type SafeRestartErrorCode =
  | 'unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_response'

export class SafeRestartApiError extends Error {
  readonly code: SafeRestartErrorCode
  readonly httpStatus?: number
  readonly payload?: SafeRestartStatus

  constructor(
    message: string,
    code: SafeRestartErrorCode,
    options?: {
      httpStatus?: number
      payload?: SafeRestartStatus
    },
  ) {
    super(message)
    this.name = 'SafeRestartApiError'
    this.code = code
    this.httpStatus = options?.httpStatus
    this.payload = options?.payload
  }
}

export interface SafeRestartRequestOptions {
  timeoutMs?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export interface SafeRestartProbeResult {
  available: boolean
  status: SafeRestartStatus | null
}

const VALID_STATES = new Set<SafeRestartState>(['idle', 'running', 'done', 'failed'])
const VALID_PHASES = new Set<SafeRestartPhase>([
  'idle',
  'preflight',
  'killswitch_on',
  'restarting',
  'verifying',
  'killswitch_off',
  'done',
  'failed',
])

const formatHostForUrl = (rawHost: string): string => {
  const host = rawHost.trim()
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`
  }
  return host
}

export const getSafeRestartEndpoint = (backend?: SafeRestartBackendInput | null): string | null => {
  if (!backend) return null

  const override = backend.safeRestartUrl?.trim()
  if (override) {
    return override.replace(/\/+$/, '')
  }

  const host = backend.host?.trim()
  if (!host) return null

  return `http://${formatHostForUrl(host)}/cgi-bin/momo-safe-restart`
}

export const buildSafeRestartActionUrl = (endpoint: string, action: SafeRestartAction): string => {
  const url = new URL(endpoint)
  url.searchParams.set('action', action)
  return url.toString()
}

export const buildSafeRestartHeaders = (secret?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const token = secret ?? ''
  if (token.length > 0) {
    headers.Authorization = `Bearer ${token}`
    headers['X-Momo-Secret'] = token
  }

  return headers
}

export const isValidSafeRestartStatus = (data: unknown): data is SafeRestartStatus => {
  if (!data || typeof data !== 'object') return false
  const candidate = data as Record<string, unknown>

  return (
    candidate.supported === true &&
    typeof candidate.state === 'string' &&
    VALID_STATES.has(candidate.state as SafeRestartState) &&
    typeof candidate.phase === 'string' &&
    VALID_PHASES.has(candidate.phase as SafeRestartPhase) &&
    typeof candidate.killswitch_active === 'boolean' &&
    typeof candidate.momo_running === 'boolean'
  )
}

const normalizeSafeRestartStatus = (data: SafeRestartStatus): SafeRestartStatus => ({
  supported: true,
  engine_version: typeof data.engine_version === 'string' ? data.engine_version : '',
  state: data.state,
  phase: data.phase,
  killswitch_active: Boolean(data.killswitch_active),
  momo_running: Boolean(data.momo_running),
  auto_unlocked: typeof data.auto_unlocked === 'boolean' ? data.auto_unlocked : false,
  killswitch_max_sec:
    typeof data.killswitch_max_sec === 'number' &&
    Number.isFinite(data.killswitch_max_sec) &&
    data.killswitch_max_sec > 0
      ? data.killswitch_max_sec
      : 30,
  job_id: typeof data.job_id === 'string' ? data.job_id : '',
  started_at: Number.isFinite(data.started_at) ? data.started_at : 0,
  updated_at: Number.isFinite(data.updated_at) ? data.updated_at : 0,
  finished_at: Number.isFinite(data.finished_at) ? data.finished_at : 0,
  elapsed_sec: Number.isFinite(data.elapsed_sec) ? data.elapsed_sec : 0,
  message: typeof data.message === 'string' ? data.message : '',
  error: typeof data.error === 'string' ? data.error : '',
  log_tail: typeof data.log_tail === 'string' ? data.log_tail : '',
})

const mapHttpStatusToErrorCode = (status: number): SafeRestartErrorCode => {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 409) return 'conflict'
  if (status === 503) return 'unavailable'
  return 'http'
}

const requestSafeRestart = async (
  backend: SafeRestartBackendInput | null | undefined,
  action: SafeRestartAction,
  method: 'GET' | 'POST',
  defaultTimeoutMs: number,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartStatus> => {
  const endpoint = getSafeRestartEndpoint(backend)
  if (!endpoint) {
    throw new SafeRestartApiError('Safe restart endpoint is not available', 'unavailable')
  }

  let url: string
  try {
    url = buildSafeRestartActionUrl(endpoint, action)
  } catch (error) {
    throw new SafeRestartApiError(
      error instanceof Error ? error.message : 'Invalid safe restart endpoint URL',
      'unavailable',
    )
  }

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs
  const controller = new AbortController()
  let timedOut = false

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  options?.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetchImpl(url, {
      method,
      headers: buildSafeRestartHeaders(backend?.password),
      cache: 'no-store',
      signal: controller.signal,
    })

    const rawText = await response.text().catch(() => '')
    let parsed: unknown = null
    if (rawText.trim()) {
      try {
        parsed = JSON.parse(rawText)
      } catch {
        parsed = null
      }
    }

    const payload = isValidSafeRestartStatus(parsed)
      ? normalizeSafeRestartStatus(parsed)
      : undefined

    if (!response.ok) {
      const serverMessage =
        payload?.error ||
        payload?.message ||
        (parsed &&
        typeof parsed === 'object' &&
        'error' in parsed &&
        typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : '') ||
        `HTTP ${response.status}`

      throw new SafeRestartApiError(serverMessage, mapHttpStatusToErrorCode(response.status), {
        httpStatus: response.status,
        payload,
      })
    }

    if (!payload) {
      throw new SafeRestartApiError('Invalid safe restart status response', 'invalid_response', {
        httpStatus: response.status,
      })
    }

    return payload
  } catch (error) {
    if (error instanceof SafeRestartApiError) {
      throw error
    }

    if (timedOut) {
      throw new SafeRestartApiError('Safe restart request timed out', 'timeout')
    }

    throw new SafeRestartApiError(error instanceof Error ? error.message : String(error), 'network')
  } finally {
    clearTimeout(timeoutId)
    options?.signal?.removeEventListener('abort', onExternalAbort)
  }
}

export const fetchSafeRestartStatus = (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartStatus> => requestSafeRestart(backend, 'status', 'GET', 5000, options)

export const probeSafeRestartEndpoint = async (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartProbeResult> => {
  try {
    const status = await requestSafeRestart(backend, 'status', 'GET', 2500, options)
    return { available: true, status }
  } catch {
    return { available: false, status: null }
  }
}

export const triggerSafeRestart = (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartStatus> => requestSafeRestart(backend, 'restart', 'POST', 10000, options)

export const unlockSafeRestartKillSwitch = (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartStatus> => requestSafeRestart(backend, 'unlock', 'POST', 10000, options)

export const runSafeRestartPreflight = (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartRequestOptions,
): Promise<SafeRestartStatus> => requestSafeRestart(backend, 'preflight', 'POST', 30000, options)

export interface SafeRestartPollOptions extends SafeRestartRequestOptions {
  intervalMs?: number
  maxConsecutiveErrors?: number
  onUpdate?: (status: SafeRestartStatus) => void
  onPollError?: (error: SafeRestartApiError, consecutiveErrors: number) => void
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SafeRestartApiError('Polling aborted', 'network'))
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new SafeRestartApiError('Polling aborted', 'network'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })

export const pollSafeRestartUntilSettled = async (
  backend: SafeRestartBackendInput | null | undefined,
  options?: SafeRestartPollOptions,
): Promise<SafeRestartStatus> => {
  const intervalMs = options?.intervalMs ?? 1000
  const maxConsecutiveErrors = options?.maxConsecutiveErrors ?? 10
  const sleep = options?.sleepImpl ?? defaultSleep

  let consecutiveErrors = 0

  while (!options?.signal?.aborted) {
    try {
      const status = await fetchSafeRestartStatus(backend, {
        timeoutMs: options?.timeoutMs ?? 4000,
        signal: options?.signal,
        fetchImpl: options?.fetchImpl,
      })

      consecutiveErrors = 0
      options?.onUpdate?.(status)

      if (status.state !== 'running') {
        return status
      }
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new SafeRestartApiError('Polling aborted', 'network')
      }

      const apiError =
        error instanceof SafeRestartApiError
          ? error
          : new SafeRestartApiError(
              error instanceof Error ? error.message : String(error),
              'network',
            )

      // Fatal auth/forbidden errors should not be retried blindly
      if (apiError.code === 'unauthorized' || apiError.code === 'forbidden') {
        throw apiError
      }

      consecutiveErrors += 1
      options?.onPollError?.(apiError, consecutiveErrors)

      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw apiError
      }
    }

    await sleep(intervalMs, options?.signal)
  }

  throw new SafeRestartApiError('Polling aborted', 'network')
}
