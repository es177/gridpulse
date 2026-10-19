import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useScheme } from '../lib/hooks'
import { tick, when } from '../lib/format'

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const resolve = color => (color?.startsWith('var(') ? css(color.slice(4, -1)) : color)
// Tooltip nodes are built, never parsed from HTML strings.
const make = (tag, className = '', content = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (content) node.textContent = content
  return node
}
const alpha = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Axis width follows its widest tick label so values are never clipped.
function axisSize(u, values, font) {
  if (!values?.length) return 36
  u.ctx.save()
  u.ctx.font = font
  const widest = Math.max(...values.map(v => u.ctx.measureText(String(v)).width))
  u.ctx.restore()
  return Math.ceil(widest) + 12
}

/**
 * Time series on one y axis.
 *   x:        timestamps in ms
 *   series:   [{ label, values, color, dash, width }]; color defaults to the text color
 *   stacked:  draw series as stacked areas in the given order (first = bottom)
 *   area:     shade under a single series
 *   format:   value -> string for the tooltip (and axis unless axisFormat is given)
 */
export default function TimeChart({ x, series, height = 220, stacked = false, area = false, format = String, axisFormat, yMin, ariaLabel }) {
  const box = useRef(null)
  const scheme = useScheme()

  useEffect(() => {
    const el = box.current
    if (!el || !x?.length) return undefined
    const surface = css('--surface'), muted = css('--fg-3'), line = css('--line'), strong = css('--line-strong')
    const font = `10px ${css('--mono')}`
    const colorOf = s => resolve(s.color || 'var(--fg)')
    const xs = x.map(t => t / 1000)
    let plotted = series.map(s => s.values.map(v => (typeof v === 'number' ? v : null)))
    if (stacked) {
      const acc = new Array(xs.length).fill(0)
      plotted = plotted.map(values => values.map((v, i) => (acc[i] += Math.max(v ?? 0, 0))))
    }
    const tip = document.createElement('div')
    tip.className = 'tip'
    tip.style.display = 'none'

    const opts = {
      width: el.clientWidth,
      height,
      padding: [8, 20, 0, 0],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 6, width: 1.5 } },
      scales: { x: { time: true }, y: { range: (u, lo, hi) => [yMin ?? (stacked ? 0 : lo - (hi - lo) * 0.08), hi + (hi - lo) * 0.08 || 1] } },
      axes: [
        {
          stroke: muted, font, size: 28, gap: 6, grid: { show: false }, ticks: { show: false },
          border: { show: true, stroke: strong, width: 1 },
          values: (u, splits, axis, space, step) => splits.map(s => tick(s, step)),
        },
        {
          stroke: muted, font, size: (u, values) => axisSize(u, values, font), gap: 6, grid: { stroke: line, width: 1 }, ticks: { show: false },
          values: (u, splits) => splits.map(axisFormat || format),
        },
      ],
      series: [
        {},
        ...series.map((s, i) => ({
          label: s.label,
          stroke: stacked ? surface : colorOf(s),
          width: stacked ? 1 : (s.width ?? 1.5),
          dash: s.dash ? [4, 3] : undefined,
          fill: stacked ? (i === 0 ? colorOf(s) : undefined) : area && series.length === 1 ? alpha(colorOf(s), 0.07) : undefined,
          points: { show: false },
          spanGaps: false,
        })),
      ],
      bands: stacked ? series.slice(1).map((s, i) => ({ series: [i + 2, i + 1], fill: colorOf(s) })) : [],
      hooks: {
        setCursor: [u => {
          const idx = u.cursor.idx
          if (idx == null || u.cursor.left < 0) { tip.style.display = 'none'; return }
          const rows = series.map(s => [s, s.values[idx]]).filter(([, v]) => typeof v === 'number')
          if (!rows.length) { tip.style.display = 'none'; return }
          tip.replaceChildren(make('div', 'tip-time', when(new Date(x[idx]).toISOString())), ...rows.reverse().map(([s, v]) => {
            const swatch = make('i')
            swatch.style.background = colorOf(s)
            const row = make('div', 'tip-row')
            row.append(swatch, s.label, make('b', '', format(v)))
            return row
          }))
          tip.style.display = 'block'
          const left = u.cursor.left + u.over.offsetLeft
          const flip = left + tip.offsetWidth + 16 > el.clientWidth
          tip.style.left = `${flip ? left - tip.offsetWidth - 12 : left + 12}px`
          tip.style.top = `${Math.max(0, Math.min(u.cursor.top + u.over.offsetTop - tip.offsetHeight / 2, height - tip.offsetHeight))}px`
        }],
      },
    }
    const plot = new uPlot(opts, [xs, ...plotted], el)
    el.appendChild(tip)
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }))
    ro.observe(el)
    return () => { ro.disconnect(); plot.destroy(); tip.remove() }
  }, [x, series, height, stacked, area, format, axisFormat, yMin, scheme])

  return <div ref={box} className="chart" role="img" aria-label={ariaLabel} style={{ minHeight: height }} />
}
