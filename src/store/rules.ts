import { Core, core } from '@/assembly/backend'
import { proxyMap } from '@/assembly/proxies'
import { ruleProviderList, rules } from '@/assembly/rules'
import { RULE_TAB_TYPE } from '@/constant'
import { toSearchRegex } from '@/helper/search'
import { formatSingboxRule, splitSingboxRules } from '@/helper/singbox-rules'
import { computed, ref, watch } from 'vue'
import { activeBackend } from './setup'

export const rulesFilter = ref('')
export const rulesTabShow = ref(RULE_TAB_TYPE.RULES)

watch(activeBackend, (backend) => {
  if (backend) rulesTabShow.value = RULE_TAB_TYPE.RULES
})

const splitRules = computed(() => {
  if (core.value !== Core.Singbox) {
    return {
      routeRules: rules.value,
      dnsRules: [] as typeof rules.value,
    }
  }

  return splitSingboxRules(rules.value, new Set(Object.keys(proxyMap.value)))
})

export const routeRules = computed(() => splitRules.value.routeRules)
export const dnsRules = computed(() => splitRules.value.dnsRules)
export const hasSingboxDnsRules = computed(
  () => core.value === Core.Singbox && dnsRules.value.length > 0,
)

watch(hasSingboxDnsRules, (hasDns) => {
  if (!hasDns && rulesTabShow.value === RULE_TAB_TYPE.DNS) {
    rulesTabShow.value = RULE_TAB_TYPE.RULES
  }
})

export const activeTabRules = computed(() =>
  rulesTabShow.value === RULE_TAB_TYPE.DNS ? dnsRules.value : routeRules.value,
)

export const renderRules = computed(() => {
  const source = activeTabRules.value
  const searchRegex = toSearchRegex(rulesFilter.value)

  if (!searchRegex) {
    return source
  }

  const isSingbox = core.value === Core.Singbox

  return source.filter((rule) => {
    if (searchRegex.testAny([rule.type, rule.payload, rule.proxy, rule.rawProxy ?? ''])) {
      return true
    }

    if (isSingbox) {
      const formatted = formatSingboxRule(rule)
      return searchRegex.testAny([
        formatted.displayType,
        formatted.displayPayload,
        formatted.actionLabel ?? '',
        formatted.optionsLabel ?? '',
      ])
    }

    return false
  })
})

export const renderRulesProvider = computed(() => {
  const searchRegex = toSearchRegex(rulesFilter.value)

  if (!searchRegex) {
    return ruleProviderList.value
  }

  return ruleProviderList.value.filter((ruleProvider) => {
    return searchRegex.testAny([ruleProvider.name, ruleProvider.behavior, ruleProvider.vehicleType])
  })
})
