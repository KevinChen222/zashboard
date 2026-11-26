import dayjs from 'dayjs'

export const isValidTimestamp = (
  timestamp?: string | number | null,
): timestamp is string | number => {
  if (timestamp === null || timestamp === undefined || timestamp === '' || timestamp === 0) {
    return false
  }

  if (typeof timestamp === 'number' && !Number.isFinite(timestamp)) {
    return false
  }

  const parsed = dayjs(timestamp)

  // Guard against Go zero-value time (0001-01-01T00:00:00Z, which may shift to year 0 in UTC- timezones)
  return parsed.isValid() && parsed.year() > 1
}

export const getTimestampValue = (timestamp?: string | number | null): number => {
  if (!isValidTimestamp(timestamp)) {
    return 0
  }

  return dayjs(timestamp).valueOf()
}
