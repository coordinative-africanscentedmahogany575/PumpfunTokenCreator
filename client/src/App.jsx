import React, { useEffect, useMemo, useRef, useState } from "react"
import api from "./api"

function Section({ title, children, toolbar }) {
  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-xl p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-400 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(79,70,229,0.35)]">
            {title?.slice(0,1) || ''}
          </span>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">{title}</h2>
        </div>
        {toolbar ? <div className="flex items-center gap-2">{toolbar}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex items-center gap-2 text-sm mb-2">
      <span className="w-44 text-slate-300">{label}</span>
      <div className="flex-1">{children}</div>
    </label>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      className={(props.className || "") +
        " w-full rounded-xl border border-slate-800/70 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-indigo-500/60 transition-all"}
    />
  )
}

function Button({ children, type = "button", variant = "indigo", ...props }) {
  const variants = {
    indigo: "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-500/90 hover:to-violet-500/90 active:from-indigo-600 active:to-violet-600 text-white",
    emerald: "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-500/90 hover:to-teal-500/90 active:from-emerald-600 active:to-teal-600 text-white",
    rose: "bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-500/90 hover:to-orange-500/90 active:from-rose-600 active:to-orange-600 text-white",
    outline: "border border-slate-700/80 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70",
    ghost: "border border-transparent bg-transparent text-slate-200 hover:bg-slate-900/60",
  }
  const base = "text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_12px_30px_rgba(15,23,42,0.45)]"
  const cls = variants[variant] || variants.indigo
  return (
    <button type={type} {...props} className={(props.className || "") + " " + cls + " " + base}>
      {children}
    </button>
  )
}

function Progress({ label, value, total, running, variant = "indigo" }) {
  const pct = total > 0 ? Math.min(100, Math.floor((value / total) * 100)) : 0
  const bars = {
    indigo: "from-indigo-400 to-indigo-600",
    emerald: "from-emerald-400 to-emerald-600",
    rose: "from-rose-400 to-rose-600",
  }
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
        <span>{label}</span>
        <span>{value}/{total} ({pct}%) {running ? "in progress" : ""}</span>
      </div>
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${bars[variant]}`} style={{ width: pct + "%" }} />
      </div>
    </div>
  )
}

function MiniField({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      {children}
    </div>
  )
}

function SegTabs({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-md bg-slate-900 border border-slate-800">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-xs rounded ${value===opt.value ? 'bg-slate-800 text-slate-100 shadow-[inset_0_0_0_1px_rgba(99,102,241,.4)]' : 'text-slate-400 hover:text-slate-200'}`}
        >{opt.label}</button>
      ))}
    </div>
  )
}

function LogsPanel({ logs }) {
  const panelRef = useRef(null)
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
    if (nearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])
  return (
    <div
      ref={panelRef}
      className="h-96 overflow-y-auto rounded-2xl border border-slate-800/70 bg-slate-950/80 px-4 py-3 font-mono text-xs text-slate-200"
    >
      {logs.length === 0 ? (
        <div className="text-slate-500">Logs will appear here as actions run.</div>
      ) : (
        logs.map((l, i) => {
          const ts = new Date(l.ts).toLocaleTimeString()
          const payload = l.data ? JSON.stringify(l.data) : null
          return (
            <div key={i} className="py-1">
              <span className="text-slate-500">[{ts}]</span>
              <span className="ml-2 text-emerald-400">{l.category}</span>
              <span className="ml-2 text-slate-100">{l.message}</span>
              {payload ? <span className="ml-2 text-slate-400">{payload}</span> : null}
            </div>
          )
        })
      )}
    </div>
  )
}

function CopyChip({ label, value, onCopy }) {
  const [copied, setCopied] = useState(false)
  const disabled = !value
  return (
    <button
      type="button"
      disabled={disabled}
      title={value || "Unavailable"}
      onClick={async () => {
        if (!value) return
        try { await navigator.clipboard.writeText(value) } catch {}
        setCopied(true)
        onCopy?.(value)
        setTimeout(() => setCopied(false), 1200)
      }}
      className={`px-3 py-1.5 rounded-full border text-xs font-mono transition ${disabled ? 'border-slate-800 bg-slate-950/60 text-slate-500' : 'border-slate-700/80 bg-slate-900/70 hover:bg-slate-900 text-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.45)]'}`}
    >
      <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-400">{label}:</span>
      <span className="max-w-[420px] inline-block align-middle truncate">{value || 'Unavailable'}</span>
      <span className={`ml-2 ${copied ? 'text-emerald-400' : 'text-slate-500'}`}>{copied ? 'copied' : 'copy'}</span>
    </button>
  )
}

function CopyKey({ value, onCopy, className = '' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={value}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value) } catch {}
        setCopied(true)
        onCopy?.(value)
        setTimeout(() => setCopied(false), 1000)
      }}
      className={`text-slate-500 font-mono text-xs break-all hover:text-slate-200 underline decoration-dotted underline-offset-2 ${className}`}
    >
      {value}
      <span className={`ml-2 ${copied ? 'text-emerald-400' : 'text-slate-600'}`}>{copied ? 'copied' : 'copy'}</span>
    </button>
  )
}

export default function App() {
  const [state, setState] = useState({ mint: "" })
  const [dev, setDev] = useState(null)
  const [wallets, setWallets] = useState([])
  const [balances, setBalances] = useState({ data: [] })
  const [loading, setLoading] = useState(false)

  const [createForm, setCreateForm] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "", devBuySol: "", slippage: "", priorityFee: "" })
  const imageRef = useRef(null)
  const [imagePreview, setImagePreview] = useState("")

  const [buyForm, setBuyForm] = useState({ mode: 'concurrent', concurrency: "8", slippage: "10", priorityFee: "0.00001" })
  const [sellForm, setSellForm] = useState({ mode: 'concurrent', concurrency: "8", slippage: "10", priorityFee: "0.00001", percent: "100" })
  const [priorityFee, setPriorityFee] = useState("0.00001")
  const [buyStatus, setBuyStatus] = useState({ running: false, done: 0, total: 0 })
  const [sellStatus, setSellStatus] = useState({ running: false, done: 0, total: 0 })
  const [logs, setLogs] = useState([])
  const [utilsTab, setUtilsTab] = useState("transfer")
  const [selected, setSelected] = useState({}) // map pubkey -> true
  const selectedWallets = useMemo(
    () => wallets.filter((w) => selected[w.publicKey]),
    [wallets, selected]
  )
  const selectedPublicKeys = useMemo(
    () => selectedWallets.map((w) => w.publicKey),
    [selectedWallets]
  )
  const selectedCount = selectedPublicKeys.length
  const hasSelection = selectedCount > 0
  const [devControls, setDevControls] = useState({ buySol: "", buyPercent: "", sellPercent: "" })
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showAllWallets, setShowAllWallets] = useState(false)
  const AUTO_REFRESH_MS = 60000 // 60s auto refresh interval (was 20s)
  const WALLET_PREVIEW_COUNT = 4

  const allWalletRows = useMemo(() => balances?.data ?? [], [balances?.data])
  const displayedWallets = useMemo(() => {
    if (showAllWallets) return allWalletRows
    if ((allWalletRows?.length || 0) <= WALLET_PREVIEW_COUNT) return allWalletRows
    return allWalletRows.slice(0, WALLET_PREVIEW_COUNT)
  }, [allWalletRows, showAllWallets, WALLET_PREVIEW_COUNT])
  const hiddenWalletCount = Math.max(0, (allWalletRows?.length || 0) - (displayedWallets?.length || 0))

  useEffect(() => {
    setDevControls({ buySol: "", buyPercent: "", sellPercent: "" })
  }, [dev])

  useEffect(() => {
    if ((balances?.data?.length || 0) <= WALLET_PREVIEW_COUNT) {
      setShowAllWallets(false)
    }
  }, [balances?.data])

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getState('init')
        if (s?.mint) setState({ mint: s.mint })
      } catch {}
      await refreshWallets()
      await refreshBalances('init')
    })()
  }, [])

  // Auto-refresh balances (SOL + SPL for current mint)
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      if (!loading) refreshBalances('auto')
    }, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [loading, state.mint, autoRefresh])

  useEffect(() => {
    const stop = api.streamLogs((evt) => {
      if (evt.type === 'init' && evt.data?.logs) {
        setLogs(evt.data.logs)
      } else if (evt.type === 'log' && evt.data) {
        setLogs((prev) => [...prev.slice(-999), evt.data])
        const { category, message, data } = evt.data
        if (category === 'buy' && message === 'progress') {
          setBuyStatus(p => ({ running: true, done: data?.done||0, total: data?.total||p.total }))
        }
        if (category === 'buy' && (message === 'Batch buy completed' || message === 'Batch buy failed')) {
          setBuyStatus(p => ({ ...p, running: false }))
        }
        if (category === 'sell' && message === 'progress') {
          setSellStatus(p => ({ running: true, done: data?.done||0, total: data?.total||p.total }))
        }
        if (category === 'sell' && (message === 'Batch sell completed' || message === 'Batch sell failed')) {
          setSellStatus(p => ({ ...p, running: false }))
        }
      }
    })
    return stop
  }, [])

  async function log(category, message, data) {
    try {
      // Prefer server SSE to avoid duplicate local + SSE entries
      await api.emitLog(category, message, data)
    } catch {
      // Fallback: add locally if SSE emit fails
      setLogs(prev => [...prev.slice(-999), { ts: Date.now(), category, message, data }])
    }
  }

  async function removeSelectedWallets() {
    if (!selectedPublicKeys.length) return
    const list = wallets.filter(w => selectedPublicKeys.includes(w.publicKey))
    const confirmLabel = list.length > 1 ? `${list.length} wallets` : list[0]?.name || selectedPublicKeys[0]
    const ok = window.confirm(`Remove ${confirmLabel}? This cannot be undone.`)
    if (!ok) return
    setWallets(prev => prev.filter(p => !selectedPublicKeys.includes(p.publicKey)))
    setBalances(prev => ({
      ...prev,
      data: Array.isArray(prev?.data) ? prev.data.filter(p => !selectedPublicKeys.includes(p.publicKey)) : prev?.data,
    }))
    setSelected({})
    for (const pubkey of selectedPublicKeys) {
      try {
        const res = await api.removeWallet({ publicKey: pubkey })
        if (res?.error) {
          await log('ui','Remove wallet failed',{ error: res.error, wallet: pubkey })
        }
      } catch (e) {
        await log('ui','Remove wallet failed',{ error: String(e), wallet: pubkey })
      }
    }
    await refreshWallets()
    await refreshBalances()
  }

  async function refreshBalances(note) {
    setLoading(true)
    try {
      const res = await api.getBalances(state.mint, note)
      setBalances(res || { data: [] })
    } catch {
      setBalances({ data: [] })
    } finally {
      setLoading(false)
    }
  }

  function clearLogs() {
    setLogs([])
  }

  async function copyContract() {
    if (!state.mint) return
    try {
      await navigator.clipboard.writeText(state.mint)
      await log('copy','contract address copied',{ value: state.mint })
    } catch {
      window.prompt('Copy contract address:', state.mint)
    }
  }

  async function refreshWallets() {
    try {
      const wl = await api.getWallets()
      const buyers = (wl?.buyers || []).map(b => ({
        ...b,
        buySol: Number(b.buySol || 0),
        buyPercent: Number(b.buyPercent || 0),
        sellPercent: Number(b.sellPercent || 0),
      }))
      setWallets(buyers)
      setDev(wl?.dev || null)
      setSelected(prev => {
        if (!prev || typeof prev !== 'object') return {}
        const allowed = new Set(buyers.map(b => b.publicKey))
        const next = {}
        for (const pk of Object.keys(prev)) {
          if (allowed.has(pk) && prev[pk]) next[pk] = true
        }
        return next
      })
    } catch {
      setWallets([])
      setDev(null)
    }
  }

  function onImageChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setImagePreview(url)
    } else if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview("")
    }
  }

  async function saveMint() {
    try { await api.setState({ mint: state.mint }) } catch {}
    await refreshBalances()
  }

  async function ensureDevWallet() {
    try {
      const r = await api.initDevWallet()
      if (r?.publicKey) setDev({ publicKey: r.publicKey })
    } catch {}
  }

  async function doCreate() {
    if (!createForm.name || !createForm.symbol || !createForm.description || !imageRef.current?.files?.[0]) {
      await log("ui", "Create validation failed", { missing: [!createForm.name && "name", !createForm.symbol && "symbol", !createForm.description && "description", !imageRef.current?.files?.[0] && "image"].filter(Boolean) })
      return
    }
    const fd = new FormData()
    for (const [k, v] of Object.entries(createForm)) if (v) fd.append(k, v)
    if (imageRef.current?.files?.[0]) fd.append('image', imageRef.current.files[0])
    try {
      const res = await api.createToken(fd)
      if (res?.error) { await log('ui','Create failed',{ error: res.error }); return }
      if (res?.mint) {
        setState(p => ({ ...p, mint: res.mint }))
        try { await api.setState({ mint: res.mint }) } catch {}
        await refreshBalances()
      }
    } catch (e) {
      await log('ui','Create failed',{ error: String(e) })
    }
  }

  async function doGen() {
    const body = { count: Number(document.getElementById('gen_count')?.value || 0) }
    const def = document.getElementById('gen_default')?.value
    const prefix = document.getElementById('gen_prefix')?.value
    if (def) body.defaultBuySol = Number(def)
    if (prefix) body.prefix = prefix
    try {
      const res = await api.genWallets(body)
      if (res?.error) { await log('ui','Generate wallets failed',{ error: res.error }); return }
      await refreshWallets()
      await refreshBalances()
    } catch (e) {
      await log('ui','Generate wallets failed',{ error: String(e) })
    }
  }

  async function doBuy() {
    if (!state.mint) { await log('ui','Batch buy skipped',{ reason:'set contract address' }); return }
    const sel = selectedPublicKeys
    if (!sel.length) { await log('ui','Batch buy skipped',{ reason:'no wallets selected' }); return }
    const body = { mint: state.mint, sequential: buyForm.mode === 'sequential', wallets: sel }
    if (buyForm.concurrency) body.concurrency = Number(buyForm.concurrency)
    if (buyForm.slippage) body.slippage = Number(buyForm.slippage)
    if (buyForm.priorityFee) body.priorityFee = Number(buyForm.priorityFee)
    if (buyForm.percent) body.percent = Number(buyForm.percent)
    // Per-wallet overrides from current table (not persisted): buySol and buyPercent
    const source = selectedWallets
    const overrides = []
    for (const w of source) {
      const bs = Number(w.buySol || 0)
      const bp = Number(w.buyPercent || 0)
      if ((bs > 0) || (bp > 0)) overrides.push({ publicKey: w.publicKey, buySol: bs > 0 ? bs : undefined, buyPercent: bp > 0 ? bp : undefined })
    }
    if (overrides.length) body.overrides = overrides
    setBuyStatus({ running: true, done: 0, total: sel.length })
    try {
      const res = await api.buy(body)
      if (res?.error) { await log('ui','Buy failed',{ error: res.error }); return }
    } catch (e) {
      await log('ui','Buy failed',{ error: String(e) })
    } finally {
      await refreshBalances()
    }
  }

  async function doSell() {
    if (!state.mint) { await log('ui','Batch sell skipped',{ reason:'set contract address' }); return }
    const sel = selectedPublicKeys
    if (!sel.length) { await log('ui','Batch sell skipped',{ reason:'no wallets selected' }); return }
    const percent = Number(sellForm.percent || 100)
    const body = { mint: state.mint, percent: isNaN(percent) ? 100 : percent, sequential: sellForm.mode === 'sequential', wallets: sel }
    if (sellForm.concurrency) body.concurrency = Number(sellForm.concurrency)
    if (sellForm.slippage) body.slippage = Number(sellForm.slippage)
    if (sellForm.priorityFee) body.priorityFee = Number(sellForm.priorityFee)
    // Per-wallet sell percent overrides from table
    const source = selectedWallets
    const overrides = []
    for (const w of source) {
      const sp = Number(w.sellPercent || 0)
      if (sp > 0) overrides.push({ publicKey: w.publicKey, sellPercent: sp })
    }
    if (overrides.length) body.overrides = overrides
    setSellStatus({ running: true, done: 0, total: sel.length })
    try {
      const res = await api.sell(body)
      if (res?.error) { await log('ui','Sell failed',{ error: res.error }); return }
    } catch (e) {
      await log('ui','Sell failed',{ error: String(e) })
    } finally {
      await refreshBalances()
    }
  }

  async function saveWalletBuyAmounts() {
    const conflicts = wallets.filter(w => Number(w.buySol||0) > 0 && Number(w.buyPercent||0) > 0)
    if (conflicts.length) {
      window.alert(`Choose either Buy (SOL) or Buy (%) per wallet, not both. Conflicts: ${conflicts.length}`)
      return
    }
    const updates = wallets.map(w => ({
      publicKey: w.publicKey,
      buySol: Number(w.buySol || 0),
      buyPercent: Number(w.buyPercent || 0),
      sellPercent: Number(w.sellPercent || 0),
    }))
    try {
      const res = await api.updateBuyAmounts(updates)
      if (res?.error) await log('ui','Save buy amounts failed',{ error: res.error })
    } catch (e) {
      await log('ui','Save buy amounts failed',{ error: String(e) })
    }
    await refreshBalances()
  }

  async function doCollect() {
    const body = {}
    if (priorityFee) body.priorityFee = Number(priorityFee)
    try {
      const res = await api.collectFees(body)
      if (res?.error) { await log('ui','Collect fees failed',{ error: res.error }) }
    } catch (e) {
      await log('ui','Collect fees failed',{ error: String(e) })
    }
  }

  async function removeWallet(pubkey) {
    const w = wallets.find(x => x.publicKey === pubkey)
    if (!w) return
    const ok = window.confirm(`Remove wallet ${w.name}?`)
    if (!ok) return
    setWallets(prev => prev.filter(p => p.publicKey !== pubkey))
    setBalances(prev => ({
      ...prev,
      data: Array.isArray(prev?.data) ? prev.data.filter(p => p.publicKey !== pubkey) : prev?.data,
    }))
    setSelected(prev => {
      const next = { ...prev }
      delete next[pubkey]
      return next
    })
    try {
      const res = await api.removeWallet({ publicKey: pubkey })
      if (res?.error) {
        await log('ui','Remove wallet failed',{ error: res.error, wallet: pubkey })
        await refreshWallets()
        await refreshBalances()
      }
    } catch (e) {
      await log('ui','Remove wallet failed',{ error: String(e), wallet: pubkey })
      await refreshWallets()
      await refreshBalances()
    }
  }

  async function addWalletManual() {
    const priv = window.prompt('Paste wallet private key (base58 or JSON array):')
    if (!priv) return
    try {
      const res = await api.addWallet({ secretKey: priv })
      if (res?.error) { await log('ui','Add wallet failed',{ error: res.error }) }
      // success is logged by server via SSE
    } catch (e) { await log('ui','Add wallet failed',{ error: String(e) }) }
    await refreshWallets()
    await refreshBalances()
  }

  async function assignDevWalletFrom(pubkey) {
    if (!pubkey) return
    const name = wallets.find(w => w.publicKey === pubkey)?.name || pubkey
    if (!window.confirm(`Assign ${name} as the dev wallet? This wallet will be removed from buyers.`)) return
    try {
      const res = await api.assignDevWallet({ publicKey: pubkey })
      if (res?.error) { await log('ui','Assign dev wallet failed',{ wallet: pubkey, error: res.error }); return }
      await log('wallets','Dev wallet assigned',{ wallet: pubkey })
      setSelected(prev => {
        const next = { ...prev }
        delete next[pubkey]
        return next
      })
      await refreshWallets()
      await refreshBalances()
    } catch (e) {
      await log('ui','Assign dev wallet failed',{ wallet: pubkey, error: String(e) })
    }
  }

  async function exportWalletSecret(pubkey) {
    if (!pubkey) return
    try {
      const res = await api.exportWallet({ publicKey: pubkey })
      if (res?.error) { await log('ui','Export wallet failed',{ wallet: pubkey, error: res.error }); return }
      if (res?.secretKey) {
        let copied = false
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(res.secretKey)
            copied = true
          }
        } catch {}
        if (copied) {
          window.alert('Private key copied to clipboard.')
        } else {
          window.prompt('Wallet private key (copy):', res.secretKey)
        }
        await log('wallets','Wallet secret exported',{ wallet: pubkey })
      }
    } catch (e) {
      await log('ui','Export wallet failed',{ wallet: pubkey, error: String(e) })
    }
  }

  async function exportDevWalletSecret() {
    try {
      const res = await api.exportDevWallet()
      if (res?.error) { await log('ui','Export dev wallet failed',{ error: res.error }); return }
      if (res?.secretKey) {
        let copied = false
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(res.secretKey)
            copied = true
          }
        } catch {}
        if (copied) {
          window.alert('Dev private key copied to clipboard.')
        } else {
          window.prompt('Dev wallet private key (copy):', res.secretKey)
        }
        await log('wallets','Dev wallet secret exported',{ wallet: res.publicKey })
      }
    } catch (e) {
      await log('ui','Export dev wallet failed',{ error: String(e) })
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.16),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.12),_transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.65),rgba(2,6,23,0.9))]" />
      </div>

      <header className="relative border-b border-slate-900/60 bg-slate-950/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                PumpLaunch <span className="text-emerald-300">Control</span> Center
              </h1>
              {!dev ? (
                <div className="mt-4">
                  <Button onClick={ensureDevWallet}>Create Dev Wallet</Button>
                </div>
              ) : null}
            </div>
          </div>

        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 py-10 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-8">
          <Section title="Token Setup">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name"><Input maxLength={31} placeholder="Token name" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} /></Field>
              <Field label="Symbol"><Input maxLength={10} placeholder="Ticker (e.g. PUMP)" value={createForm.symbol} onChange={e => setCreateForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} /></Field>
              <div className="md:col-span-2"><Field label="Description"><Input placeholder="Short description" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} /></Field></div>
              <Field label="Website"><Input placeholder="https://..." value={createForm.website} onChange={e => setCreateForm(p => ({ ...p, website: e.target.value }))} /></Field>
              <Field label="Twitter"><Input placeholder="https://x.com/..." value={createForm.twitter} onChange={e => setCreateForm(p => ({ ...p, twitter: e.target.value }))} /></Field>
              <Field label="Telegram"><Input placeholder="https://t.me/..." value={createForm.telegram} onChange={e => setCreateForm(p => ({ ...p, telegram: e.target.value }))} /></Field>
              <Field label="Image"><input ref={imageRef} type="file" accept="image/*" className="text-sm" onChange={onImageChange} /></Field>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1"><div className="text-sm text-slate-300">Dev Buy SOL</div><Input className="pr-10 md:min-w-[200px]" type="number" step="0.01" placeholder="0.01" value={createForm.devBuySol} onChange={e => setCreateForm(p => ({ ...p, devBuySol: e.target.value }))} /></div>
                  <div className="flex flex-col gap-1"><div className="text-sm text-slate-300">Slippage %</div><Input className="pr-10 md:min-w-[200px]" type="number" step="1" placeholder="10" value={createForm.slippage} onChange={e => setCreateForm(p => ({ ...p, slippage: e.target.value }))} /></div>
                  <div className="flex flex-col gap-1"><div className="text-sm text-slate-300">Priority Fee SOL</div><Input className="pr-10 md:min-w-[200px]" type="number" step="0.000001" placeholder="0.00001" value={createForm.priorityFee} onChange={e => setCreateForm(p => ({ ...p, priorityFee: e.target.value }))} /></div>
                </div>
              <div className="mt-3">
                <Button onClick={doCreate} variant="emerald">Create + Dev Buy</Button>
              </div>
            </div>
          </Section>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <Section title="Utilities" toolbar={
            <div className="flex items-center gap-2">
              <button onClick={()=>setUtilsTab('transfer')} className={`px-3 py-1.5 text-xs rounded-md ${utilsTab==='transfer'?'bg-slate-800 text-slate-100 shadow-[inset_0_0_0_1px_rgba(99,102,241,.4)]':'text-slate-400 hover:text-slate-200 border border-transparent'}`}>Transfer</button>
              <button onClick={()=>setUtilsTab('sweep')} className={`px-3 py-1.5 text-xs rounded-md ${utilsTab==='sweep'?'bg-slate-800 text-slate-100 shadow-[inset_0_0_0_1px_rgba(99,102,241,.4)]':'text-slate-400 hover:text-slate-200 border border-transparent'}`}>Sweep</button>
              <button onClick={()=>setUtilsTab('generate')} className={`px-3 py-1.5 text-xs rounded-md ${utilsTab==='generate'?'bg-slate-800 text-slate-100 shadow-[inset_0_0_0_1px_rgba(99,102,241,.4)]':'text-slate-400 hover:text-slate-200 border border-transparent'}`}>Generate</button>
              <button onClick={()=>setUtilsTab('claim')} className={`px-3 py-1.5 text-xs rounded-md ${utilsTab==='claim'?'bg-slate-800 text-slate-100 shadow-[inset_0_0_0_1px_rgba(99,102,241,.4)]':'text-slate-400 hover:text-slate-200 border border-transparent'}`}>Claim</button>
            </div>
          }>
            {utilsTab === "transfer" && (
              <div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="From (pubkey)"><Input placeholder="Dev or buyer pubkey" id="ts_from" /></Field>
                  <Field label="To (pubkey)"><Input placeholder="Recipient pubkey" id="ts_to" /></Field>
              <Field label="Amount SOL">
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" id="ts_amount" placeholder="SOL amount" />
                  <Button variant="outline" onClick={() => {
                    const from = document.getElementById("ts_from").value.trim()
                    const row = balances?.data?.find?.(x => x.publicKey === from)
                    if (row) {
                      const v = Number(row.sol || 0)
                      document.getElementById("ts_amount").value = v.toFixed(2)
                    }
                  }}>Max</Button>
                </div>
              </Field>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={async () => {
                    const from = document.getElementById("ts_from").value.trim()
                    const to = document.getElementById("ts_to").value.trim()
                    const amount = Number(document.getElementById("ts_amount").value || 0)
                    try { const res = await api.transferSolOne({ fromPubkey: from, toPubkey: to, amountSol: amount }); if (res?.error) await log('ui','Transfer SOL failed',{ error: res.error }); else await log('transfer','Transfer SOL success',{ sig: res.signature }) } catch (e) { await log('ui','Transfer SOL failed',{ error: String(e) }) }
                    await refreshBalances()
                  }}>Transfer SOL</Button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <Field label="From (pubkey)"><Input placeholder="Dev or buyer pubkey" id="tp_from" /></Field>
                  <Field label="To (pubkey)"><Input placeholder="Recipient pubkey" id="tp_to" /></Field>
                  <Field label="Amount Tokens">
                    <div className="flex items-center gap-2">
                      <Input type="number" step="0.01" id="tp_tokens" placeholder="Token amount" />
                      <Button variant="outline" onClick={() => {
                        const from = document.getElementById("tp_from").value.trim()
                        const row = balances?.data?.find?.(x => x.publicKey === from)
                        if (row) {
                          const v = Number(row.token || 0)
                          document.getElementById("tp_tokens").value = v.toFixed(2)
                        }
                      }}>Max</Button>
                    </div>
                  </Field>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={async () => {
                    const from = document.getElementById("tp_from").value.trim()
                    const to = document.getElementById("tp_to").value.trim()
                    const tokens = Number(document.getElementById("tp_tokens").value || 0)
                    if (!state.mint) { await log('ui','Transfer SPL failed',{ error: 'No mint set' }); return }
                    try { const res = await api.transferSplOne({ fromPubkey: from, toPubkey: to, mint: state.mint, tokens }); if (res?.error) await log('ui','Transfer SPL failed',{ error: res.error }); else await log('transfer','Transfer SPL success',{ sig: res.signature }) } catch (e) { await log('ui','Transfer SPL failed',{ error: String(e) }) }
                    await refreshBalances()
                  }}>Transfer SPL</Button>
                </div>
              </div>
            )}
            {utilsTab === "sweep" && (
              <div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="To (pubkey)"><Input id="sw_to" placeholder="Recipient pubkey" /></Field>
                  <Field label="Keep SOL"><Input type="number" step="0.01" id="sw_keep" placeholder="0.01" /></Field>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={async () => {
                    const to = document.getElementById("sw_to").value.trim()
                    const keep = Number(document.getElementById("sw_keep").value || 0.002)
                    try { const res = await api.sweepSol({ toPubkey: to, keepSol: keep }); if (res?.error) await log('ui','Sweep SOL failed',{ error: res.error }); else await log('sweep','Sweep SOL done',{ success: res.results?.filter(r=>r.ok).length, failed: res.results?.filter(r=>!r.ok).length }) } catch (e) { await log('ui','Sweep SOL failed',{ error: String(e) }) }
                    await refreshBalances()
                  }}>Sweep SOL</Button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <Field label="To (pubkey)"><Input id="swp_to" placeholder="Recipient pubkey" /></Field>
                  <Field label="Mint"><Input id="swp_mint" placeholder="Token mint" /></Field>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={async () => {
                    const to = document.getElementById("swp_to").value.trim()
                    const mint = document.getElementById("swp_mint").value.trim()
                    try { const res = await api.sweepSpl({ toPubkey: to, mint }); if (res?.error) await log('ui','Sweep SPL failed',{ error: res.error }); else await log('sweep','Sweep SPL done',{ success: res.results?.filter(r=>r.ok).length, failed: res.results?.filter(r=>!r.ok).length }) } catch (e) { await log('ui','Sweep SPL failed',{ error: String(e) }) }
                    await refreshBalances()
                  }}>Sweep SPL</Button>
                </div>
              </div>
            )}
            {utilsTab === "generate" && (
              <div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Count"><Input type="number" id="gen_count" placeholder="3" /></Field>
                  <Field label="Default buy SOL"><Input type="number" step="0.01" id="gen_default" placeholder="0.01" /></Field>
                  <Field label="Prefix"><Input id="gen_prefix" placeholder="buyer" /></Field>
                </div>
                <div className="mt-3">
                  <Button onClick={doGen}>Generate</Button>
                </div>
              </div>
            )}
            {utilsTab === "claim" && (
              <div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Priority Fee SOL"><Input type="number" step="0.000001" value={priorityFee} onChange={e=>setPriorityFee(e.target.value)} /></Field>
                </div>
                <div className="mt-3">
                  <Button onClick={doCollect}>Claim Creator Fee's</Button>
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="col-span-12">
          <Section title={`Trading Hub ${loading ? "(loading...)" : ""}`}>
            <div className="mb-6 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.45)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="w-full lg:flex-1">
                  <p className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
                    Contract Address
                    <span className={`text-[11px] uppercase tracking-widest ${state.mint ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {state.mint ? 'Linked' : 'Unlinked'}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <Input
                      className="lg:flex-1"
                      placeholder="Enter contract / mint address"
                      value={state.mint}
                      onChange={(e) => setState(p => ({ ...p, mint: e.target.value }))}
                      onKeyDown={(e)=>{ if (e.key === 'Enter') saveMint() }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={copyContract} disabled={!state.mint}>Copy</Button>
                      <Button variant="outline" onClick={saveMint}>Save</Button>
                      <Button
                        variant="outline"
                        onClick={async ()=>{
                          setState(p => ({ ...p, mint: "" }))
                          try { await api.setState({ mint: "" }) } catch {}
                          await refreshBalances()
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Selected</span>
                <span className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">{selectedCount}/{wallets.length}</span>
                <Button variant="outline" onClick={() => {
                  const next = {}
                  for (const w of wallets) next[w.publicKey] = true
                  setSelected(next)
                }}>Select All</Button>
                <Button variant="rose" onClick={removeSelectedWallets} disabled={!hasSelection}>Remove Selected</Button>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.45)]">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total Wallets</p>
                <p className="mt-2 text-xl font-semibold text-slate-100">{wallets.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.45)]">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total SOL</p>
                <p className="mt-2 text-xl font-semibold text-emerald-300">{Number(balances?.totals?.sol || 0).toFixed(3)} SOL</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.45)]">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total Token Holdings</p>
                <p className="mt-2 text-xl font-semibold text-indigo-300">{Number(balances?.totals?.token || 0).toFixed(2)}</p>
                {!state.mint ? <p className="mt-1 text-xs text-slate-500">Set a mint to load token balances</p> : null}
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.45)] space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-200">Batch Buy</h3>
                    <span className="cursor-help text-xs text-slate-500" title="Runs buy orders against all selected wallets using the overrides below. Concurrent mode spreads work across multiple wallets at once; Sequential runs them one after another.">?</span>
                  </div>
                  <SegTabs value={buyForm.mode} onChange={(v)=>setBuyForm(p=>({...p, mode:v}))} options={[{label:'Concurrent', value:'concurrent'},{label:'Sequential', value:'sequential'}]} />
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {buyForm.mode !== 'sequential' ? (
                    <MiniField label="Concurrency"><Input type="number" value={buyForm.concurrency} onChange={e=>setBuyForm(p=>({...p, concurrency:e.target.value}))} placeholder="8" /></MiniField>
                  ) : null}
                  <MiniField label="Slippage %"><Input type="number" step="1" value={buyForm.slippage} onChange={e=>setBuyForm(p=>({...p, slippage:e.target.value}))} placeholder="10" /></MiniField>
                  <MiniField label="Priority Fee (SOL)"><Input type="number" step="0.000001" value={buyForm.priorityFee} onChange={e=>setBuyForm(p=>({...p, priorityFee:e.target.value}))} placeholder="0.00001" /></MiniField>
                  <MiniField label="Buy % of SOL"><Input type="number" step="1" value={buyForm.percent||''} onChange={e=>setBuyForm(p=>({...p, percent:e.target.value}))} placeholder="50" /></MiniField>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex gap-2">
                    <Button variant="emerald" onClick={doBuy} disabled={buyStatus.running || !hasSelection}>Buy Selected</Button>
                    <Button variant="outline" onClick={()=>setBuyForm(p=>({...p, concurrency: String((hasSelection ? selectedCount : wallets.length) || 1)}))} disabled={buyForm.mode==='sequential'}>All</Button>
                  </div>
                  <div className="flex-1"><Progress variant="emerald" label="Buy Progress" value={buyStatus.done} total={buyStatus.total} running={buyStatus.running} /></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.45)] space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-200">Batch Sell</h3>
                    <span className="cursor-help text-xs text-slate-500" title="Executes sells against selected wallets using each wallet's Sell % or overrides. Sequential mode sells wallets one by one; Concurrent batches them together.">?</span>
                  </div>
                  <SegTabs value={sellForm.mode} onChange={(v)=>setSellForm(p=>({...p, mode:v}))} options={[{label:'Concurrent', value:'concurrent'},{label:'Sequential', value:'sequential'}]} />
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {sellForm.mode !== 'sequential' ? (
                    <MiniField label="Concurrency"><Input type="number" value={sellForm.concurrency} onChange={e=>setSellForm(p=>({...p, concurrency:e.target.value}))} placeholder="8" /></MiniField>
                  ) : null}
                  <MiniField label="Slippage %"><Input type="number" step="1" value={sellForm.slippage} onChange={e=>setSellForm(p=>({...p, slippage:e.target.value}))} placeholder="10" /></MiniField>
                  <MiniField label="Priority Fee (SOL)"><Input type="number" step="0.000001" value={sellForm.priorityFee} onChange={e=>setSellForm(p=>({...p, priorityFee:e.target.value}))} placeholder="0.00001" /></MiniField>
                  <MiniField label="Global Sell %"><Input type="number" step="1" value={sellForm.percent} onChange={e=>{
                    let v = e.target.value
                    const n = Number(v)
                    const clamped = isNaN(n) ? '' : String(Math.max(0, Math.min(100, n)))
                    setSellForm(p=>({...p, percent: clamped }))
                  }} placeholder="100" /></MiniField>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex gap-2">
                    <Button variant="rose" onClick={doSell} disabled={sellStatus.running || !hasSelection}>Sell Selected</Button>
                    <Button variant="outline" onClick={()=>setSellForm(p=>({...p, concurrency: String((hasSelection ? selectedCount : wallets.length) || 1)}))} disabled={sellForm.mode==='sequential'}>All</Button>
                  </div>
                  <div className="flex-1"><Progress variant="rose" label="Sell Progress" value={sellStatus.done} total={sellStatus.total} running={sellStatus.running} /></div>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setAutoRefresh(v=>!v)}>{autoRefresh ? 'Auto Refresh: On' : 'Auto Refresh: Off'}</Button>
              <Button variant="outline" onClick={()=>refreshBalances('manual')}>Refresh Balances</Button>
              <Button onClick={addWalletManual}>Import Wallet</Button>
            </div>

            <div className="space-y-4">
              {displayedWallets.length === 0 ? (
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 px-4 py-6 text-center text-sm text-slate-400">No wallets loaded yet.</div>
              ) : (
                displayedWallets.map((r) => {
                  const walletMeta = wallets.find(w => w.publicKey === r.publicKey) || {}
                  const isBuyer = r.role === 'buyer'
                  const isDev = r.role === 'dev'
                  const isSelected = !!selected[r.publicKey]
                  const balanceRow = r
                  const cardClasses = isDev
                    ? "rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-6 shadow-[0_10px_30px_rgba(16,185,129,0.35)] space-y-4"
                    : "rounded-2xl border border-slate-800/60 bg-slate-950/60 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.4)] space-y-4"
                  return (
                    <div key={r.publicKey} className={cardClasses}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {isBuyer ? (
                            <input type="checkbox" className="mt-1" checked={isSelected} onChange={e=>{
                              const checked = e.target.checked
                              setSelected(prev => ({ ...prev, [r.publicKey]: checked }))
                            }} />
                          ) : (
                            <span className="mt-1 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-emerald-300">Dev</span>
                          )}
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-slate-100">{isDev ? 'Developer Wallet' : r.name}</span>
                              {isBuyer ? (
                                <span className="rounded-full border border-slate-700/70 bg-slate-900/50 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-slate-400">{r.role}</span>
                              ) : null}
                            </div>
                            <CopyKey value={r.publicKey} className="mt-1 text-[11px] text-slate-400" onCopy={(v)=>log('copy','wallet address copied',{ value:v })} />
                          </div>
                        </div>
                        <div className="flex gap-6 text-sm text-slate-200">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">SOL</p>
                            <p className="mt-1 text-base font-semibold">{Number(balanceRow.sol).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Tokens</p>
                            <p className="mt-1 text-base font-semibold">{Number(balanceRow.token).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>

                      {(isBuyer || isDev) ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <MiniField label="Buy (SOL)">
                            {isBuyer ? (
                              <Input type="number" step="0.01" value={walletMeta.buySol ?? 0} onChange={(e)=>{
                                const v = Number(e.target.value || 0)
                                setWallets(prev=>prev.map(p=>p.publicKey===r.publicKey?{
                                  ...p,
                                  buySol: v,
                                  buyPercent: v>0 ? 0 : p.buyPercent,
                                }:p))
                              }} placeholder="0.00" />
                            ) : (
                              <Input type="number" step="0.01" value={devControls.buySol} onChange={(e)=>setDevControls(prev=>({ ...prev, buySol: e.target.value }))} placeholder="0.00" />
                            )}
                          </MiniField>
                          <MiniField label="Buy % of SOL">
                            {isBuyer ? (
                              <Input type="number" step="1" value={walletMeta.buyPercent ?? 0} onChange={(e)=>{
                                let v = e.target.value
                                const n = Number(v)
                                const clamped = isNaN(n) ? '' : String(Math.max(0, Math.min(100, n)))
                                const num = Number(clamped || 0)
                                setWallets(prev=>prev.map(p=>p.publicKey===r.publicKey?{
                                  ...p,
                                  buyPercent: num,
                                  buySol: num>0 ? 0 : p.buySol,
                                }:p))
                              }} placeholder="50" />
                            ) : (
                              <Input type="number" step="1" value={devControls.buyPercent} onChange={(e)=>{
                                let v = e.target.value
                                const n = Number(v)
                                const clamped = isNaN(n) ? '' : String(Math.max(0, Math.min(100, n)))
                                setDevControls(prev=>({ ...prev, buyPercent: clamped }))
                              }} placeholder="50" />
                            )}
                          </MiniField>
                          <MiniField label="Sell %">
                            {isBuyer ? (
                              <Input type="number" step="1" value={walletMeta.sellPercent ?? 0} onChange={(e)=>{
                                let v = e.target.value
                                const n = Number(v)
                                const clamped = isNaN(n) ? '' : String(Math.max(0, Math.min(100, n)))
                                setWallets(prev=>prev.map(p=>p.publicKey===r.publicKey?{...p, sellPercent: Number(clamped || 0)}:p))
                              }} placeholder="50" />
                            ) : (
                              <Input type="number" step="1" value={devControls.sellPercent} onChange={(e)=>{
                                let v = e.target.value
                                const n = Number(v)
                                const clamped = isNaN(n) ? '' : String(Math.max(0, Math.min(100, n)))
                                setDevControls(prev=>({ ...prev, sellPercent: clamped }))
                              }} placeholder="50" />
                            )}
                          </MiniField>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-2">
                          <Button variant="emerald" onClick={async()=>{
                            if (!state.mint) { await log('ui', `${isDev ? 'Dev' : 'Row'} buy skipped`, { reason:'set contract address', wallet:r.publicKey }); return }
                            if (isBuyer) {
                              const amt = Number(walletMeta.buySol || 0)
                              if (!amt || amt<=0) { await log('ui','Row buy skipped',{ reason:'no amount', wallet:r.publicKey }); return }
                              try {
                                const res = await api.buyOne({ pubkey:r.publicKey, mint: state.mint, amountSol: amt, slippage: Number(buyForm.slippage), priorityFee: Number(buyForm.priorityFee) })
                                if (res?.error) { await log('ui','Row buy failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('buy','Row buy success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Row buy failed',{ wallet:r.publicKey, error: String(e) }) }
                            } else if (isDev) {
                              const amt = Number(devControls.buySol || 0)
                              if (!amt || amt<=0) { await log('ui','Dev buy skipped',{ reason:'no amount' }); return }
                              try {
                                const res = await api.buyOne({ pubkey:r.publicKey, mint: state.mint, amountSol: amt, slippage: Number(buyForm.slippage), priorityFee: Number(buyForm.priorityFee) })
                                if (res?.error) { await log('ui','Dev buy failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('buy','Dev buy success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Dev buy failed',{ wallet:r.publicKey, error: String(e) }) }
                            }
                            await refreshBalances()
                          }}>Buy</Button>
                          <Button variant="emerald" onClick={async()=>{
                            if (!state.mint) { await log('ui', `${isDev ? 'Dev' : 'Row'} buy% skipped`, { reason:'set contract address', wallet:r.publicKey }); return }
                            if (isBuyer) {
                              const pct = Number(walletMeta.buyPercent || 0)
                              if (!pct || pct<=0) { await log('ui','Row buy% skipped',{ reason:'no percent', wallet:r.publicKey }); return }
                              const balSol = Number(balanceRow?.sol || 0)
                              const feeBuffer = 0.03
                              const available = Math.max(0, balSol - feeBuffer)
                              const amt = Math.max(0, (pct / 100) * available)
                              if (!amt || amt<=0) { await log('ui','Row buy% skipped',{ reason:'insufficient SOL', wallet:r.publicKey }); return }
                              try {
                                const res = await api.buyOne({ pubkey:r.publicKey, mint: state.mint, amountSol: amt, slippage: Number(buyForm.slippage), priorityFee: Number(buyForm.priorityFee) })
                                if (res?.error) { await log('ui','Row buy% failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('buy','Row buy% success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Row buy% failed',{ wallet:r.publicKey, error: String(e) }) }
                            } else if (isDev) {
                              const pct = Number(devControls.buyPercent || 0)
                              if (!pct || pct<=0) { await log('ui','Dev buy% skipped',{ reason:'no percent' }); return }
                              const balSol = Number(balanceRow?.sol || 0)
                              const feeBuffer = 0.03
                              const available = Math.max(0, balSol - feeBuffer)
                              const amt = Math.max(0, (pct / 100) * available)
                              if (!amt || amt<=0) { await log('ui','Dev buy% skipped',{ reason:'insufficient SOL' }); return }
                              try {
                                const res = await api.buyOne({ pubkey:r.publicKey, mint: state.mint, amountSol: amt, slippage: Number(buyForm.slippage), priorityFee: Number(buyForm.priorityFee) })
                                if (res?.error) { await log('ui','Dev buy% failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('buy','Dev buy% success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Dev buy% failed',{ wallet:r.publicKey, error: String(e) }) }
                            }
                            await refreshBalances()
                          }}>Buy %</Button>
                          <Button variant="rose" onClick={async()=>{
                            if (!state.mint) { await log('ui', `${isDev ? 'Dev' : 'Row'} sell skipped`, { reason:'set contract address', wallet:r.publicKey }); return }
                            if (isBuyer) {
                              const pct = Number(walletMeta.sellPercent || 0)
                              if (!pct || pct<=0) { await log('ui','Row sell skipped',{ reason:'no percent', wallet:r.publicKey }); return }
                              const balTokens = Number(balanceRow?.token || 0)
                              const amt = (pct / 100) * balTokens
                              if (!amt || amt<=0) { await log('ui','Row sell skipped',{ reason:'no tokens to sell', wallet:r.publicKey }); return }
                              try {
                                const res = await api.sellOne({ pubkey:r.publicKey, mint: state.mint, percent: pct, slippage: Number(sellForm.slippage), priorityFee: Number(sellForm.priorityFee) })
                                if (res?.error) { await log('ui','Row sell failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('sell','Row sell success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Row sell failed',{ wallet:r.publicKey, error: String(e) }) }
                            } else if (isDev) {
                              const pct = Number(devControls.sellPercent || 0)
                              if (!pct || pct<=0) { await log('ui','Dev sell skipped',{ reason:'no percent' }); return }
                              const balTokens = Number(balanceRow?.token || 0)
                              const amt = (pct / 100) * balTokens
                              if (!amt || amt<=0) { await log('ui','Dev sell skipped',{ reason:'no tokens to sell' }); return }
                              try {
                                const res = await api.sellOne({ pubkey:r.publicKey, mint: state.mint, percent: pct, slippage: Number(sellForm.slippage), priorityFee: Number(sellForm.priorityFee) })
                                if (res?.error) { await log('ui','Dev sell failed',{ wallet:r.publicKey, error: res.error }); return }
                                if (res?.signature) await log('sell','Dev sell success',{ wallet:r.publicKey, sig: res.signature })
                              } catch (e) { await log('ui','Dev sell failed',{ wallet:r.publicKey, error: String(e) }) }
                            }
                            await refreshBalances()
                          }}>Sell</Button>
                        </div>
                        <div className="flex gap-2">
                          {isBuyer ? (
                            <>
                              <Button variant="outline" onClick={()=>assignDevWalletFrom(r.publicKey)}>Set Dev</Button>
                              <Button variant="outline" onClick={()=>exportWalletSecret(r.publicKey)}>Export Key</Button>
                              <Button variant="rose" onClick={()=>removeWallet(r.publicKey)}>Remove</Button>
                            </>
                          ) : (
                            <Button variant="outline" onClick={exportDevWalletSecret}>Export Key</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {(hiddenWalletCount > 0 || showAllWallets) ? (
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={()=>setShowAllWallets(v=>!v)}>{showAllWallets ? 'Collapse Wallets' : `Show All Wallets (${hiddenWalletCount} more)`}</Button>
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              <Button variant="outline" onClick={saveWalletBuyAmounts}>Save Buy Amounts</Button>
              <span className="text-xs text-slate-400">Edits are local until saved</span>
            </div>
          </Section>
        </div>

        <div className="col-span-12">
          <Section
            title="Activity Log"
            toolbar={
              <Button variant="outline" onClick={clearLogs} disabled={!logs.length}>
                Clear Logs
              </Button>
            }
          >
            <div className="max-h-96 overflow-auto">
              <LogsPanel logs={logs} />
            </div>
          </Section>
        </div>

      </main>
    </div>
  )
}
