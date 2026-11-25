import {
  fetchSafeRestartStatus,
  pollSafeRestartUntilSettled,
  probeSafeRestartEndpoint,
  runSafeRestartPreflight,
  SafeRestartApiError,
  triggerSafeRestart,
  unlockSafeRestartKillSwitch,
  type SafeRestartStatus,
} from '@/api/safeRestart'
import { probeBackend } from '@/assembly/probe'
import { activeBackend } from '@/store/setup'
import type { Backend } from '@/types'
import { computed, ref } from 'vue'

export type { SafeRestartPhase, SafeRestartStatus } from '@/api/safeRestart'
export type SafeRestartActionKind = 'idle' | 'preflight' | 'restart' | 'unlock'

export const safeRestartAvailable = ref(false)
export const safeRestartStatus = ref<SafeRestartStatus | null>(null)
export const showSafeRestartModal = ref(false)
export const safeRestartActionPending = ref<SafeRestartActionKind>('idle')
export const safeRestartReconnecting = ref(false)
export const safeRestartReconnected = ref(false)
export const safeRestartCompletedInSession = ref(false)
export const safeRestartClientError = ref('')
export const safeRestartPreflightPassed = ref(false)
export const safeRestartConsecutivePollErrors = ref(0)

export const isSafeRestartRunning = computed(() => safeRestartStatus.value?.state === 'running')

export const isKillSwitchActive = computed(
  () => safeRestartStatus.value?.killswitch_active === true,
)

export const killSwitchMaxSec = computed(() => safeRestartStatus.value?.killswitch_max_sec ?? 30)

export const isAutoUnlockedWarning = computed(
  () =>
    safeRestartStatus.value?.state === 'failed' &&
    safeRestartStatus.value?.auto_unlocked === true &&
    !safeRestartStatus.value?.momo_running,
)

export const hasSafeRestartAttention = computed(
  () =>
    isSafeRestartRunning.value ||
    isKillSwitchActive.value ||
    (safeRestartStatus.value?.state === 'failed' &&
      safeRestartStatus.value?.auto_unlocked === true),
)

let probedBackendUuid = ''
let probeGeneration = 0
let pollAbortController: AbortController | null = null
let reconnectHandler: (() => Promise<boolean>) | null = null

export const registerSafeRestartReconnectHandler = (handler: () => Promise<boolean>) => {
  reconnectHandler = handler
}

export const stopSafeRestartPolling = () => {
  pollAbortController?.abort()
  pollAbortController = null
  safeRestartConsecutivePollErrors.value = 0
}

export const resetSafeRestartForBackend = (nextUuid: string) => {
  if (probedBackendUuid === nextUuid) return

  stopSafeRestartPolling()
  probedBackendUuid = nextUuid
  probeGeneration += 1
  safeRestartAvailable.value = false
  safeRestartStatus.value = null
  showSafeRestartModal.value = false
  safeRestartActionPending.value = 'idle'
  safeRestartReconnecting.value = false
  safeRestartReconnected.value = false
  safeRestartCompletedInSession.value = false
  safeRestartClientError.value = ''
  safeRestartPreflightPassed.value = false
}

export const probeSafeRestartCapability = async (backend?: Backend | null) => {
  const target = backend ?? activeBackend.value
  if (!target) {
    resetSafeRestartForBackend('')
    return
  }

  if (probedBackendUuid !== target.uuid) {
    resetSafeRestartForBackend(target.uuid)
  }

  const generation = ++probeGeneration
  const result = await probeSafeRestartEndpoint(target, { timeoutMs: 2500 })

  if (generation !== probeGeneration || activeBackend.value?.uuid !== target.uuid) {
    return
  }

  safeRestartAvailable.value = result.available
  if (result.status) {
    safeRestartStatus.value = result.status
  }
}

const waitForClashApiReady = async (backend: Backend, maxWaitMs = 15000): Promise<boolean> => {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    if (activeBackend.value?.uuid !== backend.uuid) return false
    const probe = await probeBackend(backend, 2500)
    if (probe.ok) return true
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  return false
}

export const reconnectAfterSafeRestart = async () => {
  const backend = activeBackend.value
  if (!backend || safeRestartReconnecting.value) return

  safeRestartReconnecting.value = true
  safeRestartReconnected.value = false

  try {
    const ready = await waitForClashApiReady(backend)
    if (!ready || activeBackend.value?.uuid !== backend.uuid) return

    const connected = (await reconnectHandler?.()) ?? false
    if (activeBackend.value?.uuid !== backend.uuid) return

    safeRestartReconnected.value = connected
  } catch {
    if (activeBackend.value?.uuid === backend.uuid) {
      safeRestartReconnected.value = false
    }
  } finally {
    if (activeBackend.value?.uuid === backend.uuid) {
      safeRestartReconnecting.value = false
    }
  }
}

export const startSafeRestartPolling = async () => {
  const backend = activeBackend.value
  if (!backend) return

  stopSafeRestartPolling()
  const controller = new AbortController()
  pollAbortController = controller

  try {
    const finalStatus = await pollSafeRestartUntilSettled(backend, {
      intervalMs: 1000,
      timeoutMs: 4000,
      maxConsecutiveErrors: 15,
      signal: controller.signal,
      onUpdate: (status) => {
        if (activeBackend.value?.uuid !== backend.uuid) return
        safeRestartConsecutivePollErrors.value = 0
        safeRestartStatus.value = status
        safeRestartClientError.value = ''
      },
      onPollError: (_err, count) => {
        if (activeBackend.value?.uuid !== backend.uuid) return
        safeRestartConsecutivePollErrors.value = count
      },
    })

    if (activeBackend.value?.uuid !== backend.uuid) return

    safeRestartStatus.value = finalStatus
    safeRestartConsecutivePollErrors.value = 0

    if (finalStatus.state === 'done') {
      safeRestartCompletedInSession.value = true
      await reconnectAfterSafeRestart()
    }
  } catch (error) {
    if (controller.signal.aborted || activeBackend.value?.uuid !== backend.uuid) return
    safeRestartClientError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (pollAbortController === controller) {
      pollAbortController = null
    }
  }
}

export const refreshSafeRestartStatus = async () => {
  const backend = activeBackend.value
  if (!backend) return null

  try {
    const status = await fetchSafeRestartStatus(backend, { timeoutMs: 4000 })
    if (activeBackend.value?.uuid !== backend.uuid) return null
    safeRestartAvailable.value = true
    safeRestartStatus.value = status
    safeRestartClientError.value = ''
    return status
  } catch (error) {
    if (activeBackend.value?.uuid !== backend.uuid) return null
    safeRestartClientError.value = error instanceof Error ? error.message : String(error)
    return null
  }
}

export const openSafeRestartModal = () => {
  safeRestartClientError.value = ''
  safeRestartPreflightPassed.value = false
  safeRestartReconnected.value = false
  safeRestartCompletedInSession.value = false
  showSafeRestartModal.value = true

  void refreshSafeRestartStatus().then((status) => {
    if (status?.state === 'running') {
      void startSafeRestartPolling()
    }
  })
}

export const runPreflightCheck = async () => {
  const backend = activeBackend.value
  if (!backend || safeRestartActionPending.value !== 'idle' || isSafeRestartRunning.value) return

  safeRestartActionPending.value = 'preflight'
  safeRestartClientError.value = ''
  safeRestartPreflightPassed.value = false
  safeRestartCompletedInSession.value = false

  try {
    const status = await runSafeRestartPreflight(backend)
    if (activeBackend.value?.uuid !== backend.uuid) return
    safeRestartStatus.value = status
    safeRestartPreflightPassed.value = status.state !== 'failed' && !status.error
  } catch (error) {
    if (activeBackend.value?.uuid !== backend.uuid) return
    if (error instanceof SafeRestartApiError && error.payload) {
      safeRestartStatus.value = error.payload
    }
    safeRestartClientError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (activeBackend.value?.uuid === backend.uuid) {
      safeRestartActionPending.value = 'idle'
    }
  }
}

export const startSafeRestart = async () => {
  const backend = activeBackend.value
  if (!backend || safeRestartActionPending.value !== 'idle' || isSafeRestartRunning.value) return

  safeRestartActionPending.value = 'restart'
  safeRestartClientError.value = ''
  safeRestartPreflightPassed.value = false
  safeRestartReconnected.value = false
  safeRestartCompletedInSession.value = false

  try {
    const status = await triggerSafeRestart(backend)
    if (activeBackend.value?.uuid !== backend.uuid) return
    safeRestartStatus.value = status
    safeRestartActionPending.value = 'idle'
    if (status.state === 'running') {
      void startSafeRestartPolling()
    } else if (status.state === 'done') {
      safeRestartCompletedInSession.value = true
      void reconnectAfterSafeRestart()
    }
  } catch (error) {
    if (activeBackend.value?.uuid !== backend.uuid) return
    safeRestartActionPending.value = 'idle'
    if (error instanceof SafeRestartApiError && error.code === 'conflict') {
      if (error.payload) {
        safeRestartStatus.value = error.payload
      } else {
        await refreshSafeRestartStatus()
      }
      if (activeBackend.value?.uuid !== backend.uuid) return
      if (safeRestartStatus.value?.state === 'running') {
        void startSafeRestartPolling()
        return
      }
    }
    if (error instanceof SafeRestartApiError && error.payload) {
      safeRestartStatus.value = error.payload
    }
    safeRestartClientError.value = error instanceof Error ? error.message : String(error)
  }
}

export const unlockKillSwitch = async () => {
  const backend = activeBackend.value
  if (!backend || safeRestartActionPending.value !== 'idle' || isSafeRestartRunning.value) return

  safeRestartActionPending.value = 'unlock'
  safeRestartClientError.value = ''

  try {
    const status = await unlockSafeRestartKillSwitch(backend)
    if (activeBackend.value?.uuid !== backend.uuid) return
    safeRestartStatus.value = status
  } catch (error) {
    if (activeBackend.value?.uuid !== backend.uuid) return
    if (error instanceof SafeRestartApiError && error.payload) {
      safeRestartStatus.value = error.payload
    }
    safeRestartClientError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (activeBackend.value?.uuid === backend.uuid) {
      safeRestartActionPending.value = 'idle'
    }
  }
}
