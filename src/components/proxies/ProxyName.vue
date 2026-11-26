<template>
  <div class="flex shrink-0 items-center">
    <ProxyIcon
      v-if="icon"
      :icon="icon"
      :margin="iconMargin"
      :size="iconSize"
    />
    <HighlightText
      v-if="filter"
      :text="displayName"
      :filter="filter"
    />
    <template v-else>{{ displayName }}</template>
    <span
      v-if="displayDialerProxy"
      class="ml-1 inline-flex shrink-0 items-center gap-1 text-[0.85em] opacity-80"
    >
      <span class="italic">via</span>
      <HighlightText
        v-if="filter"
        :text="displayDialerProxy"
        :filter="filter"
      />
      <template v-else>{{ displayDialerProxy }}</template>
    </span>
  </div>
</template>

<script setup lang="ts">
import HighlightText from '@/components/common/HighlightText.vue'
import { proxyMap } from '@/assembly/proxies'
import { getEffectiveDialerProxy } from '@/helper/detour-chain'
import { getDisplayProxyName } from '@/helper/proxy-display'
import { computed } from 'vue'
import ProxyIcon from './ProxyIcon.vue'

const props = withDefaults(
  defineProps<{
    name: string
    iconSize?: number
    iconMargin?: number
    filter?: string
  }>(),
  {
    iconSize: 16,
    iconMargin: 4,
    filter: '',
  },
)

const node = computed(() => proxyMap.value[props.name])
const displayName = computed(() => getDisplayProxyName(props.name))
const icon = computed(() => {
  return node.value?.icon
})
const dialerProxy = computed(() => {
  return getEffectiveDialerProxy(props.name)
})
const displayDialerProxy = computed(() => {
  return dialerProxy.value ? getDisplayProxyName(dialerProxy.value) : ''
})
</script>
