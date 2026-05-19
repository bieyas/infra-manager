import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Network, ArrowLeft } from 'lucide-react'
import Button from '../components/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center glow-ring">
        <Network size={28} className="accent-text" />
      </div>
      <div>
        <p className="text-5xl font-bold text-primary font-mono">404</p>
        <p className="text-sm text-muted mt-1">Page not found</p>
      </div>
      <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/')}>
        Back to Dashboard
      </Button>
    </div>
  )
}
