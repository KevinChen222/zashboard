<template>
  <DialogWrapper
    v-model="isOpen"
    :title="$t('overviewCardSettings')"
  >
    <div class="flex flex-col text-sm">
      <Draggable
        v-model="orderedCards"
        :animation="150"
        ghost-class="ghost"
        handle=".drag-handle"
        :item-key="(card: string) => card"
      >
        <template #item="{ element: cardKey }">
          <div class="setting-item mb-2">
            <Bars3Icon class="drag-handle text-base-content/50 h-5 w-5 shrink-0 cursor-move" />
            <div class="setting-item-label">
              {{ $t(cardKeyToLabelMap[cardKey.card] || cardKey.card) }}
            </div>
            <input
              type="checkbox"
              class="toggle"
              :checked="cardKey.visible"
              @change="cardKey.visible = !cardKey.visible"
            />
          </div>
        </template>
      </Draggable>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { rules } from '@/assembly/rules'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import { OVERVIEW_CARD } from '@/constant'
import { overviewCardOrder } from '@/store/settings'
import { Bars3Icon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import Draggable from 'vuedraggable'

const isOpen = defineModel<boolean>({ required: true })

const cardKeyToLabelMap: Record<string, string> = {
  ChartsCard: 'chartsCard',
  NetworkCard: 'networkCard',
  ProviderTrafficOverview: 'providerTrafficOverview',
  TopologyCharts: 'topologyCharts',
  EarthGlobeCard: 'earthGlobeCard',
  ConnectionHistory: 'connectionHistory',
  RuleHitCountCard: 'ruleHitCountCard',
  HonkStatsCard: 'honkStatsCard',
}

const isCardSupported = (card: OVERVIEW_CARD) => {
  if (card === OVERVIEW_CARD.RuleHitCountCard) {
    return can('ruleHitCount') || rules.value.some((rule) => rule.extra)
  }

  if (card === OVERVIEW_CARD.HonkStatsCard) {
    return can('runtimeStats')
  }

  return true
}

const orderedCards = computed({
  get: () => overviewCardOrder.value.filter((item) => isCardSupported(item.card)),
  set: (newOrder: { card: OVERVIEW_CARD; visible: boolean }[]) => {
    const visibleCards = new Set(newOrder.map((item) => item.card))
    const preservedHidden = overviewCardOrder.value.filter((item) => !visibleCards.has(item.card))
    overviewCardOrder.value = [...newOrder, ...preservedHidden]
  },
})
</script>

<style scoped>
.ghost {
  opacity: 0.5;
}
</style>
