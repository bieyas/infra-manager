import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import RequirePermission from '../auth/RequirePermission'

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  React.useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const toggleMenu = () => {
    if (window.innerWidth < 768) {
      setMobileOpen(o => !o)
    } else {
      setSidebarCollapsed(c => !c)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-primary-var">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col h-full">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {/* Mobile Sidebar Drawer — z-[2000] to sit above Leaflet map & bottom sheet */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[2000] flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex flex-col h-full animate-slide-in">
            <Sidebar collapsed={false} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuToggle={toggleMenu} />
        <main className={`flex-1 bg-primary-var ${location.pathname === '/ftth' ? 'overflow-hidden pb-16 md:pb-0' : 'overflow-y-auto pb-16 md:pb-0'}`}>
          <RequirePermission>
            <Outlet />
          </RequirePermission>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
