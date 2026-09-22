import React from 'react'
import { Trash2 } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'

export default function DeleteConfirm({ vlan, onConfirm, onCancel }) {
  if (!vlan) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <Card className="relative w-full max-w-sm mx-4 animate-fade-in">
        <CardBody className="py-5 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
            <Trash2 size={18} className="text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Hapus VLAN {vlan.vid}?</p>
            <p className="text-xs text-muted mt-1">"{vlan.name}" akan dihapus permanen.</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={onCancel}>Batal</Button>
            <Button variant="danger"  size="sm" icon={Trash2} onClick={() => onConfirm(vlan.id)}>
              Hapus
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
