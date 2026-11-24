<template>
  <div class="text-sm">
    <template v-if="hasVisibleDisplayItems">
      <div class="settings-section-label">{{ $t('settingsSectionConnectionDisplay') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.connectionStyle">
          <div class="setting-item-label">{{ $t('connectionStyle') }}</div>
          <SelectInput
            v-model="connectionDisplayStyle"
            class="select select-sm min-w-24"
            :options="[
              { value: CONNECTION_DISPLAY_STYLE.AUTO, label: $t('auto') },
              { value: CONNECTION_DISPLAY_STYLE.CARD, label: $t('card') },
              { value: CONNECTION_DISPLAY_STYLE.TABLE, label: $t('table') },
            ]"
          />
        </SettingItem>
        <SettingItem :setting-key="k.proxyChainDirection">
          <div class="setting-item-label">{{ $t('proxyChainDirection') }}</div>
          <SelectInput
            v-model="proxyChainDirection"
            class="select select-sm w-24"
            :options="
              Object.values(PROXY_CHAIN_DIRECTION).map((value) => ({
                value,
                label: $t(value),
              }))
            "
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.tableWidthMode"
          :when="!isConnectionCard"
        >
          <div class="setting-item-label">{{ $t('tableWidthMode') }}</div>
          <SelectInput
            v-model="tableWidthMode"
            class="select select-sm min-w-24"
            :options="Object.values(TABLE_WIDTH_MODE).map((value) => ({ value, label: $t(value) }))"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.tableSize"
          :when="!isConnectionCard"
        >
          <div class="setting-item-label">{{ $t('tableSize') }}</div>
          <SelectInput
            v-model="tableSize"
            class="select select-sm min-w-24"
            :options="Object.values(TABLE_SIZE).map((value) => ({ value, label: $t(value) }))"
          />
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleIdentityItems">
      <div class="settings-section-label">{{ $t('settingsSectionClientIdentity') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.resolveClientHostname">
          <div class="setting-item-label">{{ $t('resolveClientHostname') }}</div>
          <input
            v-model="resolveClientHostname"
            type="checkbox"
            class="toggle"
          />
        </SettingItem>
        <SourceIPLabels :setting-key="k.sourceIPLabels" />
        <SettingItem :setting-key="k.showDetourInnerConnections">
          <div class="setting-item-label">
            {{ $t('showDetourInnerConnections') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('showDetourInnerConnectionsTip'))"
            />
          </div>
          <input
            v-model="showDetourInnerConnections"
            type="checkbox"
            class="toggle"
          />
        </SettingItem>
        <SettingItem :setting-key="k.autoDetectDetourByName">
          <div class="setting-item-label">
            {{ $t('autoDetectDetourByName') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('autoDetectDetourByNameTip'))"
            />
          </div>
          <input
            v-model="autoDetectDetourByName"
            type="checkbox"
            class="toggle"
          />
        </SettingItem>
        <ProxyDetourMappings :setting-key="k.proxyDetourMappings" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import SelectInput from '@/components/common/SelectInput.vue'
import ProxyDetourMappings from '@/components/settings/connections/ProxyDetourMappings.vue'
import SourceIPLabels from '@/components/settings/connections/SourceIPLabels.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useIsSettingVisible } from '@/composables/use-setting-visibility'
import { useTooltip } from '@/composables/use-tooltip'
import { CONNECTIONS_ITEM_KEYS } from '@/config/settings-items'
import {
  CONNECTION_DISPLAY_STYLE,
  PROXY_CHAIN_DIRECTION,
  TABLE_SIZE,
  TABLE_WIDTH_MODE,
} from '@/constant'
import {
  autoDetectDetourByName,
  connectionDisplayStyle,
  isConnectionCard,
  proxyChainDirection,
  resolveClientHostname,
  showDetourInnerConnections,
  tableSize,
  tableWidthMode,
} from '@/store/settings'
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const { showTip } = useTooltip()
const k = CONNECTIONS_ITEM_KEYS
const isVisibleConnectionStyle = useIsSettingVisible(k.connectionStyle)
const isVisibleProxyChain = useIsSettingVisible(k.proxyChainDirection)
const isVisibleTableWidth = useIsSettingVisible(k.tableWidthMode)
const isVisibleTableSize = useIsSettingVisible(k.tableSize)
const isVisibleResolveHostname = useIsSettingVisible(k.resolveClientHostname)
const isVisibleSourceLabels = useIsSettingVisible(k.sourceIPLabels)
const isVisibleShowDetourInner = useIsSettingVisible(k.showDetourInnerConnections)
const isVisibleAutoDetectDetour = useIsSettingVisible(k.autoDetectDetourByName)
const isVisibleProxyDetourMappings = useIsSettingVisible(k.proxyDetourMappings)

const hasVisibleDisplayItems = computed(
  () =>
    isVisibleConnectionStyle.value ||
    isVisibleProxyChain.value ||
    (!isConnectionCard.value && (isVisibleTableWidth.value || isVisibleTableSize.value)),
)
const hasVisibleIdentityItems = computed(
  () =>
    isVisibleResolveHostname.value ||
    isVisibleSourceLabels.value ||
    isVisibleShowDetourInner.value ||
    isVisibleAutoDetectDetour.value ||
    isVisibleProxyDetourMappings.value,
)
</script>
