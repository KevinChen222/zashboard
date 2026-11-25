<template>
  <DialogWrapper
    v-if="isReady"
    v-model="modalValue"
    :title="$t('safeRestartMomo')"
    :prevent-close="isLockedOpen"
    box-class="max-w-lg"
  >
    <div class="flex flex-col gap-4">
      <!-- Live Kill-Switch Status Banner -->
      <div
        v-if="isKillSwitchActive"
        class="border-error/40 bg-error/10 text-error flex items-start gap-3 rounded-lg border px-3.5 py-3"
      >
        <span class="relative mt-1 flex h-2.5 w-2.5 flex-none">
          <span
            class="bg-error absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          ></span>
          <span class="bg-error relative inline-flex h-2.5 w-2.5 rounded-full"></span>
        </span>
        <div class="min-w-0 flex-1 text-xs leading-5">
          <div class="text-sm font-semibold">{{ $t('safeRestartKillSwitchActive') }}</div>
          <div class="opacity-90">{{ $t('safeRestartKillSwitchActiveTip') }}</div>
        </div>
      </div>

      <div
        v-else-if="isAutoUnlockedFailure"
        class="border-error/50 bg-error/15 text-error flex items-start gap-3 rounded-lg border px-3.5 py-3"
      >
        <ExclamationTriangleIcon class="mt-0.5 h-5 w-5 flex-none" />
        <div class="min-w-0 flex-1 space-y-1 text-xs leading-5">
          <div class="text-sm font-semibold">{{ $t('safeRestartAutoUnlockedTitle') }}</div>
          <p class="opacity-95">
            {{ $t('safeRestartAutoUnlockedDesc', { maxSec: killSwitchMaxSec }) }}
          </p>
        </div>
      </div>

      <div
        v-else-if="isPreflightAborted"
        class="border-warning/40 bg-warning/10 text-warning flex items-start gap-3 rounded-lg border px-3.5 py-3"
      >
        <ShieldCheckIcon class="mt-0.5 h-5 w-5 flex-none" />
        <div class="min-w-0 flex-1 space-y-1 text-xs leading-5">
          <div class="text-sm font-semibold">{{ $t('safeRestartPreflightAbortedTitle') }}</div>
          <p class="text-base-content/80">{{ $t('safeRestartPreflightAbortedDesc') }}</p>
        </div>
      </div>

      <div
        v-else-if="isDone"
        class="border-success/40 bg-success/10 text-success flex items-start gap-3 rounded-lg border px-3.5 py-3"
      >
        <CheckCircleIcon class="mt-0.5 h-5 w-5 flex-none" />
        <div class="min-w-0 flex-1 text-xs leading-5">
          <div class="text-sm font-semibold">{{ $t('safeRestartDoneTitle') }}</div>
          <div class="opacity-90">
            {{
              safeRestartReconnecting
                ? $t('safeRestartReconnecting')
                : safeRestartReconnected
                  ? $t('safeRestartReconnected')
                  : $t('safeRestartKillSwitchLifted')
            }}
            <span
              v-if="displayElapsed > 0"
              class="ml-1 tabular-nums"
            >
              ({{ displayElapsed }}s)
            </span>
          </div>
        </div>
      </div>

      <div
        v-else-if="isIdle && !hasError"
        class="border-base-content/10 bg-base-200/70 flex items-start gap-3 rounded-lg border px-3.5 py-3"
      >
        <ShieldCheckIcon class="text-primary mt-0.5 h-5 w-5 flex-none" />
        <div class="min-w-0 flex-1 space-y-1 text-xs leading-5">
          <div class="text-base-content text-sm font-medium">{{ $t('safeRestartIntroTitle') }}</div>
          <p class="text-base-content/75">
            {{ $t('safeRestartIntroDesc', { maxSec: killSwitchMaxSec }) }}
          </p>
          <p class="text-base-content/60">
            {{ $t('safeRestartLanReassurance', { maxSec: killSwitchMaxSec }) }}
          </p>
        </div>
      </div>

      <!-- Preflight Passed Banner -->
      <div
        v-if="safeRestartPreflightPassed && !isRunning"
        class="border-success/30 bg-success/10 text-success flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
      >
        <CheckCircleIcon class="h-4 w-4 flex-none" />
        <span>{{ $t('safeRestartPreflightPassed') }}</span>
      </div>

      <!-- 5-Step Sequence / Live Progress -->
      <div class="border-base-content/10 bg-base-200/40 rounded-lg border p-3">
        <div class="mb-2 flex items-center justify-between text-xs font-medium">
          <span class="text-base-content/70">{{ $t('safeRestartStepsTitle') }}</span>
          <span
            v-if="isRunning || displayElapsed > 0"
            class="text-base-content/60 tabular-nums"
          >
            {{
              isRunning
                ? $t('safeRestartElapsedWithMax', {
                    seconds: displayElapsed,
                    maxSec: killSwitchMaxSec,
                  })
                : $t('safeRestartElapsed', { seconds: displayElapsed })
            }}
          </span>
        </div>

        <ol class="flex flex-col gap-2">
          <li
            v-for="step in steps"
            :key="step.key"
            class="flex items-start gap-2.5 text-xs"
          >
            <span class="mt-0.5 flex h-4 w-4 flex-none items-center justify-center">
              <CheckCircleIcon
                v-if="step.state === 'done'"
                class="text-success h-4 w-4"
              />
              <span
                v-else-if="step.state === 'active'"
                class="loading loading-spinner text-primary h-3.5 w-3.5"
              ></span>
              <XCircleIcon
                v-else-if="step.state === 'failed'"
                class="text-error h-4 w-4"
              />
              <span
                v-else
                class="border-base-content/30 h-2.5 w-2.5 rounded-full border"
              ></span>
            </span>
            <div class="min-w-0 flex-1 leading-5">
              <div
                :class="[
                  'font-medium',
                  step.state === 'active'
                    ? 'text-primary'
                    : step.state === 'done'
                      ? 'text-base-content'
                      : step.state === 'failed'
                        ? 'text-error'
                        : 'text-base-content/60',
                ]"
              >
                {{ $t(step.labelKey) }}
              </div>
              <div class="text-base-content/55 text-[11px] leading-4">
                {{ $t(step.descKey) }}
              </div>
            </div>
          </li>
        </ol>

        <div
          v-if="isRunning && statusMessage"
          class="border-base-content/10 text-base-content/75 mt-3 border-t pt-2 text-xs break-words"
        >
          {{ statusMessage }}
        </div>

        <div
          v-if="isRunning && safeRestartConsecutivePollErrors > 0"
          class="text-warning mt-2 flex items-center gap-1.5 text-xs"
        >
          <span class="loading loading-dots loading-xs"></span>
          <span>
            {{
              $t('safeRestartPollRetrying', {
                count: safeRestartConsecutivePollErrors,
              })
            }}
          </span>
        </div>
      </div>

      <!-- Error Details -->
      <div
        v-if="hasError && !isRunning"
        class="border-error/30 bg-error/10 text-error flex flex-col gap-2 rounded-lg border px-3.5 py-3 text-xs"
      >
        <div class="flex items-start gap-2">
          <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 flex-none" />
          <div class="min-w-0 flex-1 break-words">
            <div class="font-semibold">{{ $t('safeRestartFailedTitle') }}</div>
            <div class="mt-0.5 leading-5">{{ errorText }}</div>
          </div>
        </div>

        <div v-if="logTail">
          <button
            type="button"
            class="btn btn-ghost btn-xs text-error px-1"
            @click="showLogs = !showLogs"
          >
            {{ showLogs ? $t('safeRestartHideLogs') : $t('safeRestartShowLogs') }}
          </button>
          <pre
            v-if="showLogs"
            class="bg-base-300/80 text-base-content mt-1.5 max-h-44 overflow-auto rounded-md p-2.5 font-mono text-[11px] leading-4 break-all whitespace-pre-wrap"
            >{{ logTail }}</pre>
        </div>
      </div>

      <!-- Optional log viewer when non-failed status still carries log_tail -->
      <div
        v-else-if="logTail && !isIdle"
        class="flex flex-col gap-1"
      >
        <button
          type="button"
          class="btn btn-ghost btn-xs self-start px-1"
          @click="showLogs = !showLogs"
        >
          {{ showLogs ? $t('safeRestartHideLogs') : $t('safeRestartShowLogs') }}
        </button>
        <pre
          v-if="showLogs"
          class="bg-base-200 text-base-content max-h-40 overflow-auto rounded-md p-2.5 font-mono text-[11px] leading-4 break-all whitespace-pre-wrap"
          >{{ logTail }}</pre>
      </div>

      <!-- Fail-Closed Emergency Unlock Inline Confirmation -->
      <div
        v-if="confirmingUnlock && isKillSwitchActive && !isRunning"
        class="border-warning/50 bg-warning/10 flex flex-col gap-2.5 rounded-lg border p-3 text-xs"
      >
        <div class="text-warning flex items-start gap-2 font-semibold">
          <ExclamationTriangleIcon class="mt-0.5 h-4 w-4 flex-none" />
          <span>{{ $t('safeRestartUnlockConfirmTitle') }}</span>
        </div>
        <p class="text-base-content/80 leading-5">
          {{ $t('safeRestartUnlockConfirmDesc') }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-xs"
            :disabled="isUnlocking"
            @click="confirmingUnlock = false"
          >
            {{ $t('cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-error btn-xs"
            :disabled="isUnlocking"
            @click="handleConfirmUnlock"
          >
            <span
              v-if="isUnlocking"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('safeRestartUnlockConfirmAction') }}
          </button>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <template v-if="isRunning">
          <div class="text-base-content/60 mr-auto flex items-center gap-2 text-xs">
            <span class="loading loading-spinner loading-xs"></span>
            <span>{{ $t('safeRestartDoNotClose') }}</span>
          </div>
        </template>

        <template v-else-if="isKillSwitchActive">
          <button
            v-if="!confirmingUnlock"
            type="button"
            class="btn btn-error btn-outline btn-sm mr-auto"
            :disabled="isActionBusy"
            @click="confirmingUnlock = true"
          >
            {{ $t('safeRestartEmergencyUnlock') }}
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="isActionBusy"
            @click="modalValue = false"
          >
            {{ $t('close') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="isActionBusy"
            @click="handleStartRestart"
          >
            <span
              v-if="isStarting"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('safeRestartRetry') }}
          </button>
        </template>

        <template v-else-if="isDone">
          <button
            type="button"
            class="btn btn-ghost btn-sm mr-auto"
            :disabled="isActionBusy || safeRestartReconnecting"
            @click="handlePreflight"
          >
            <span
              v-if="isPreflighting"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('safeRestartPreflightOnly') }}
          </button>
          <button
            v-if="!safeRestartReconnected && !safeRestartReconnecting"
            type="button"
            class="btn btn-sm"
            @click="reconnectAfterSafeRestart"
          >
            {{ $t('retry') }}
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="isActionBusy || safeRestartReconnecting"
            @click="handleStartRestart"
          >
            <span
              v-if="isStarting"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('safeRestartStartAction') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="safeRestartReconnecting"
            @click="modalValue = false"
          >
            {{ $t('close') }}
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="btn btn-ghost btn-sm mr-auto"
            :disabled="isActionBusy"
            @click="handlePreflight"
          >
            <span
              v-if="isPreflighting"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ $t('safeRestartPreflightOnly') }}
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="isActionBusy"
            @click="modalValue = false"
          >
            {{ $t('cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="isActionBusy"
            @click="handleStartRestart"
          >
            <span
              v-if="isStarting"
              class="loading loading-spinner loading-xs"
            ></span>
            {{
              isAutoUnlockedFailure
                ? $t('safeRestartPreflightAndRetry')
                : isFailed
                  ? $t('safeRestartRetry')
                  : $t('safeRestartStartAction')
            }}
          </button>
        </template>
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import {
  isKillSwitchActive,
  isSafeRestartRunning,
  killSwitchMaxSec,
  reconnectAfterSafeRestart,
  runPreflightCheck,
  safeRestartActionPending,
  safeRestartClientError,
  safeRestartCompletedInSession,
  safeRestartConsecutivePollErrors,
  safeRestartPreflightPassed,
  safeRestartReconnected,
  safeRestartReconnecting,
  safeRestartStatus,
  startSafeRestart,
  stopSafeRestartPolling,
  unlockKillSwitch,
  type SafeRestartPhase,
} from '@/assembly/safe-restart'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type StepState = 'pending' | 'active' | 'done' | 'failed'

const STEP_DEFS: ReadonlyArray<{
  key: Exclude<SafeRestartPhase, 'idle' | 'done' | 'failed'>
  labelKey: string
  descKey: string
}> = [
  {
    key: 'preflight',
    labelKey: 'safeRestartStepPreflight',
    descKey: 'safeRestartStepPreflightDesc',
  },
  {
    key: 'killswitch_on',
    labelKey: 'safeRestartStepKillSwitchOn',
    descKey: 'safeRestartStepKillSwitchOnDesc',
  },
  {
    key: 'restarting',
    labelKey: 'safeRestartStepRestarting',
    descKey: 'safeRestartStepRestartingDesc',
  },
  {
    key: 'verifying',
    labelKey: 'safeRestartStepVerifying',
    descKey: 'safeRestartStepVerifyingDesc',
  },
  {
    key: 'killswitch_off',
    labelKey: 'safeRestartStepKillSwitchOff',
    descKey: 'safeRestartStepKillSwitchOffDesc',
  },
]

const modalValue = defineModel<boolean>()
const isReady = ref(false)
const showLogs = ref(false)
const confirmingUnlock = ref(false)
const localTickSeconds = ref(0)
let tickTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  isReady.value = true
})

const clearTickTimer = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = undefined
  }
}

onBeforeUnmount(() => {
  clearTickTimer()
  stopSafeRestartPolling()
})

const status = computed(() => safeRestartStatus.value)
const isRunning = computed(() => isSafeRestartRunning.value)
const isDone = computed(() => status.value?.state === 'done' && safeRestartCompletedInSession.value)
const isFailed = computed(() => status.value?.state === 'failed')
const isAutoUnlockedFailure = computed(
  () => isFailed.value && status.value?.auto_unlocked === true && !isKillSwitchActive.value,
)
const isPreflightAborted = computed(
  () =>
    isFailed.value &&
    !status.value?.auto_unlocked &&
    !isKillSwitchActive.value &&
    (status.value?.phase === 'preflight' || status.value?.momo_running === true),
)
const isIdle = computed(
  () =>
    !status.value ||
    status.value.state === 'idle' ||
    (status.value.state === 'done' && !safeRestartCompletedInSession.value),
)

const isPreflighting = computed(() => safeRestartActionPending.value === 'preflight')
const isStarting = computed(() => safeRestartActionPending.value === 'restart')
const isUnlocking = computed(() => safeRestartActionPending.value === 'unlock')
const isActionBusy = computed(() => safeRestartActionPending.value !== 'idle')
const isLockedOpen = computed(() => isRunning.value || isStarting.value || isUnlocking.value)

const statusMessage = computed(() => status.value?.message || '')
const logTail = computed(() => status.value?.log_tail?.trim() || '')
const errorText = computed(() => status.value?.error || safeRestartClientError.value || '')
const hasError = computed(() => isFailed.value || Boolean(errorText.value))

const displayElapsed = computed(() => {
  if (isIdle.value) return 0
  const serverElapsed = status.value?.elapsed_sec ?? 0
  if (isRunning.value) {
    return Math.max(serverElapsed, localTickSeconds.value)
  }
  return serverElapsed
})

const activePhaseIndex = computed(() => {
  const phase = status.value?.phase
  if (!phase) return -1
  return STEP_DEFS.findIndex((step) => step.key === phase)
})

const steps = computed(() => {
  const state = status.value?.state ?? 'idle'
  const currentIdx = activePhaseIndex.value

  return STEP_DEFS.map((step, index) => {
    let stepState: StepState = 'pending'

    if (isDone.value) {
      stepState = 'done'
    } else if (state === 'running') {
      if (currentIdx > index) stepState = 'done'
      else if (currentIdx === index) stepState = 'active'
      else stepState = 'pending'
    } else if (state === 'failed') {
      if (isAutoUnlockedFailure.value) {
        if (index <= 1 || index === 4) {
          stepState = 'done'
        } else if (index === 2) {
          stepState = status.value?.momo_running ? 'done' : 'failed'
        } else if (index === 3) {
          stepState = status.value?.momo_running ? 'failed' : 'pending'
        }
      } else if (currentIdx >= 0) {
        if (index < currentIdx) stepState = 'done'
        else if (index === currentIdx) stepState = 'failed'
      } else if (isKillSwitchActive.value) {
        // Failed after kill-switch engaged but phase reported as generic 'failed'
        if (index <= 1) stepState = 'done'
        else if (index === 2) stepState = 'failed'
      } else {
        if (index === 0) stepState = 'failed'
      }
    }

    return {
      ...step,
      state: stepState,
    }
  })
})

watch(
  [modalValue, isRunning],
  ([open, running]) => {
    clearTickTimer()
    if (open && running) {
      confirmingUnlock.value = false
      localTickSeconds.value = status.value?.elapsed_sec ?? 0
      tickTimer = setInterval(() => {
        localTickSeconds.value += 1
      }, 1000)
    } else {
      localTickSeconds.value = 0
    }
  },
  { immediate: true },
)

watch(hasError, (errored) => {
  if (errored && logTail.value) {
    showLogs.value = true
  }
})

watch(modalValue, (open) => {
  if (!open) {
    confirmingUnlock.value = false
    showLogs.value = false
    safeRestartCompletedInSession.value = false
    clearTickTimer()
    stopSafeRestartPolling()
  }
})

const handlePreflight = () => {
  confirmingUnlock.value = false
  void runPreflightCheck()
}

const handleStartRestart = () => {
  confirmingUnlock.value = false
  void startSafeRestart()
}

const handleConfirmUnlock = async () => {
  await unlockKillSwitch()
  confirmingUnlock.value = false
}
</script>
