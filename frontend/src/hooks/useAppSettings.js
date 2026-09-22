import { useState, useEffect } from 'react'

const STORAGE_KEY = 'app_settings'

const defaultSettings = {
  defaultOdcSplitter: 'R1_8',
  defaultOdpSplitter: 'R1_8',
  defaultMountType: 'pole',
  photoCompression: true,
  photoQuality: 80,
  maxPhotoSize: 10,
  toastAutoDismiss: true,
  toastDuration: 4,
}

export function useAppSettings() {
  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setSettings(s => ({ ...s, ...parsed }))
      } catch {}
    }
  }, [])

  const updateSetting = (key, value) => {
    setSettings(s => {
      const updated = { ...s, [key]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return { settings, updateSetting }
}
