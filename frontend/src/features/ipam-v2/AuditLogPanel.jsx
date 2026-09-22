import React, { useState, useEffect } from 'react'
import { History, Loader2, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'

const ACTION_COLORS = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  SCAN: 'info',
  DISCOVER: 'online',
  ASSIGN: 'primary',
  RELEASE: 'neutral'
}

export default function AuditLogPanel({ entityType, entityId, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadLogs()
  }, [entityType, entityId])
  
  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entityType) params.append('entityType', entityType)
      if (entityId) params.append('entityId', entityId)
      params.append('limit', '50')
      
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/ipam/v2/audit-logs?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (res.ok) {
        setLogs(await res.json())
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e)
    }
    setLoading(false)
  }
  
  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg mx-4 bg-[var(--bg-primary)] rounded-xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <History size={16} className="accent-text" />
            <span className="font-semibold text-primary">Audit Log</span>
          </div>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-muted">
              <Loader2 size={20} className="animate-spin inline mr-2" />
              Memuat log...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <p>Belum ada aktivitas tercatat</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]/40">
              {logs.map(log => (
                <div key={log.id} className="p-3 hover:bg-[var(--surface-2)]/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge 
                          variant={ACTION_COLORS[log.action] || 'neutral'} 
                          className="text-[9px]"
                        >
                          {log.action}
                        </Badge>
                        <span className="text-[10px] text-muted">
                          {log.entityType}
                        </span>
                      </div>
                      <p className="text-xs text-primary truncate">
                        {log.notes || `${log.action} ${log.entityType}`}
                      </p>
                      {log.userName && (
                        <p className="text-[10px] text-muted mt-0.5">
                          oleh {log.userName}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted shrink-0">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
