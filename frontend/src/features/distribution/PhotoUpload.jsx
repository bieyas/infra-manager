import React, { useRef, useState } from 'react'
import { Camera, Upload, X, Image, Loader2 } from 'lucide-react'

/**
 * Compress image using canvas
 */
function compressImage(base64, quality = 0.8, maxWidth = 1920) {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = base64
  })
}

/**
 * Photo upload component — capture from camera or pick from gallery.
 * photos: Array<{ url: string, caption?: string }> (base64 or blob URLs)
 * onChange: (photos) => void
 * settings?: { compression?: boolean, quality?: number, maxSize?: number }
 */
export default function PhotoUpload({ photos = [], onChange, settings = {} }) {
  const fileRef   = useRef(null)
  const cameraRef = useRef(null)
  const [converting, setConverting] = useState(false)

  const {
    compression = true,
    quality = 80,
    maxSize = 10,
  } = settings

  const toBase64 = (file) =>
    new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res(reader.result)
      reader.onerror = rej
      reader.readAsDataURL(file)
    })

  const handleFiles = async (files) => {
    if (!files?.length) return

    // Check file size limit
    const maxBytes = maxSize * 1024 * 1024
    const oversized = Array.from(files).filter(f => f.size > maxBytes)
    if (oversized.length > 0) {
      alert(`File terlalu besar (maks ${maxSize}MB): ${oversized.map(f => f.name).join(', ')}`)
      return
    }

    setConverting(true)
    try {
      const newPhotos = await Promise.all(
        Array.from(files).map(async (file) => {
          let url = await toBase64(file)

          // Compress if enabled and file is large (>500KB) or is PNG
          if (compression && (file.size > 500000 || file.type === 'image/png')) {
            url = await compressImage(url, quality / 100, 1920)
          }

          return {
            url,
            caption: file.name.replace(/\.[^/.]+$/, ''),
            size:    file.size,
            type:    file.type,
          }
        })
      )
      onChange([...photos, ...newPhotos])
    } finally {
      setConverting(false)
    }
  }

  const removePhoto = (idx) => {
    onChange(photos.filter((_, i) => i !== idx))
  }

  const updateCaption = (idx, caption) => {
    onChange(photos.map((p, i) => i === idx ? { ...p, caption } : p))
  }

  return (
    <div className="space-y-3">
      {/* Upload buttons */}
      <div className="flex gap-2">
        {/* Camera — opens device camera directly on mobile */}
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-secondary hover:text-primary hover:border-[var(--accent)]/50 transition-colors"
        >
          <Camera size={13} />
          Kamera
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {/* Gallery picker */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-secondary hover:text-primary hover:border-[var(--accent)]/50 transition-colors"
        >
          <Upload size={13} />
          Unggah Foto
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />

        {converting && (
          <span className="flex items-center gap-1 text-xs text-muted ml-1">
            <Loader2 size={12} className="animate-spin" /> Memproses…
          </span>
        )}
      </div>

      {/* Drop zone — shown when no photos yet */}
      {photos.length === 0 && (
        <label className="block border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center cursor-pointer hover:border-[var(--accent)]/50 hover:bg-[var(--accent-glow)] transition-colors">
          <input
            type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <Image size={24} className="mx-auto text-muted mb-2" />
          <p className="text-xs text-muted">Seret foto ke sini atau klik untuk memilih</p>
          <p className="text-[10px] text-muted mt-0.5">JPG, PNG, WEBP — maks 5 MB per foto</p>
        </label>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, idx) => (
            <div key={idx} className="group relative rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
              <img
                src={photo.url}
                alt={photo.caption || `Foto ${idx + 1}`}
                className="w-full h-28 object-cover"
              />
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X size={11} />
              </button>
              {/* Caption input */}
              <div className="p-1.5">
                <input
                  value={photo.caption ?? ''}
                  onChange={e => updateCaption(idx, e.target.value)}
                  placeholder="Keterangan foto…"
                  className="w-full text-[10px] bg-transparent text-muted placeholder:text-muted/50 focus:outline-none focus:text-primary"
                />
              </div>
            </div>
          ))}

          {/* Add more button */}
          <label className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-[var(--border)] text-muted hover:border-[var(--accent)]/50 hover:text-primary cursor-pointer transition-colors">
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={e => handleFiles(e.target.files)} />
            <Upload size={16} />
            <span className="text-[10px] mt-1">Tambah</span>
          </label>
        </div>
      )}
    </div>
  )
}
