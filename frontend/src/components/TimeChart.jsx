import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useScheme } from '../lib/hooks'
import { when } from '../lib/format'

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const resolve = color => (color?.startsWith('var(') ? css(color.slice(4, -1)) : color)
const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif'

// Axis width follows its widest tick label so values are never clipped.
function axisSize(u, values) {
  if (!values?.length) return 40
  u.ctx.save()
  u.ctx.font = FONT
  const widest = Math.max(...values.map(v => u.ctx.measureText(String(v)).width))
  u.ctx.restore()
  return Math.ceil(widest) + 14
}

/**
 * Time series on one y axis.
 *   x:        timestamps in ms
 *   series:   [{ label, values, color, dash, width }]
 *   stacked:  draw series as stacked areas in the given order (first = bottom)
 *   format:   value -> string for the tooltip (and axis unless axisFormat is given)
 */
export default function TimeChart({ x, series, height = 220, stacked = false, format = String, axisFormat, yMin, ariaLabel }) {
  const box = useRef(null)
  const scheme = useScheme()

  useEffect(() => {
    const el = box.current
    if (!el || !x?.length) return undefined
    const surface = css('--bg'), muted = css('--fg-muted'), grid = css('--grid-line'), axis = css('--axis')
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
      padding: [10, 22, 0, 0],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 7, width: 1.5 } },
      scales: { x: { time: true }, y: { range: (u, lo, hi) => [yMin ?? (stacked ? 0 : lo - (hi - lo) * 0.08), hi + (hi - lo) * 0.08 || 1] } },
      axes: [
        { stroke: muted, font: FONT, grid: { show: false }, ticks: { stroke: axis, width: 1, size: 4 }, border: { show: true, stroke: axis, width: 1 } },
        { stroke: muted, font: FONT, size: axisSize, grid: { stroke: grid, width: 1 }, ticks: { show: false }, values: (u, splits) => splits.map(axisFormat || format) },
      ],
      series: [
        {},
        ...series.map((s, i) => ({
          label: s.label,
          stroke: stacked ? surface : resolve(s.color),
          width: stacked ? 1 : (s.width ?? 2),
          dash: s.dash ? [5, 4] : undefined,
          fill: stacked && i === 0 ? resolve(s.color) : undefined,
          points: { show: false },
          spanGaps: false,
        })),
      ],
      bands: stacked ? series.slice(1).map((s, i) => ({ series: [i + 2, i + 1], fill: resolve(s.color) })) : [],
      hooks: {
        setCursor: [u => {
          const idx = u.cursor.idx
          if (idx == null || u.cursor.left < 0) { tip.style.display = 'none'; return }
          const rows = series.map(s => [s, s.values[idx]]).filter(([, v]) => typeof v === 'number')
          if (!rows.length) { tip.style.display = 'none'; return }
          tip.innerHTML = `<div class="tip-time">${when(new Date(x[idx]).toISOString())}</div>` + rows.reverse().map(([s, v]) =>
            `<div class="tip-row"><i style="background:${resolve(s.color)}"></i>${s.label}<b>${format(v)}</b></div>`).join('')
          tip.style.display = 'block'
          const left = u.cursor.left + u.over.offsetLeft
          const flip = left + tip.offsetWidth + 16 > el.clientWidth
          tip.style.left = `${flip ? left - tip.offsetWidth - 12 : left + 12}px`
          tip.style.top = `${Math.max(0, u.cursor.top + u.over.offsetTop - tip.offsetHeight / 2)}px`
        }],
      },
    }
    const plot = new uPlot(opts, [xs, ...plotted], el)
    el.appendChild(tip)
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }))
    ro.observe(el)
    return () => { ro.disconnect(); plot.destroy(); tip.remove() }
  }, [x, series, height, stacked, format, axisFormat, yMin, scheme])

  return <div ref={box} className="chart" role="img" aria-label={ariaLabel} style={{ minHeight: height }} />
}
