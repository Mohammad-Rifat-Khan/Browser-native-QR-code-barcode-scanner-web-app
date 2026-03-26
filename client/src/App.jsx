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
  const [theme, setTheme] = useState('light')
  const [copied, setCopied] = useState(null)
  const [view, setView] = useState('scanner') // 'scanner' or 'history'
  const [lastScanResult, setLastScanResult] = useState(null) // Show scan result popup
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
      // Show success popup with scan result (stays until user closes)
      setLastScanResult({
        value: decodedText,
        type: formatName,
      })
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

  const getRelativeTime = useCallback((dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)
    
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString()
  }, [])

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

  // Auto-start scanner when in scanner view
  useEffect(() => {
    if (view === 'scanner' && !isScanning && !cameraError) {
      startScanner().catch(() => undefined)
    }
  }, [view])

  return (
    <div className={`app-root ${theme}`}>
      <header className="app-nav">
        <div className="nav-content">
          <button
            type="button"
            className={`nav-button ${view === 'history' ? 'active' : ''}`}
            onClick={() => setView(view === 'history' ? 'scanner' : 'history')}
            title={view === 'history' ? 'Back to scanner' : 'View history'}
            aria-label="Toggle history view"
          >
            📋 History
          </button>
          <h1 className="nav-title">Scanner Console</h1>
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
      </header>

      <main className={`app-shell view-${view}`}>
        {view === 'scanner' ? (
          // SCANNER VIEW - Auto-detecting camera
          <section className="scanner-view">
            <div id="scanner-reader" className="scanner-reader" />
            <div className="status-section">
              <div className={`status-text ${cameraError ? 'status-error' : isScanning ? 'status-live' : 'status-idle'}`}>
                {cameraError ? <IconError /> : <IconCamera />}
                <span>{formattedStatus}</span>
              </div>
            </div>
            {lastScanResult && (
              <div className="scan-result-popup">
                <button
                  type="button"
                  className="scan-result-close"
                  onClick={() => setLastScanResult(null)}
                  title="Close"
                  aria-label="Close scan result"
                >
                  ✕
                </button>
                <div className="scan-result-content">
                  <p className="scan-result-type">✓ {lastScanResult.type}</p>
                  <p className="scan-result-value">{lastScanResult.value}</p>
                  <p className="scan-result-time">{new Date().toLocaleTimeString()}</p>
                </div>
              </div>
            )}
          </section>
        ) : (
          // HISTORY VIEW - Search, filter, and results
          <section className="history-view">
            <div className="quick-controls">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="🔍 Search scans..."
                aria-label="Search scan history"
                className="search-input"
              />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="Filter scan history by type"
                className="filter-select"
              >
                <option value="ALL">All Codes</option>
                <option value="QR_CODE">QR Codes</option>
                <option value="EAN_13">EAN-13</option>
                <option value="MANUAL">Manual</option>
              </select>
              <button
                type="button"
                className={`btn btn-secondary btn-icon ${!history.length ? 'disabled' : ''}`}
                onClick={exportAsCSV}
                disabled={!history.length}
                title="Download as CSV"
                aria-label="Export history as CSV"
              >
                📥
              </button>
            </div>

            <div className="history-header">
              <h2>Scan History</h2>
              <span className="count-badge">{history.length}</span>
            </div>

            <ul className="history-list">
              {history.map((scan) => (
                <li key={scan.id} className="history-item">
                  <div className="history-content">
                    <p className="history-value">{scan.value}</p>
                    <p className="history-meta">
                      <span className="scan-type">{scan.type}</span>
                      <span className="scan-time">{getRelativeTime(scan.scanned_at)}</span>
                    </p>
                    <p className="history-device">
                      {scan.device_info?.browser || 'Unknown'} • {scan.device_info?.platform || 'Unknown'}
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
                      {copied === scan.id ? '✓' : <IconCopy />}
                    </button>
                    {scan.is_duplicate ? <span className="duplicate-badge">Dup</span> : null}
                  </div>
                </li>
              ))}
              {!history.length ? (
                <li className="empty-state">
                  <p>No scans recorded yet</p>
                  <p className="empty-subtitle">Scan codes in scanner mode to see them here</p>
                </li>
              ) : null}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

export default App

