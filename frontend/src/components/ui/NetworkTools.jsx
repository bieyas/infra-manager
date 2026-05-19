import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Terminal, X, Play, RotateCcw, Wifi, Network, Globe,
  CheckCircle, XCircle, Loader2, Square,
} from 'lucide-react'
import Card, { CardBody } from './Card'
import Button from './Button'
import clsx from 'clsx'
import { apiFetch } from '../../lib/api'

const BASE = '/api'

const TOOLS = [
  { id: 'ping',       label: 'Ping',       icon: Wifi,    placeholder: '10.0.0.1' },
  { id: 'traceroute', label: 'Traceroute', icon: Network, placeholder: '10.0.0.1' },
  { id: 'nslookup',   label: 'NSLookup',   icon: Globe,   placeholder: 'hostname atau IP' },
]

// Color-code output lines
function lineColor(text, style) {
  if (style === 'error')                            return 'text-rose-400'
  if (style === 'warn')                             return 'text-amber-400'
  if (!text)                                        return ''
  if (text.startsWith('>') || text.startsWith('#')) return 'text-[var(--accent)]'
  if (/time[<=][\d.]+\s*ms/i.test(text))           return 'text-emerald-400'
  if (/^\s*\d+\s+\*/.test(text))                   return 'text-muted'      // hop timeout
  if (/traceroute|tracepath/i.test(text))           return 'text-cyan-400'
  if (/statistics|transmitted|received/i.test(text)) return 'text-amber-400'
  if (/loss.*0%/.test(text))                        return 'text-emerald-400'
  if (/loss/i.test(text))                           return 'text-rose-400'
  if (/^\s*\d+\s+[\d.]+/.test(text))               return 'text-secondary'  // traceroute hop
  return 'text-secondary'
}

export default function NetworkTools({ onClose, defaultTarget = '' }) {
  const [tool,    setTool]    = useState('ping')
  const [target,  setTarget]  = useState(defaultTarget)
  const [count,   setCount]   = useState(4)
  const [lines,   setLines]   = useState([])    // { text, style }
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState(null)  // ping stats
  const outputRef = useRef()
  const abortRef  = useRef(null)
  const inputRef  = useRef()

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [lines])

  // Focus input on open
  useEffect(() => { inputRef.current?.focus() }, [])

  const pushLine = useCallback((text, style) =>
    setLines(prev => [...prev, { text, style }]), [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setLines([])
    setSummary(null)
    setRunning(false)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setRunning(false)
    setLines(prev => [...prev, { text: '— dihentikan —', style: 'warn' }])
  }, [])

  const run = useCallback(async () => {
    const t = target.trim()
    if (!t || running) return

    clear()
    setRunning(true)
    setSummary(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      let body

      if (tool === 'nslookup') {
        // Simple JSON response
        pushLine(`> nslookup ${t}`, 'cmd')
        const data = await apiFetch('/tools/nslookup', {
          method: 'POST',
          body: JSON.stringify({ target: t }),
          signal: ctrl.signal,
        })
        if (data.error) { pushLine(data.error, 'error') }
        else { (data.lines ?? []).forEach(l => pushLine(l)) }
        setRunning(false)
        return
      }

      body = JSON.stringify({ target: t, count, maxHops: 20 })

      pushLine(`> ${tool} ${t}`, 'cmd')

      // Use raw fetch for SSE streaming (apiFetch parses JSON, can't be used for SSE)
      const access = localStorage.getItem('access_token')
      const resp = await fetch(`${BASE}/tools/${tool}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(access ? { 'Authorization': `Bearer ${access}` } : {}),
        },
        body,
        signal: ctrl.signal,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        pushLine(err.error ?? `HTTP ${resp.status}`, 'error')
        setRunning(false)
        return
      }

      // Read SSE stream
      const reader = resp.body.getReader()
      const dec    = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data:')) continue
          try {
            const msg = JSON.parse(part.slice(5).trim())
            if (msg.type === 'line')    pushLine(msg.text, msg.style)
            if (msg.type === 'summary') setSummary(msg.stats)
            if (msg.type === 'error')   pushLine(msg.text ?? 'Error', 'error')
            if (msg.type === 'done')    setRunning(false)
          } catch { /* ignore parse error */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') pushLine(e.message, 'error')
      setRunning(false)
    }
  }, [target, tool, count, running, clear, pushLine])

  const switchTool = (id) => { setTool(id); clear() }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full md:max-w-xl md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl animate-slide-in flex flex-col max-h-[90vh]">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-[var(--accent)]" />
            <span className="text-sm font-semibold text-primary">Network Tools</span>
          </div>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>

        <CardBody className="space-y-3 pt-3 overflow-y-auto">

          {/* ── Tool tabs ──────────────────────────────────────────────── */}
          <div className="flex gap-1">
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => switchTool(t.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  tool === t.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-2)] text-muted hover:text-primary border border-[var(--border)]'
                )}>
                <t.icon size={11} />{t.label}
              </button>
            ))}
          </div>

          {/* ── Input row ──────────────────────────────────────────────── */}
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={target}
              onChange={e => setTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !running && run()}
              placeholder={TOOLS.find(t => t.id === tool)?.placeholder}
              className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[13px] font-mono text-primary px-3 py-1.5 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
            />
            {/* Ping count selector */}
            {tool === 'ping' && (
              <select
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                disabled={running}
                className="text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-muted focus:outline-none focus:border-[var(--accent)]"
              >
                {[4, 8, 16, 20].map(n => <option key={n} value={n}>{n}x</option>)}
              </select>
            )}
            {running ? (
              <Button variant="outline" size="sm" icon={Square} onClick={stop}>Stop</Button>
            ) : (
              <Button variant="primary" size="sm" icon={Play} onClick={run} disabled={!target.trim()}>Run</Button>
            )}
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={clear} title="Clear" />
          </div>

          {/* ── Summary bar (ping only) ─────────────────────────────────── */}
          {summary && (
            <div className={clsx(
              'flex items-center gap-4 px-3 py-2 rounded-lg text-[11px] border',
              summary.alive
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            )}>
              {summary.alive
                ? <CheckCircle size={13} />
                : <XCircle    size={13} />}
              <span className="font-semibold">{summary.alive ? 'Reachable' : 'Unreachable'}</span>
              <span className="text-muted">
                {summary.received}/{summary.sent} pkt · {summary.loss}% loss
              </span>
              {summary.avg != null && (
                <span className="ml-auto font-mono">
                  min {summary.min}ms · avg {summary.avg}ms · max {summary.max}ms
                </span>
              )}
            </div>
          )}

          {/* ── Terminal output ─────────────────────────────────────────── */}
          <div
            ref={outputRef}
            className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-3 h-56 overflow-y-auto font-mono text-[11px] leading-[1.7] space-y-0"
          >
            {lines.length === 0 && !running && (
              <p className="text-muted italic text-[10px]">
                Masukkan target dan klik Run…
              </p>
            )}
            {lines.map((l, i) => (
              <div key={i} className={clsx('whitespace-pre-wrap break-all', lineColor(l.text, l.style) || 'text-secondary')}>
                {l.text || '\u00A0'}
              </div>
            ))}
            {running && (
              <span className="flex items-center gap-1.5 text-[var(--accent)] mt-1">
                <Loader2 size={10} className="animate-spin" />
                <span className="animate-pulse text-[10px]">running…</span>
              </span>
            )}
          </div>

        </CardBody>
      </Card>
    </div>
  )
}
