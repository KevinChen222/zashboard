<template>
  <div :class="{ 'opacity-50': isDisabled }">
    <div
      class="transparent-collapse collapse rounded-none!"
      :class="isExpanded ? 'collapse-open' : 'collapse-close'"
    >
      <div
        class="collapse-title hover:bg-base-200/40 flex min-h-0 flex-col gap-1.5 overflow-hidden px-3 py-2.5 text-sm transition-colors"
        :class="{
          'cursor-pointer': isSelectable,
        }"
        @click="clickHandler"
      >
        <div class="min-h-5 leading-5">
          <span class="text-base-content/50 text-xs tabular-nums">
            {{ index }}
          </span>
          <span class="text-base-content/55 ml-4 text-xs tracking-wide">
            <HighlightText
              :text="displayType"
              :filter="rulesFilter"
            />
            <template v-if="displayPayload"> : </template>
          </span>
          <span
            class="ml-2"
            v-if="displayPayload"
          >
            <HighlightText
              :text="displayPayload"
              :filter="rulesFilter"
            />
          </span>
          <span
            v-if="typeof size === 'number' && size !== -1"
            class="text-base-content/50 ml-1 text-xs tabular-nums"
          >
            ({{ size }})
            <QuestionMarkCircleIcon
              v-if="size === 0"
              class="-mt-1 ml-1 inline-block h-4 w-4"
              @mouseenter="showMMDBSizeTip"
            />
          </span>
          <button
            v-if="isUpdateableRuleSet"
            :class="
              twMerge(
                'btn btn-circle btn-ghost btn-xs -mt-[2px] ml-1',
                isUpdating ? 'animate-spin' : '',
              )
            "
            @click.stop="updateRuleProviderClickHandler"
          >
            <ArrowPathIcon class="h-3.5 w-3.5 opacity-60" />
          </button>
          <InformationCircleIcon
            v-if="rule.extra"
            class="-mt-[2px] ml-1 inline-block h-4 w-4 opacity-60"
            @mouseenter="showRuleHitTip($event, rule)"
            @click.stop
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-if="rule.uuid || rule.extra"
            type="checkbox"
            class="toggle"
            :checked="!isDisabled"
            @change="toggleRuleDisabledHandler"
            @click.stop
          />
          <template v-if="singboxFormatted && !singboxFormatted.isProxyTarget">
            <span
              v-if="singboxFormatted.actionLabel"
              class="badge badge-sm badge-soft font-mono text-xs"
            >
              <HighlightText
                :text="singboxFormatted.actionLabel"
                :filter="rulesFilter"
              />
            </span>
            <span
              v-if="singboxFormatted.optionsLabel"
              class="text-base-content/60 text-xs"
            >
              <HighlightText
                :text="singboxFormatted.optionsLabel"
                :filter="rulesFilter"
              />
            </span>
          </template>
          <template v-else>
            <ProxyChainPath
              :proxy="rule.proxy"
              :selected="selected"
              :collapsed="isCollapsed"
              :show-now-node="displayNowNodeInRule"
              :show-latency="displayLatencyInRule"
              :filter="rulesFilter"
              :interactive="!isCollapsed"
              @update:selected="selected = $event"
            />
            <span
              v-if="singboxFormatted?.actionLabel"
              class="badge badge-xs badge-soft font-mono"
            >
              {{ singboxFormatted.actionLabel }}
            </span>
            <span
              v-if="singboxFormatted?.optionsLabel"
              class="badge badge-xs badge-ghost text-base-content/60 font-mono"
            >
              {{ singboxFormatted.optionsLabel }}
            </span>
          </template>
        </div>
      </div>

      <div
        class="collapse-content p-0"
        @transitionend="handlerExpandTransitionEnd"
      >
        <template v-if="showExpandedContent">
          <div class="border-base-border border-b"></div>
          <ProxyGroup
            :name="selected"
            :force-open="true"
            class="transparent-collapse bg-base-200/30"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { rulesFilter } from '@/store/rules'
import { useBounceOnVisible } from '@/composables/use-bounce-on-visible'
import { useRuleHitTooltip } from '@/composables/use-rule-hit-tooltip'
import {
  getRuleSetProviderName,
  getRuleSize,
  isRuleDisabled,
  isUpdateableRuleSet as checkUpdateableRuleSet,
  toggleRuleDisabledWithSideEffects,
} from '@/helper/rules'
import { formatSingboxRule } from '@/helper/singbox-rules'
import { notifyRequestError } from '@/helper/request-error'
import { useTooltip } from '@/composables/use-tooltip'
import { proxyGroupList } from '@/assembly/proxies'
import { fetchRules, updateRuleProvider } from '@/assembly/rules'
import { displayLatencyInRule, displayNowNodeInRule } from '@/store/settings'
import type { Rule } from '@/types'
import {
  ArrowPathIcon,
  InformationCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline'
import { twMerge } from 'tailwind-merge'
import type { Ref } from 'vue'
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import HighlightText from '../common/HighlightText.vue'
import ProxyChainPath from '../common/ProxyChainPath.vue'
import ProxyGroup from '../proxies/ProxyGroup.vue'

const props = defineProps<{
  rule: Rule
  index: number
}>()

const expandedRule = inject<Ref<string | null>>('expandedRule', ref(null))
const ruleKey = computed(() => `${props.index}-${props.rule.payload}`)
const isCollapsed = computed(() => expandedRule.value !== ruleKey.value)
const isSelectable = computed(() => proxyGroupList.value.includes(props.rule.proxy))
const selected = ref('')

const isExpanded = computed(() => isSelectable.value && !isCollapsed.value)
const showExpandedContent = ref(isExpanded.value)

watch(isExpanded, (value) => {
  if (value) {
    showExpandedContent.value = true
  }
})

const handlerExpandTransitionEnd = () => {
  if (!isExpanded.value) {
    showExpandedContent.value = false
  }
}

const { t } = useI18n()
const { showTip } = useTooltip()
const { showRuleHitTip } = useRuleHitTooltip()

const singboxFormatted = computed(() =>
  can('singboxRulesFormat') ? formatSingboxRule(props.rule) : null,
)
const displayType = computed(() => singboxFormatted.value?.displayType ?? props.rule.type)
const displayPayload = computed(() => singboxFormatted.value?.displayPayload ?? props.rule.payload)

const size = computed(() => getRuleSize(props.rule))

const isUpdating = ref(false)
const isTogglingDisabled = ref(false)
const isDisabled = computed(() => isRuleDisabled(props.rule))

const isUpdateableRuleSet = computed(() => checkUpdateableRuleSet(props.rule))

const updateRuleProviderClickHandler = async () => {
  if (isUpdating.value) return

  const providerName = getRuleSetProviderName(props.rule) || props.rule.payload
  isUpdating.value = true
  try {
    await updateRuleProvider(providerName)
    await fetchRules()
  } catch (e) {
    notifyRequestError(e)
  } finally {
    isUpdating.value = false
  }
}

const toggleRuleDisabledHandler = async () => {
  if (isTogglingDisabled.value) return

  try {
    isTogglingDisabled.value = true
    await toggleRuleDisabledWithSideEffects(props.rule)
  } catch (e) {
    notifyRequestError(e)
  } finally {
    isTogglingDisabled.value = false
  }
}

const showMMDBSizeTip = (e: Event) => {
  showTip(e, t('mmdbSizeTip'))
}

const clickHandler = () => {
  if (isSelectable.value && !props.rule.disabled) {
    expandedRule.value = isCollapsed.value ? ruleKey.value : null
    selected.value = props.rule.proxy
  }
}

useBounceOnVisible()
</script>
