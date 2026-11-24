<template>
  <SettingItem
    v-if="settingKey"
    :setting-key="settingKey"
  >
    <div class="setting-item-label">
      {{ $t('proxyDetourMappings') }}
      <template v-if="proxyDetourList.length"> ({{ proxyDetourList.length }}) </template>
    </div>
    <button
      class="btn btn-sm"
      @click="dialogVisible = true"
    >
      <PencilSquareIcon class="h-4 w-4" />
    </button>
  </SettingItem>

  <DialogWrapper
    v-model="dialogVisible"
    :title="$t('proxyDetourMappings')"
  >
    <div class="flex flex-col gap-2 text-sm">
      <div class="flex items-center justify-between gap-2">
        <span class="text-base-content/60 text-xs">
          {{ $t('proxyDetourMappingsTip') }}
        </span>
        <button
          v-if="detectedPairs.length"
          type="button"
          class="btn btn-xs btn-soft shrink-0"
          @click="handlerImportAutoDetected"
        >
          <SparklesIcon class="h-3.5 w-3.5" />
          {{ $t('autoDetectDetourImport') }} ({{ detectedPairs.length }})
        </button>
      </div>

      <div class="border-base-content/10 rounded-box border border-dashed p-2.5">
        <div class="flex w-full flex-col gap-1.5">
          <div class="flex w-full items-center gap-2">
            <TagIcon class="h-4 w-4 shrink-0" />
            <TextInput
              v-model="newRule.match"
              class="min-w-0 flex-1"
              :menus="matchSuggestions"
              :placeholder="$t('proxyDetourMatchPlaceholder')"
              @keydown.enter="handlerRuleAdd"
            />
            <button
              class="btn btn-circle btn-sm"
              @click="handlerRuleAdd"
            >
              <PlusIcon class="h-4 w-4" />
            </button>
          </div>
          <div class="flex w-full items-center gap-2">
            <ArrowRightCircleIcon class="text-base-content/40 h-4 w-4 shrink-0" />
            <TextInput
              v-model="newRule.detour"
              class="min-w-0 flex-1"
              :menus="detourSuggestions"
              :placeholder="$t('proxyDetourTargetPlaceholder')"
              @keydown.enter="handlerRuleAdd"
            />
          </div>
        </div>
      </div>

      <Draggable
        v-if="dialogVisible"
        v-model="proxyDetourList"
        class="flex flex-1 flex-col gap-2"
        group="detour-list"
        :animation="150"
        :handle="'.drag-handle'"
        :item-key="'id'"
      >
        <template #item="{ element: rule }">
          <div class="border-base-content/10 rounded-box border p-2.5">
            <div class="flex w-full flex-col gap-1.5">
              <div class="flex w-full items-center gap-2">
                <ChevronUpDownIcon class="drag-handle h-4 w-4 shrink-0 cursor-grab" />
                <TextInput
                  :model-value="rule.match"
                  class="min-w-0 flex-1"
                  :menus="matchSuggestions"
                  :placeholder="$t('proxyDetourMatchPlaceholder')"
                  @update:model-value="(value) => handlerRuleUpdate(rule.id, { match: value })"
                />
                <button
                  class="btn btn-circle btn-ghost btn-sm"
                  @click="handlerRuleRemove(rule.id)"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
              <div class="flex w-full items-center gap-2">
                <ArrowRightCircleIcon class="text-base-content/40 h-4 w-4 shrink-0" />
                <TextInput
                  :model-value="rule.detour"
                  class="min-w-0 flex-1"
                  :menus="detourSuggestions"
                  :placeholder="$t('proxyDetourTargetPlaceholder')"
                  @update:model-value="(value) => handlerRuleUpdate(rule.id, { detour: value })"
                />
              </div>
            </div>
          </div>
        </template>
      </Draggable>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { proxyGroupList, proxyMap, proxyProviederList } from '@/assembly/proxies'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import TextInput from '@/components/common/TextInput.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { detectAutoDetourPairs } from '@/helper/detour-chain'
import { proxyDetourList } from '@/store/settings'
import type { ProxyDetourRule } from '@/types'
import {
  ArrowRightCircleIcon,
  ChevronUpDownIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TagIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { uniq } from 'lodash'
import { v4 as uuid } from 'uuid'
import { computed, ref } from 'vue'
import Draggable from 'vuedraggable'

defineProps<{
  settingKey?: string
}>()

const dialogVisible = ref(false)
const newRule = ref<{ match: string; detour: string }>({
  match: '',
  detour: '',
})

const matchSuggestions = computed(() => {
  const prefixes = Object.keys(proxyMap.value)
    .map((name) => {
      const idx = name.indexOf('/')
      return idx > 0 ? name.slice(0, idx) : ''
    })
    .filter(Boolean)

  return uniq([...proxyProviederList.value.map((provider) => provider.name), ...prefixes]).sort()
})

const detourSuggestions = computed(() => {
  return uniq([...proxyGroupList.value, ...Object.keys(proxyMap.value)])
})

const detectedPairs = computed(() => {
  const existing = new Set(proxyDetourList.value.map((item) => item.match.trim()))
  return detectAutoDetourPairs(proxyMap.value, proxyProviederList.value).filter(
    (pair) => !existing.has(pair.match),
  )
})

const handlerRuleAdd = () => {
  const match = newRule.value.match.trim()
  const detour = newRule.value.detour.trim()
  if (!match || !detour) return

  proxyDetourList.value.push({
    id: uuid(),
    match,
    detour,
  })
  newRule.value = { match: '', detour: '' }
}

const handlerRuleRemove = (id: string) => {
  const index = proxyDetourList.value.findIndex((item) => item.id === id)
  if (index !== -1) {
    proxyDetourList.value.splice(index, 1)
  }
}

const handlerRuleUpdate = (id: string, patch: Partial<ProxyDetourRule>) => {
  const index = proxyDetourList.value.findIndex((item) => item.id === id)
  if (index === -1) return

  proxyDetourList.value[index] = {
    ...proxyDetourList.value[index],
    ...patch,
  }
}

const handlerImportAutoDetected = () => {
  for (const pair of detectedPairs.value) {
    proxyDetourList.value.push({
      id: uuid(),
      match: pair.match,
      detour: pair.detour,
    })
  }
}
</script>
