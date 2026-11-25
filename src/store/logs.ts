import { useStorage } from '@/composables/use-storage'
import { getSingboxConnectionId } from '@/helper/singbox-log-core'
import { ref } from 'vue'

export const logFilter = ref('')
export const logTypeFilter = ref('')
export const logFilterRegex = useStorage<string>('config/log-filter-regex', '')
export const logFilterEnabled = useStorage<boolean>('config/log-filter-enabled', false)
export const singboxSimplifyInfoLogs = useStorage<boolean>(
  'config/singbox-simplify-info-logs',
  true,
)

export const getLogConnectionID = (payload: string) => {
  return getSingboxConnectionId(payload)
}
