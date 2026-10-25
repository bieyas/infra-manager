import { Router } from 'express'
import net from 'node:net'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { checkRemoteNatHelper } from '../lib/remoteProxyNatV2.js'

const router = Router()
const SETTING_ID = 'remote-onu'

router.use(authenticate)

function validCidr(value) {
  const [address, prefix, ...extra] = String(value || '').split('/')
  return extra.length === 0
    && net.isIP(address) === 4
    && (prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) <= 32))
}

async function getSettings() {
  return await prisma.remoteOnuSetting.findUnique({ where: { id: SETTING_ID } }) || {
    id: SETTING_ID,
    version: 'v1',
    natIngressInterface: null,
    natSourceCidr: null,
  }
}

router.get('/remote-onu', requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const settings = await getSettings()
    const helperReady = await checkRemoteNatHelper(settings.natIngressInterface).then(() => true).catch(() => false)
    res.json({
      version: settings.version,
      ingressInterface: settings.natIngressInterface,
      sourceCidr: settings.natSourceCidr,
      helperReady,
    })
  } catch (error) {
    next(error)
  }
})

router.patch('/remote-onu', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const version = String(req.body.version || '').toLowerCase()
    const ingressInterface = String(req.body.ingressInterface || '').trim()
    const sourceCidr = String(req.body.sourceCidr || '').trim()
    if (!['v1', 'v2'].includes(version)) return res.status(422).json({ error: 'Versi remote ONU tidak valid' })

    if (version === 'v2') {
      if (!/^[a-zA-Z0-9_.:-]{1,15}$/.test(ingressInterface)) {
        return res.status(422).json({ error: 'Interface ingress NAT belum valid' })
      }
      if (!validCidr(sourceCidr)) return res.status(422).json({ error: 'Allowlist sumber harus berupa IPv4 CIDR' })
      const helperReady = await checkRemoteNatHelper(ingressInterface).then(() => true).catch(() => false)
      if (!helperReady) {
        return res.status(409).json({ error: 'Helper NAT v2 belum siap. Pasang helper root dan izin sudo terbatas terlebih dahulu.' })
      }
    }

    const settings = await prisma.remoteOnuSetting.upsert({
      where: { id: SETTING_ID },
      update: {
        version,
        natIngressInterface: ingressInterface || null,
        natSourceCidr: sourceCidr || null,
      },
      create: {
        id: SETTING_ID,
        version,
        natIngressInterface: ingressInterface || null,
        natSourceCidr: sourceCidr || null,
      },
    })
    const helperReady = await checkRemoteNatHelper(settings.natIngressInterface).then(() => true).catch(() => false)
    res.json({
      version: settings.version,
      ingressInterface: settings.natIngressInterface,
      sourceCidr: settings.natSourceCidr,
      helperReady,
    })
  } catch (error) {
    next(error)
  }
})

export default router