import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionCost,
  SessionContextUsage,
  SessionRateLimit,
  TurnUsage,
} from 'claude-code'

import type { Limit, Measure, Tokens } from '../types'

const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

// Change a shape tag when that value's fields change: a reload then reads
// what an earlier version stored as absent.
const measure = atom({ plugin: 'usage-band', key: 'measure' } as const, null, {
  shape: 'measure-2',
})
const tokens = atom({ plugin: 'usage-band', key: 'tokens' } as const, ZERO, {
  shape: 'tokens-1',
})
const speed = atom({ plugin: 'usage-band', key: 'speed' } as const, null)
const minute = atom({ plugin: 'usage-band', key: 'minute' } as const, 0)
const dayTotal = atom({ plugin: 'usage-band', key: 'dayTotal' } as const, null)
const weekTotal = atom({ plugin: 'usage-band', key: 'weekTotal' } as const, null)

const BLUE = '#3b82f6'
const AMBER = '#f59e0b'
const RED = '#ef4444'
// `spend:<day>` holds what every session spent that local day, kept for the
// rest of its Monday-to-Sunday week; `cost:` keys are an earlier version's,
// which counted a session's whole cost on one day.
const SPEND_PREFIX = 'spend:'
const OLD_PREFIX = 'cost:'
// A desktop reports the band's width in cells of its code font, at least 8px
// each, and sets the band's text in its UI font: there the row is measured in
// pixels. The band has measured at least 8.5px a reported cell, so the room is
// taken at that, while a bar is drawn 8px a cell.
const PX_PER_CELL = 8
const ROOM_PX_PER_CELL = 8.5
const GAP_PX = 9
// Bars grow into the room the chosen fit leaves, up to this many cells.
const MAX_BAR_CELLS = 8

type Snapshot = {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  cost?: SessionCost
}

type ChipId =
  | '5h'
  | '7d'
  | 'spend'
  | 'in'
  | 'out'
  | 'speed'
  | 'cache'
  | 'clock'
  | 'cost'
  | 'ctx'

type Part =
  | { kind: 'label'; text: string }
  | { kind: 'value'; text: string }
  | { kind: 'dim'; text: string }
  | { kind: 'bar'; pct: number; name: string }
  | { kind: 'clock' }

type Chip = { id: ChipId; parts: Part[] }

// One way to lay the band out; the first that fits the room is drawn.
type Fit = {
  chipGap: number
  barCells: number
  hasSeps: boolean
  hasReset: boolean
  hidden: ChipId[]
}

const FITS: Fit[] = [
  { chipGap: 2, barCells: 5, hasSeps: true, hasReset: true, hidden: [] },
  { chipGap: 1, barCells: 5, hasSeps: true, hasReset: true, hidden: [] },
  { chipGap: 1, barCells: 3, hasSeps: true, hasReset: true, hidden: [] },
  { chipGap: 1, barCells: 3, hasSeps: false, hasReset: true, hidden: [] },
  { chipGap: 1, barCells: 3, hasSeps: false, hasReset: true, hidden: ['clock'] },
  { chipGap: 1, barCells: 3, hasSeps: false, hasReset: true, hidden: ['clock', 'speed'] },
  { chipGap: 1, barCells: 3, hasSeps: false, hasReset: true, hidden: ['clock', 'speed', 'cache'] },
  { chipGap: 1, barCells: 3, hasSeps: false, hasReset: false, hidden: ['clock', 'speed', 'cache'] },
  {
    chipGap: 1,
    barCells: 3,
    hasSeps: false,
    hasReset: false,
    hidden: ['clock', 'speed', 'cache', 'in', 'out'],
  },
]
const TIGHTEST: Fit = {
  chipGap: 1,
  barCells: 0,
  hasSeps: false,
  hasReset: false,
  hidden: ['clock', 'speed', 'cache', 'in', 'out'],
}

type View = {
  fiveHour?: Limit
  sevenDay?: Limit
  spend?: Limit
  until: string | null
  fresh: number
  output: number
  tps: number | null
  cachePct: number | null
  now: number
  today: number | null
  week: number | null
  ctx: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')

const dayKey = (ms: number) => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// The day keys of `ms`'s week so far, today's first, back to Monday's.
const weekDays = (ms: number) => {
  const d = new Date(ms)
  const sinceMonday = (d.getDay() + 6) % 7

  return Array.from({ length: sinceMonday + 1 }, (_, i) =>
    dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime()),
  )
}

const clockText = (ms: number) => {
  const d = new Date(ms)

  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtTokens = (n: number) => {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(2)}k`
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`

  return `${(n / 1_000_000).toFixed(2)}M`
}

const fmtUsd = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

const fmtPct = (pct: number) => `${Math.round(pct)}%`

const fmtUntil = (resetsAt: string | undefined, now: number) => {
  if (resetsAt === undefined) return null
  const left = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  const days = Math.floor(left / 1440)
  const hours = Math.floor((left % 1440) / 60)
  const mins = left % 60
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${mins}m`

  return `${mins}m`
}

const barColor = (pct: number) => (pct >= 90 ? RED : pct >= 75 ? AMBER : BLUE)

const barSvg = (pct: number, width: number) => {
  const fill = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width)
  const color = barColor(pct)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="5" viewBox="0 0 ${width} 5">` +
    `<rect width="${width}" height="5" rx="2.5" fill="${BLUE}" fill-opacity="0.22"/>` +
    (fill > 0 ? `<rect width="${fill}" height="5" rx="2.5" fill="${color}"/>` : '') +
    `</svg>`
  )
}

const CLOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">' +
  '<circle cx="6" cy="6" r="5" fill="none" stroke="#9ca3af" stroke-width="1.2"/>' +
  '<path d="M6 3.2V6l1.9 1.2" fill="none" stroke="#9ca3af" stroke-width="1.2" stroke-linecap="round"/>' +
  '</svg>'

const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

// How one surface sizes the row: every width in the unit `room` is in.
type Metrics = {
  room: number
  gap: number
  sep: number
  clock: number
  bar: (cells: number) => number
  text: (text: string, isValue: boolean) => number
}

// Cells a text takes: CJK and fullwidth characters two, the rest one.
const cellsOf = (text: string) => {
  let n = 0
  for (const ch of text) n += WIDE.test(ch) ? 2 : 1

  return n
}

// Pixels a glyph takes in the desktop's UI font, rounded up: values are
// medium weight with tabular digits, labels regular.
const glyphPx = (ch: string, isValue: boolean) => {
  if (WIDE.test(ch) || ch === '—') return 14
  if ('.:, '.includes(ch)) return 4.5
  if (ch === '%') return 12.5
  if (isValue) return 9.5
  if ('iltjfr/'.includes(ch)) return 5
  if ('mwMW'.includes(ch)) return 12

  return 8
}

const textPx = (text: string, isValue: boolean) => {
  let n = 0
  for (const ch of text) n += glyphPx(ch, isValue)

  return n
}

const metricsFor = (isTerminal: boolean, columns: number): Metrics =>
  isTerminal
    ? { room: columns, gap: 1, sep: 1, clock: 2, bar: cells => cells, text: cellsOf }
    : {
        room: columns * ROOM_PX_PER_CELL,
        gap: GAP_PX,
        sep: 5,
        clock: 12,
        bar: cells => cells * PX_PER_CELL,
        text: textPx,
      }

const partSize = (p: Part, fit: Fit, m: Metrics) => {
  if (p.kind === 'bar') return m.bar(fit.barCells)
  if (p.kind === 'clock') return m.clock

  return m.text(p.text, p.kind === 'value')
}

const chipSize = (c: Chip, fit: Fit, m: Metrics) =>
  c.parts.reduce((n, p) => n + partSize(p, fit, m), 0) + m.gap * (c.parts.length - 1)

const groupSize = (g: Chip[], fit: Fit, m: Metrics) =>
  g.reduce((n, c) => n + chipSize(c, fit, m), 0) + m.gap * fit.chipGap * (g.length - 1)

// The narrowest the row can be: chips a gap apart, and between groups a
// separator, or an empty spacer, with a gap either side.
const rowSize = (groups: Chip[][], fit: Fit, m: Metrics) =>
  groups.reduce((n, g) => n + groupSize(g, fit, m), 0) +
  (groups.length - 1) * ((fit.hasSeps ? m.sep : 0) + 2 * m.gap * fit.chipGap)

const buildGroups = (v: View, fit: Fit): Chip[][] => {
  const bar = (pct: number, name: string): Part[] =>
    fit.barCells > 0 ? [{ kind: 'bar', pct, name }] : []
  const limit = (id: ChipId, name: string, l: Limit | undefined, extra: Part[] = []): Chip[] =>
    l === undefined
      ? []
      : [
          {
            id,
            parts: [
              { kind: 'label', text: name },
              ...bar(l.percent, name),
              { kind: 'value', text: fmtPct(l.percent) },
              ...extra,
            ],
          },
        ]
  const reset: Part[] = fit.hasReset && v.until !== null ? [{ kind: 'dim', text: v.until }] : []

  const groups: Chip[][] = [
    [
      ...limit('5h', '5h', v.fiveHour, reset),
      ...limit('7d', '7d', v.sevenDay),
      ...limit('spend', 'spend', v.spend),
    ],
    [
      { id: 'in', parts: [{ kind: 'label', text: 'in' }, { kind: 'value', text: fmtTokens(v.fresh) }] },
      { id: 'out', parts: [{ kind: 'label', text: 'out' }, { kind: 'value', text: fmtTokens(v.output) }] },
      {
        id: 'speed',
        parts: [
          { kind: 'value', text: v.tps === null ? '—' : String(v.tps) },
          { kind: 'label', text: 't/s' },
        ],
      },
      {
        id: 'cache',
        parts: [
          { kind: 'label', text: 'cache' },
          { kind: 'value', text: v.cachePct === null ? '—' : fmtPct(v.cachePct) },
        ],
      },
    ],
    [
      {
        id: 'clock',
        parts: [{ kind: 'clock' }, { kind: 'value', text: v.now === 0 ? '--:--' : clockText(v.now) }],
      },
      {
        id: 'cost',
        parts: [
          { kind: 'value', text: v.today === null ? '—' : fmtUsd(v.today) },
          { kind: 'label', text: '共' },
          { kind: 'value', text: v.week === null ? '—' : fmtUsd(v.week) },
        ],
      },
      {
        id: 'ctx',
        parts: [
          { kind: 'label', text: 'ctx' },
          ...(v.ctx === null ? [] : bar(v.ctx, 'ctx')),
          { kind: 'value', text: v.ctx === null ? '—' : fmtPct(v.ctx) },
        ],
      },
    ],
  ]

  return groups
    .map(g => g.filter(c => !fit.hidden.includes(c.id)))
    .filter(g => g.length > 0)
}

const toMeasure = (s: Snapshot): Measure => ({
  limits: s.rateLimits.map(l => ({
    kind: l.kind,
    percent: l.percentUsed,
    resetsAt: l.resetsAt,
  })),
  contextPercent: s.context.percent ?? null,
})

const addUsage = (t: Tokens, u: TurnUsage): Tokens => ({
  input: t.input + u.input_tokens,
  output: t.output + u.output_tokens,
  cacheRead: t.cacheRead + u.cache_read_input_tokens,
  cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
})

// Shows today's and this week's spend as the store holds them, which every
// session adds to.
async function refreshSpend($: EngineInterface, now: number) {
  let day = 0
  let week = 0
  for (const [i, key] of weekDays(now).entries()) {
    const held = await $.store.get(SPEND_PREFIX + key)
    const usd = typeof held === 'number' ? held : 0
    if (i === 0) day = usd
    week += usd
  }
  if ((await read($, dayTotal)) !== day) await update($, dayTotal, () => day)
  if ((await read($, weekTotal)) !== week) await update($, weekTotal, () => week)
}

// Adds what the session spent since `lastCost` to today's total, so a session
// that runs past midnight counts on each day only what it spent that day.
// Returns the cost now seen.
async function record($: EngineInterface, s: Snapshot, lastCost: number | null) {
  await update($, measure, () => toMeasure(s))
  if (s.cost === undefined) return lastCost
  const usd = s.cost.usd
  if (lastCost !== null && usd > lastCost) {
    const now = await $.clock.now()
    const key = SPEND_PREFIX + dayKey(now)
    const held = await $.store.get(key)
    await $.store.set(key, (typeof held === 'number' ? held : 0) + (usd - lastCost))
    await refreshSpend($, now)
  }

  return usd
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const at = Math.floor(now / 60_000) * 60_000
  if ((await read($, minute)) === at) return
  await update($, minute, () => at)
  await refreshSpend($, now)
}

export const register: Register = on => {
  // The session's cost as last added to today's total; null where the host
  // keeps no cost ledger.
  let lastCost: number | null = null

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    const thisWeek = new Set(weekDays(now).map(day => SPEND_PREFIX + day))
    for (const key of await $.store.keys()) {
      const isStale = key.startsWith(SPEND_PREFIX) && !thisWeek.has(key)
      if (isStale || key.startsWith(OLD_PREFIX)) await $.store.delete(key)
    }
    const usage = await $.session.usage()
    lastCost = usage.cost?.usd ?? null
    await update($, measure, () => toMeasure(usage))
    await refreshSpend($, now)
    await tick($)
    $.clock.every(15_000, () => void tick($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    lastCost = await record($, e, lastCost)

    return next(e)
  })

  // Every response's tokens count toward the session's totals; the speed is the
  // main loop's last response, its output over the time it streamed.
  on('turn.step', async function* ($, e, next) {
    let firstAt = 0
    let usage: TurnUsage | null = null
    for await (const chunk of next(e)) {
      if (firstAt === 0) firstAt = performance.now()
      if (chunk.kind === 'stop') usage = chunk.usage
      yield chunk
    }
    if (usage === null) return
    const done = usage
    await update($, tokens, t => addUsage(t, done))
    const seconds = (performance.now() - firstAt) / 1000
    if (e.agentId === undefined && done.output_tokens >= 20 && seconds >= 0.5) {
      await update($, speed, () => Math.round(done.output_tokens / seconds))
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const m = await read($, measure)
    const t = await read($, tokens)
    const now = await read($, minute)
    const fiveHour = m?.limits.find(l => l.kind === 'five_hour')
    const fresh = t.input + t.cacheWrite
    const allInput = fresh + t.cacheRead
    const view: View = {
      fiveHour,
      sevenDay: m?.limits.find(l => l.kind === 'seven_day'),
      spend: m?.limits.find(l => l.kind === 'spend_limit'),
      until: fmtUntil(fiveHour?.resetsAt, now),
      fresh,
      output: t.output,
      tps: await read($, speed),
      cachePct: allInput > 0 ? (t.cacheRead / allInput) * 100 : null,
      now,
      today: await read($, dayTotal),
      week: await read($, weekTotal),
      ctx: m?.contextPercent ?? null,
    }

    const columns = e.props.bodyColumns > 0 ? e.props.bodyColumns : (e.viewport?.columns ?? 100)
    const metrics = metricsFor(e.surface === 'terminal', columns)
    const fit =
      FITS.find(f => rowSize(buildGroups(view, f), f, metrics) <= metrics.room) ?? TIGHTEST
    const groups = buildGroups(view, fit)
    const bars = groups.flat().filter(c => c.parts.some(p => p.kind === 'bar')).length
    const spare = Math.max(0, metrics.room - rowSize(groups, fit, metrics))
    const barCells =
      bars === 0
        ? fit.barCells
        : Math.min(MAX_BAR_CELLS, fit.barCells + Math.floor(spare / bars / metrics.bar(1)))

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined

    const drawPart = (p: Part) => {
      if (p.kind === 'label' || p.kind === 'dim') return <Text dimColor>{p.text}</Text>
      if (p.kind === 'value') {
        return (
          <Text weight="medium" tabular>
            {p.text}
          </Text>
        )
      }
      if (p.kind === 'clock') {
        return Svg !== undefined ? (
          <Svg source={CLOCK_SVG} alt="clock" width={12} height={12} />
        ) : (
          <Text dimColor>◷</Text>
        )
      }
      const cells = barCells
      if (Svg !== undefined) {
        const px = cells * PX_PER_CELL

        return <Svg source={barSvg(p.pct, px)} alt={`${p.name} ${fmtPct(p.pct)}`} width={px} height={5} />
      }
      const filled = Math.round((Math.min(100, Math.max(0, p.pct)) / 100) * cells)

      return (
        <Text>
          <Text color={barColor(p.pct)}>{'━'.repeat(filled)}</Text>
          <Text dimColor>{'━'.repeat(cells - filled)}</Text>
        </Text>
      )
    }

    const drawChip = (c: Chip) => (
      <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
        {c.parts.map(drawPart)}
      </Box>
    )

    // Every chip is a child of the row, and between groups a separator or an
    // empty spacer, so the groups stand two gaps apart however tight the fit.
    const row = groups.flatMap((g, i) => [
      ...(i === 0 ? [] : [fit.hasSeps ? <Text dimColor>|</Text> : <Box />]),
      ...g.map(drawChip),
    ])

    // Whatever room is left over spreads evenly across every gap in the row,
    // not just the ones between groups: the fit is chosen on widths rounded
    // up, so there is usually some.
    return (
      <Box
        flexDirection="row"
        flexWrap="nowrap"
        justifyContent="space-between"
        alignItems="center"
        columnGap={fit.chipGap}
        width="100%"
        overflow="hidden"
      >
        {row}
      </Box>
    )
  })
}
