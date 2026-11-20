import React, { useState, useRef, useEffect } from 'react'
import {
  X, UploadCloud, Download, CheckCircle2, AlertCircle,
  FileSpreadsheet, Loader2, RefreshCw, ArrowRight, Eye, Check, FileDown
} from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../context/ToastContext'

export default function BulkImportCoordsModal({ isOpen, onClose, onImportSuccess }) {
  const dialogRef = useRef(null)
  const fileInputRef = useRef(null)
  const toast = useToast()

  const [fileName, setFileName] = useState('')
  const [rawText, setRawText] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'paste'

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setFileName('')
      setRawText('')
      setParsedRows([])
      setImportResult(null)
    }
  }, [isOpen])

  // Native <dialog> open/close control
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (isOpen) {
      if (!d.open) d.showModal()
    } else {
      if (d.open) d.close()
    }
  }, [isOpen])

  // Light dismiss fallback for Safari
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const handleClick = (e) => {
      if (e.target !== d) return
      const r = d.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        onClose?.()
      }
    }
    d.addEventListener('click', handleClick)
    return () => d.removeEventListener('click', handleClick)
  }, [onClose])

  // Download Excel Template Handler
  const handleDownloadExcel = async () => {
    setDownloadingExcel(true)
    try {
      const blob = await api.blob('/customers/export-coords-excel')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `template_koordinat_pelanggan_jgrt_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast?.success('Template Excel (.xlsx) berhasil didownload!')
    } catch (err) {
      toast?.error(err.message || 'Gagal mendownload template Excel')
    } finally {
      setDownloadingExcel(false)
    }
  }

  // Parse Excel ArrayBuffer
  const parseExcelBuffer = async (buffer) => {
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('pelanggan')) || workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      if (!rows || rows.length < 2) {
        toast?.error('File Excel kosong atau tidak memiliki baris data')
        return
      }

      const headerRow = rows[0].map(h => String(h || '').trim().toLowerCase())

      let keyIdx = headerRow.findIndex(h => h.includes('id') || h.includes('customer'))
      let nameIdx = headerRow.findIndex(h => h.includes('nama') || h.includes('name'))
      let tikorIdx = headerRow.findIndex(h => h.includes('titik') || h.includes('link') || h.includes('maps') || h.includes('koordinat'))
      let latIdx = headerRow.findIndex(h => h === 'latitude' || h === 'lat')
      let lngIdx = headerRow.findIndex(h => h === 'longitude' || h === 'lng')

      if (keyIdx === -1) keyIdx = 0
      if (nameIdx === -1) nameIdx = 1
      if (tikorIdx === -1) tikorIdx = 7
      if (latIdx === -1) latIdx = 5
      if (lngIdx === -1) lngIdx = 6

      const parsed = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const key = String(row[keyIdx] || '').trim()
        const name = String(row[nameIdx] || key).trim()
        if (!key && !name) continue

        const isSample = key.toUpperCase().startsWith('CONTOH') || name.toUpperCase().includes('CONTOH')
        const tikor = String(row[tikorIdx] || '').trim()
        const latVal = String(row[latIdx] || '').trim()
        const lngVal = String(row[lngIdx] || '').trim()

        let hasCoords = false
        if ((latVal && lngVal && !isNaN(parseFloat(latVal)) && !isNaN(parseFloat(lngVal))) || (tikor && tikor.length > 3 && !isSample)) {
          hasCoords = true
        }

        parsed.push({
          rowNum: i + 1,
          key,
          name,
          tikor,
          lat: latVal,
          lng: lngVal,
          isSample,
          hasCoords
        })
      }

      setParsedRows(parsed)
      toast?.success(`Berhasil membaca ${parsed.length} baris data dari Excel`)
    } catch (err) {
      console.error(err)
      toast?.error('Gagal membaca file Excel: ' + err.message)
    }
  }

  // Parse CSV text
  const parseCsvText = (text) => {
    if (!text || !text.trim()) {
      setParsedRows([])
      return
    }

    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) {
      setParsedRows([])
      return
    }

    const splitCsvLine = (line) => {
      const result = []
      let curr = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            curr += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (c === ',' && !inQuotes) {
          result.push(curr.trim())
          curr = ''
        } else {
          curr += c
        }
      }
      result.push(curr.trim())
      return result
    }

    const headerLine = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    let keyIdx = headerLine.findIndex(h => h.includes('id') || h.includes('customer') || h.includes('username') || h.includes('nama') || h.includes('name'))
    let tikorIdx = headerLine.findIndex(h => h.includes('tikor') || h.includes('link') || h.includes('maps') || h.includes('koordinat'))
    let latIdx = headerLine.findIndex(h => h === 'latitude' || h === 'lat')
    let lngIdx = headerLine.findIndex(h => h === 'longitude' || h === 'lng')

    if (keyIdx === -1) keyIdx = 0
    if (tikorIdx === -1) tikorIdx = headerLine.length > 7 ? 7 : (headerLine.length - 1)

    const parsed = []
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i])
      const key = cols[keyIdx] || ''
      if (!key) continue

      const isSample = key.startsWith('CONTOH_')
      const tikor = tikorIdx !== -1 ? cols[tikorIdx] : ''
      const latVal = latIdx !== -1 ? cols[latIdx] : ''
      const lngVal = lngIdx !== -1 ? cols[lngIdx] : ''

      let hasCoords = false
      if ((latVal && lngVal && !isNaN(parseFloat(latVal))) || (tikor && tikor.trim() && !tikor.includes('CONTOH'))) {
        hasCoords = true
      }

      parsed.push({
        rowNum: i + 1,
        key,
        name: cols[1] || key,
        tikor,
        lat: latVal,
        lng: lngVal,
        isSample,
        hasCoords
      })
    }

    setParsedRows(parsed)
  }

  // Handle File Input (.xlsx, .xls, .csv)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setImportResult(null)

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = async (evt) => {
        await parseExcelBuffer(evt.target.result)
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (evt) => {
        parseCsvText(evt.target.result)
      }
      reader.readAsText(file)
    }
  }

  // Handle Drag & Drop
  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setFileName(file.name)
    setImportResult(null)

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = async (evt) => {
        await parseExcelBuffer(evt.target.result)
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (evt) => {
        parseCsvText(evt.target.result)
      }
      reader.readAsText(file)
    }
  }

  // Submit Parsed Rows to Backend
  const handleSubmit = async () => {
    const validItems = parsedRows.filter(r => !r.isSample && r.hasCoords)
    if (validItems.length === 0) {
      toast?.error('Tidak ada data koordinat valid untuk disimpan')
      return
    }

    setSubmitting(true)
    try {
      const payload = validItems.map(r => ({
        customerId: r.key,
        name: r.name,
        rawCoord: r.tikor,
        lat: r.lat ? parseFloat(r.lat) : undefined,
        lng: r.lng ? parseFloat(r.lng) : undefined
      }))

      const res = await api.post('/customers/bulk-coords', { items: payload })
      setImportResult(res)
      toast?.success(`Berhasil mengupdate koordinat ${res.updatedCount} pelanggan!`)
      onImportSuccess?.()
    } catch (err) {
      toast?.error(err.message || 'Gagal menyimpan koordinat massal')
    } finally {
      setSubmitting(false)
    }
  }

  const validCount = parsedRows.filter(r => !r.isSample && r.hasCoords).length
  const emptyCount = parsedRows.filter(r => !r.isSample && !r.hasCoords).length
  const sampleCount = parsedRows.filter(r => r.isSample).length

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      className="p-0 bg-transparent backdrop:bg-black/60 max-w-2xl w-full rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden text-primary"
    >
      <div className="bg-[var(--bg-primary)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-primary">Import Koordinat Pelanggan (Excel / CSV)</h3>
              <p className="text-[11px] text-muted">Isi koordinat banyak pelanggan sekaligus melalui Excel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Step 1: Download Template Banner */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <FileDown size={15} /> 1. Download Template Excel (.xlsx)
              </h4>
              <p className="text-[11px] text-emerald-200/80">
                Berisi 252 daftar pelanggan terkini. Anda cukup paste link Google Maps atau angka koordinat di Kolom H.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm shrink-0 disabled:opacity-50"
            >
              {downloadingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>Download Excel (.xlsx)</span>
            </button>
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`pb-1 font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-muted hover:text-primary'
              }`}
            >
              <UploadCloud size={14} /> Upload File Excel (.xlsx / .csv)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`pb-1 font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'paste'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-muted hover:text-primary'
              }`}
            >
              <RefreshCw size={14} /> Paste Teks CSV
            </button>
          </div>

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--border)] hover:border-emerald-500/60 bg-[var(--bg-secondary)]/50 rounded-2xl p-6 text-center cursor-pointer transition-colors space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <UploadCloud size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary">
                    {fileName ? (
                      <span className="text-emerald-400 font-mono">{fileName}</span>
                    ) : (
                      'Klik untuk memilih file Excel atau seret (drag & drop) ke sini'
                    )}
                  </p>
                  <p className="text-[11px] text-muted">
                    Format file yang didukung: <span className="font-semibold text-emerald-400">.xlsx</span>, .xls, atau .csv
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Paste Tab */}
          {activeTab === 'paste' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-secondary">
                Paste baris CSV atau tabel copy dari spreadsheet:
              </label>
              <textarea
                rows={5}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value)
                  parseCsvText(e.target.value)
                }}
                placeholder="customer_id,nama_pelanggan,...,titik_koordinat_atau_link_maps&#10;CUST-001,Budi,...,https://maps.app.goo.gl/xxx"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {/* Parsed Summary Stats */}
          {parsedRows.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-300 block font-medium">Siap Di-update</span>
                <span className="text-base font-bold text-emerald-400">{validCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] text-amber-300 block font-medium">Belum Ada Tikor</span>
                <span className="text-base font-bold text-amber-400">{emptyCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                <span className="text-[10px] text-muted block font-medium">Total Baris</span>
                <span className="text-base font-bold text-primary">{parsedRows.length}</span>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-secondary">
                <span className="flex items-center gap-1.5">
                  <Eye size={13} /> Preview 10 Baris Pertama
                </span>
                <span className="text-[10px] text-muted">Total: {parsedRows.length} baris</span>
              </div>
              <div className="border border-[var(--border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border)] text-muted sticky top-0">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Pelanggan</th>
                      <th className="py-2 px-3">Tikor / Link Maps</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {parsedRows.slice(0, 10).map((r, idx) => (
                      <tr key={idx} className={r.isSample ? 'opacity-40 bg-[var(--bg-secondary)]/30' : ''}>
                        <td className="py-1.5 px-3 font-mono text-[10px] text-muted">{r.rowNum}</td>
                        <td className="py-1.5 px-3 font-medium text-primary">
                          {r.name}
                          <span className="text-[10px] text-muted font-mono block">{r.key}</span>
                        </td>
                        <td className="py-1.5 px-3 font-mono text-[10px] text-muted truncate max-w-[200px]" title={r.tikor}>
                          {r.tikor || (r.lat && r.lng ? `${r.lat}, ${r.lng}` : '-')}
                        </td>
                        <td className="py-1.5 px-3">
                          {r.isSample ? (
                            <span className="text-[10px] text-muted">Dilewati</span>
                          ) : r.hasCoords ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                              <Check size={10} /> Valid
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted">Belum diisi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Result Summary */}
          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs">
              <h4 className="font-bold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 size={16} />
                Laporan Hasil Import
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>Total Data: <span className="font-semibold">{importResult.totalReceived}</span></div>
                <div className="text-emerald-400">Berhasil Update: <span className="font-semibold">{importResult.updatedCount}</span></div>
                <div className="text-muted">Dilewati / Gagal: <span className="font-semibold">{importResult.skippedCount}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--border)] text-secondary hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
          >
            {importResult ? 'Selesai' : 'Tutup'}
          </button>

          {!importResult && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || validCount === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              <span>{submitting ? 'Memproses...' : `Terapkan ${validCount} Koordinat`}</span>
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
