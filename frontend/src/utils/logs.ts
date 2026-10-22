import type { LogEntry } from '@shared/types'

export interface LogGroup {
  log:   LogEntry   // newest entry in the run
  count: number
}

// Collapse runs of identical consecutive lines (same level, source and message)
export function collapseRepeats(logs: LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = []

  for (const log of logs) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last.log.level === log.level &&
      last.log.source === log.source &&
      last.log.message === log.message
    ) {
      last.count += 1
    } else {
      groups.push({ log, count: 1 })
    }
  }

  return groups
}
