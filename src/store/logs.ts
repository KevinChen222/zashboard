import { useStorage } from '@/composables/use-storage'
import { ref } from 'vue'

export const logFilter = ref('')
export const logTypeFilter = ref('')
export const logFilterRegex = useStorage<string>('config/log-filter-regex', '')
export const logFilterEnabled = useStorage<boolean>('config/log-filter-enabled', false)

const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g

export const getLogConnectionID = (payload: string) => {
  return payload.replace(ANSI_ESCAPE_REGEX, '').match(/^\[(\d+)\s[^\]]*\]/)?.[1] ?? null
}
