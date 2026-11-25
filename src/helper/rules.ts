import { Core, core } from '@/assembly/backend'
import { activeConnections, disconnectById } from '@/assembly/connections'
import { fetchRules, ruleProviderList, toggleRuleDisabled } from '@/assembly/rules'
import { getConnectionRulePayload } from '@/helper'
import { formatSingboxRule } from '@/helper/singbox-rules'
import { disconnectOnRuleDisable } from '@/store/settings'
import type { Rule } from '@/types'

export const isRuleDisabled = (rule: Rule) => {
  if (rule.extra) {
    return rule.extra.disabled
  }

  return rule.disabled
}

export const getRuleSetProviderName = (rule: Rule): string | null => {
  if (rule.type === 'RuleSet') {
    return rule.payload
  }

  if (core.value === Core.Singbox) {
    return formatSingboxRule(rule).singleRuleSet ?? null
  }

  return null
}

export const getRuleSize = (rule: Rule) => {
  const providerName = getRuleSetProviderName(rule)
  if (providerName) {
    return ruleProviderList.value.find((provider) => provider.name === providerName)?.ruleCount
  }

  return rule.size
}

export const isUpdateableRuleSet = (rule: Rule) => {
  const providerName = getRuleSetProviderName(rule)
  if (!providerName) {
    return false
  }

  const provider = ruleProviderList.value.find((provider) => provider.name === providerName)

  if (!provider) {
    return false
  }

  return provider.vehicleType.toLowerCase() !== 'inline'
}

export const toggleRuleDisabledWithSideEffects = async (rule: Rule) => {
  const willBeDisabled = !isRuleDisabled(rule)

  await toggleRuleDisabled(rule, willBeDisabled)

  if (willBeDisabled && disconnectOnRuleDisable.value) {
    const matchingConnections = activeConnections.value.filter((conn) => {
      const ruleTypeMatches = conn.rule === rule.type
      const rulePayloadMatches = getConnectionRulePayload(conn) === (rule.payload || '')

      return ruleTypeMatches && rulePayloadMatches
    })

    matchingConnections.forEach((conn) => disconnectById(conn.id).catch(() => {}))
  }

  await fetchRules()
}

export const EMPTY_CELL = '—'

export const formatRuleHitCount = (count: number | undefined) =>
  count ? count.toLocaleString() : EMPTY_CELL
