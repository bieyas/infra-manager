import React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import clsx from 'clsx'

const HEADERS = ['VLAN ID', 'Nama', 'Deskripsi', 'Interfaces', 'Status', 'Aksi']

export default function VlanTable({ vlans, onEdit, onDelete }) {
  if (vlans.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-muted text-sm">
        Tidak ada VLAN yang sesuai pencarian.
      </div>
    )
  }

  return (
    <>
      {/* ── Desktop table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider">
              {HEADERS.map(h => (
                <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vlans.map((vlan, i) => (
              <tr
                key={vlan.id}
                className={clsx(
                  'border-b border-[var(--border)]/50 hover:bg-[var(--accent-glow)] transition-colors group',
                  i % 2 === 1 && 'bg-[var(--bg-secondary)]/20'
                )}
              >
                <td className="px-4 py-2.5">
                  <span className="font-mono font-semibold text-primary">{vlan.vid}</span>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={vlan.color ?? 'neutral'}>{vlan.name}</Badge>
                </td>
                <td className="px-4 py-2.5 text-muted text-[11px] max-w-[200px] truncate">
                  {vlan.description ?? '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-secondary">
                  {vlan._count?.interfaces ?? 0}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={vlan.status === 'ACTIVE' ? 'online' : 'neutral'} className="text-[9px]">
                    {vlan.status ?? 'ACTIVE'}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => onEdit(vlan)}   />
                    <Button variant="danger" size="xs" icon={Trash2} onClick={() => onDelete(vlan)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden divide-y divide-[var(--border)]">
        {vlans.map(vlan => (
          <div key={vlan.id} className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0">
              <span className="text-xs font-mono font-bold text-primary">{vlan.vid}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant={vlan.color ?? 'neutral'}>{vlan.name}</Badge>
                <Badge variant={vlan.status === 'ACTIVE' ? 'online' : 'neutral'} className="text-[9px]">{vlan.status ?? 'ACTIVE'}</Badge>
              </div>
              {vlan.description && (
                <p className="text-[10px] text-muted truncate mt-0.5">{vlan.description}</p>
              )}
              {(vlan._count?.interfaces ?? 0) > 0 && (
                <p className="text-[10px] text-muted">{vlan._count.interfaces} interface</p>
              )}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => onEdit(vlan)}   />
              <Button variant="danger" size="xs" icon={Trash2} onClick={() => onDelete(vlan)} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
