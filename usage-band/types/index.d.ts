export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Measure = {
  limits: Limit[]
  contextPercent: number | null
}

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      measure: Shaped<Measure | null>
      tokens: Shaped<Tokens>
      fable: Shaped<Limit | null>
      speed: number | null
      minute: number
      dayTotal: number | null
      weekTotal: number | null
    }
  }
}
