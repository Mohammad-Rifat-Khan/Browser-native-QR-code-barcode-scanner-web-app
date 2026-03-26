import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { io } from 'socket.io-client'
import './App.css'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:4000'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL?.trim() || API_BASE_URL

const IconCamera = () => <span className="icon">📷</span>
const IconError = () => <span className="icon">⚠</span>
const IconCopy = () => <span className="icon">📋</span>

function App() {
  const [isScanning, setIsScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState('Ready to scan')
  const [cameraError, setCameraError] = useState('')
  const [history, setHistory] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [manualValue, setManualValue] = useState('')
  const [manualType, setManualType] = useState('QR_CODE')
  const [theme, setTheme] = useState('light')
  const [copied, setCopied] = useState(null)
  const scannerRef = useRef(null)
  const socketRef = useRef(null)
  const lastScanRef = useRef(null)

  const fetchHistory = useCallback(async () => {
    const response = await axios.get(`${API_BASE_URL}/api/scans`, {
      params: {
        search: search || undefined,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
      },
    })
    setHistory(response.data.scans)
  }, [search, typeFilter])

  const saveScan = useCallback(async (value, type) => {
    const response = await axios.post(`${API_BASE_URL}/api/scans`, {
      value,
      type,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      },
    })

    const scan = response.data.scan
    setScanStatus(
      scan.is_duplicate
        ? `Duplicate detected and saved: ${scan.value}`
        : `Saved ${scan.type}: ${scan.value}`,
    )

    if (search || typeFilter !== 'ALL') {
      await fetchHistory()
    } else {
      setHistory((prev) => [scan, ...prev])
    }
  }, [fetchHistory, search, typeFilter])

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) {
      return
    }

    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop()
      }
      await scannerRef.current.clear()
    } catch {
      // Ignore cleanup errors to avoid blocking the UI.
    } finally {
      scannerRef.current = null
      setIsScanning(false)
    }
  }, [])

  const handleScanSuccess = useCallback(async (decodedText, decodedResult) => {
    const parsed = decodedResult

    const formatName = parsed?.result?.format?.formatName || 'UNKNOWN'
    if (formatName !== 'QR_CODE' && formatName !== 'EAN_13') {
      return
    }

    const now = Date.now()
    if (lastScanRef.current && lastScanRef.current.value === decodedText && now - lastScanRef.current.at < 1500) {
      return
    }
    lastScanRef.current = { value: decodedText, at: now }

    try {
      await saveScan(decodedText, formatName)
    } catch {
      setScanStatus('Scan read, but failed to save. Check connection and retry.')
    }
  }, [saveScan])

  const startScanner = useCallback(async () => {
    setCameraError('')
    setScanStatus('Starting camera...')

    const scanner = new Html5Qrcode('scanner-reader', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
      ],
      verbose: false,
    })

    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: { exact: 'environment' } },
        { fps: 8, qrbox: { width: 260, height: 180 }, aspectRatio: 1.6 },
        handleScanSuccess,
        () => undefined,
      )
      setIsScanning(true)
      setScanStatus('Camera active. Point at a QR or EAN-13 barcode.')
    } catch {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 260, height: 180 }, aspectRatio: 1.6 },
          handleScanSuccess,
          () => undefined,
        )
        setIsScanning(true)
        setScanStatus('Camera active. Point at a QR or EAN-13 barcode.')
      } catch {
        setCameraError(
          'Camera access is blocked or unavailable. You can allow permission in browser settings or use manual entry below.',
        )
        setScanStatus('Camera unavailable')
        await stopScanner()
      }
    }
  }, [handleScanSuccess, stopScanner])

  const handleManualSubmit = async (event) => {
    event.preventDefault()
    const value = manualValue.trim()

    if (!value) {
      return
    }

    try {
      await saveScan(value, manualType)
      setManualValue('')
    } catch {
      setScanStatus('Manual entry failed to save. Try again.')
    }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => undefined)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const exportAsCSV = () => {
    if (!history.length) {
      alert('No scans to export')
      return
    }

    const headers = ['ID', 'Value', 'Type', 'Scanned At', 'Browser', 'Platform', 'Is Duplicate']
    const rows = history.map((scan) => [
      scan.id,
      `"${scan.value}"`, // Quote to handle commas in values
      scan.type,
      new Date(scan.scanned_at).toLocaleString(),
      scan.device_info?.browser || 'Unknown',
      scan.device_info?.platform || 'Unknown',
      scan.is_duplicate ? 'Yes' : 'No',
    ])

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', `scan_history_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formattedStatus = useMemo(() => {
    if (cameraError) {
      return cameraError
    }
    return scanStatus
  }, [cameraError, scanStatus])

  useEffect(() => {
    fetchHistory().catch(() => setScanStatus('Unable to load history right now.'))
  }, [fetchHistory])

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current.on('scan:created', (scan) => {
      if (search || typeFilter !== 'ALL') {
        fetchHistory().catch(() => undefined)
        return
      }

      setHistory((prev) => {
        const deduped = prev.filter((item) => item.id !== scan.id)
        return [scan, ...deduped]
      })
    })

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [fetchHistory, search, typeFilter])

  useEffect(() => {
    return () => {
      stopScanner().catch(() => undefined)
    }
  }, [stopScanner])

  return (
    <div className={`app-root ${theme}`}>
      <main className="app-shell">
        <header className="app-header">
          <div className="header-top">
            <div>
              <p className="eyebrow">OmniDevX Studio Task</p>
              <h1>Scanner Console</h1>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <p className="subtitle">Scan QR and EAN-13 codes instantly. Every read syncs in real time.</p>
        </header>

        {/* Quick access search and filter - mobile friendly */}
        <section className="quick-controls">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="🔍 Search scans"
            aria-label="Search scan history"
            className="search-input"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filter scan history by type"
            className="filter-select"
          >
            <option value="ALL">All</option>
            <option value="QR_CODE">QR</option>
            <option value="EAN_13">EAN</option>
            <option value="MANUAL">Manual</option>
          </select>
          <button
            type="button"
            className={`btn btn-secondary btn-icon ${!history.length ? 'disabled' : ''}`}
            onClick={exportAsCSV}
            disabled={!history.length}
            title="Export CSV"
            aria-label="Export history as CSV"
          >
            📥
          </button>
        </section>

        <section className="scanner-card">
          <div className="card-top">
            <div className="card-title-group">
              <h2><IconCamera /> Camera Scanner</h2>
            </div>
            <span className={`status-chip ${cameraError ? 'status-error' : isScanning ? 'status-live' : 'status-idle'}`}>
              {cameraError ? 'Error' : isScanning ? 'Live' : 'Idle'}
            </span>
          </div>

          <div id="scanner-reader" className="scanner-reader" />

          <div className="status-section">
            <div className={`status-text ${cameraError ? 'status-error' : ''}`}>
              {cameraError ? <IconError /> : <IconCamera />}
              <span>{formattedStatus}</span>
            </div>
          </div>

          <div className="scanner-actions">
            <button type="button" className="btn btn-primary" onClick={startScanner} disabled={isScanning}>
              {isScanning ? 'Camera running...' : 'Start camera'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => stopScanner()} disabled={!isScanning}>
              Stop camera
            </button>
          </div>
        </section>

        <section className="manual-card">
          <h2>Manual Entry</h2>
          <p className="card-description">Enter or paste scan data when camera is unavailable</p>
          <form onSubmit={handleManualSubmit} className="manual-form">
            <input
              type="text"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="Paste QR text or enter EAN-13 digits"
              aria-label="Manual scan value"
            />

            <select
              value={manualType}
              onChange={(event) => setManualType(event.target.value)}
              aria-label="Manual scan type"
            >
              <option value="QR_CODE">QR code</option>
              <option value="EAN_13">EAN-13</option>
              <option value="MANUAL">Other manual</option>
            </select>

            <button type="submit" className="btn btn-primary btn-full">Save entry</button>
          </form>
        </section>

        <section className="history-card">
          <div className="card-top">
            <h2>Scan History</h2>
            <span className="count-badge">{history.length}</span>
          </div>

          <ul className="history-list">
            {history.map((scan) => (
              <li key={scan.id} className="history-item">
                <div className="history-content">
                  <p className="history-value">{scan.value}</p>
                  <p className="history-meta">
                    {scan.type} · {new Date(scan.scanned_at).toLocaleString()}
                  </p>
                  <p className="history-device">
                    {scan.device_info?.browser || 'Unknown browser'} on {scan.device_info?.platform || 'Unknown platform'}
                  </p>
                </div>
                <div className="history-actions">
                  <button
                    type="button"
                    className={`btn-copy ${copied === scan.id ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(scan.value, scan.id)}
                    title="Copy to clipboard"
                    aria-label="Copy to clipboard"
                  >
                    {copied === scan.id ? '✓ Copied' : <IconCopy />}
                  </button>
                  {scan.is_duplicate ? <span className="duplicate-badge">Duplicate</span> : null}
                </div>
              </li>
            ))}
            {!history.length ? (
              <li className="empty-state">
                <p>No scans yet.</p>
                <p className="empty-subtitle">Use camera or manual entry to start scanning.</p>
              </li>
            ) : null}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
