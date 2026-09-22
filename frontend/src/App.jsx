import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AlertsProvider } from './context/AlertsContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { MapSettingsProvider } from './context/MapSettingsContext'
import RequireAuth from './components/auth/RequireAuth'
import AppLayout from './components/layout/AppLayout'
import PageLoader from './components/ui/PageLoader'

// Eager load critical pages (login + dashboard)
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Lazy load other pages - split into separate chunks
const Devices = lazy(() => import('./pages/Devices'))
const DeviceDetailPage = lazy(() => import('./features/devices/DeviceDetailPage'))
const Interfaces = lazy(() => import('./pages/Interfaces'))
const Topology = lazy(() => import('./pages/Topology'))
const Traffic = lazy(() => import('./pages/Traffic'))
const Wireless = lazy(() => import('./pages/Wireless'))
const Internet = lazy(() => import('./pages/Internet'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Settings = lazy(() => import('./pages/Settings'))
const Vlans = lazy(() => import('./pages/Vlans'))
const FtthMap = lazy(() => import('./pages/FtthMap'))
const Ipam = lazy(() => import('./pages/Ipam'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Users = lazy(() => import('./pages/Users'))
const UserDetail = lazy(() => import('./pages/UserDetail'))
const OdcPage = lazy(() => import('./features/distribution/OdcPage'))
const OdpPage = lazy(() => import('./features/distribution/OdpPage'))
const OdcFormPage = lazy(() => import('./features/distribution/OdcFormPage'))
const OdpFormPage = lazy(() => import('./features/distribution/OdpFormPage'))
const QrScanPage      = lazy(() => import('./pages/QrScanPage'))
const CustomerPage    = lazy(() => import('./features/customers/CustomerPage'))
const CustomerForm    = lazy(() => import('./features/customers/CustomerForm'))

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <AlertsProvider>
      <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/scan" element={<QrScanPage />} />
            <Route path="/scan/:type/:id" element={<QrScanPage />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/"           element={<Dashboard />} />
              <Route path="/devices"       element={<Devices />} />
              <Route path="/devices/:id"    element={<DeviceDetailPage />} />
              <Route path="/interfaces" element={<Interfaces />} />
              <Route path="/topology"   element={<Topology />} />
              <Route path="/traffic"    element={<Traffic />} />
              <Route path="/wireless"   element={<Wireless />} />
              <Route path="/internet"   element={<Internet />} />
              <Route path="/alerts"     element={<Alerts />} />
              <Route path="/vlans"      element={<Vlans />} />
              <Route path="/ftth"       element={<FtthMap />} />
              <Route path="/odc"           element={<OdcPage />} />
              <Route path="/odc/new"        element={<MapSettingsProvider><OdcFormPage /></MapSettingsProvider>} />
              <Route path="/odc/:id/edit"   element={<MapSettingsProvider><OdcFormPage /></MapSettingsProvider>} />
              <Route path="/odp"           element={<OdpPage />} />
              <Route path="/odp/new"        element={<MapSettingsProvider><OdpFormPage /></MapSettingsProvider>} />
              <Route path="/odp/:id/edit"   element={<MapSettingsProvider><OdpFormPage /></MapSettingsProvider>} />
              <Route path="/ipam"       element={<Ipam />} />
              <Route path="/settings"   element={<MapSettingsProvider><Settings /></MapSettingsProvider>} />
              <Route path="/users"           element={<Users />} />
              <Route path="/users/:id"        element={<UserDetail />} />
              <Route path="/customers"        element={<CustomerPage />} />
              <Route path="/customers/new"    element={<CustomerForm />} />
              <Route path="/customers/:id/edit" element={<CustomerForm />} />
              <Route path="*"           element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
      </AlertsProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
