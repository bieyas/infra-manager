import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { triggerCustomerSync } from '../lib/customerSync.js'

const router = Router()
router.use(authenticate)

// GET /api/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    await triggerCustomerSync()
    const [
      deviceGroups,
      alertGroups,
      odcCount,
      odpCount,
      customerStats,
      customerConnectionStats,
      activeOnlineCustomers,
      customerSyncDevices,
      recentAlerts,
      topDevices,
    ] = await Promise.all([
      // Device counts grouped by status
      prisma.device.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // Alert counts grouped by severity + acked
      prisma.alert.groupBy({
        by: ['severity', 'acked'],
        _count: { _all: true },
      }),
      // ODC total
      prisma.odc.count(),
      // ODP total
      prisma.odp.count(),
      // Customer by serviceStatus
      prisma.customer.groupBy({
        by: ['serviceStatus'],
        _count: { _all: true },
      }),
      prisma.customer.groupBy({
        by: ['connectionStatus'],
        _count: { _all: true },
      }),
      prisma.customer.count({
        where: { serviceStatus: 'ACTIVE', connectionStatus: 'ONLINE' },
      }),
      prisma.device.findMany({
        where: { type: 'ROUTER', vendor: { not: null } },
        select: { id: true, name: true, vendor: true, customerSyncAt: true, customerSyncStatus: true, customerSyncError: true },
      }),
      // Recent 5 unacked alerts
      prisma.alert.findMany({
        where: { acked: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { device: { select: { id: true, name: true, status: true } } },
      }),
      // Top 6 devices by alert count / resource usage
      prisma.device.findMany({
        orderBy: { name: 'asc' },
        take: 6,
        select: {
          id: true, name: true, type: true, status: true,
          cpuPct: true, memPct: true,
          _count: { select: { alerts: true } },
        },
      }),
    ])

    // Device stats
    const deviceStats = { ACTIVE: 0, WARNING: 0, INACTIVE: 0, total: 0 }
    deviceGroups.forEach(g => {
      deviceStats[g.status] = g._count._all
      deviceStats.total += g._count._all
    })

    // Alert stats
    const alertStats = { critical: 0, warning: 0, info: 0, unacked: 0, total: 0 }
    alertGroups.forEach(g => {
      const sev = g.severity.toLowerCase()
      alertStats[sev] = (alertStats[sev] || 0) + g._count._all
      alertStats.total += g._count._all
      if (!g.acked) alertStats.unacked += g._count._all
    })

    // Customer stats
    const customers = { ACTIVE: 0, SUSPENDED: 0, TERMINATED: 0, total: 0 }
    customerStats.forEach(g => {
      customers[g.serviceStatus] = g._count._all
      customers.total += g._count._all
    })
    customerConnectionStats.forEach(g => {
      customers[g.connectionStatus] = g._count._all
    })
    customers.ONLINE = activeOnlineCustomers

    res.json({
      devices: deviceStats,
      alerts: alertStats,
      odc: { total: odcCount },
      odp: { total: odpCount },
      customers,
      customerSync: customerSyncDevices
        .filter(device => /mikrotik|routeros/i.test(device.vendor || ''))
        .map(({ id, name, vendor, customerSyncAt, customerSyncStatus, customerSyncError }) => ({
          deviceId: id,
          deviceName: name,
          vendor,
          lastSyncAt: customerSyncAt,
          status: customerSyncStatus || 'PENDING',
          error: customerSyncError,
        })),
      recentAlerts,
      topDevices,
    })
  } catch (e) { next(e) }
})

export default router
