import 'dotenv/config'
import express    from 'express'
import helmet     from 'helmet'
import cors       from 'cors'
import morgan     from 'morgan'

import authRouter    from './routes/auth.js'
import deviceRouter  from './routes/devices.js'
import ifaceRouter   from './routes/interfaces.js'
import alertRouter   from './routes/alerts.js'
import vlanRouter    from './routes/vlans.js'
import ipamRouter    from './routes/ipam.js'
import ipamV2Router  from './routes/ipam-v2.js'
import ftthRouter    from './routes/ftth.js'
import driverRouter  from './routes/driver.js'
import odcRouter     from './routes/odc.js'
import odpRouter     from './routes/odp.js'
import splitterTypesRouter from './routes/splitter-types.js'
import coverageZonesRouter from './routes/coverage-zones.js'
import usersRouter     from './routes/users.js'
import toolsRouter     from './routes/tools.js'
import qrRouter        from './routes/qr.js'
import customerRouter   from './routes/customers.js'
import dashboardRouter  from './routes/dashboard.js'

// BigInt → number untuk JSON serialization (field inBps/outBps dari Prisma)
BigInt.prototype.toJSON = function () { return Number(this) }

const app  = express()
const PORT = process.env.PORT || 6000

// CORS - allow multiple origins
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:6001',
  'http://127.0.0.1:6001',
  'http://10.17.33.9:6001',
  'https://infra.fastkho.online',
  'http://bondongoyot.ddns.net:6001',
].filter(Boolean)

app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRouter)
app.use('/api/devices',    deviceRouter)
app.use('/api/interfaces', ifaceRouter)
app.use('/api/alerts',     alertRouter)
app.use('/api/vlans',      vlanRouter)
app.use('/api/ipam',       ipamRouter)
app.use('/api/ipam/v2',    ipamV2Router)
app.use('/api/ftth',       ftthRouter)
app.use('/api/driver',    driverRouter)
app.use('/api/odc',       odcRouter)
app.use('/api/odp',       odpRouter)
app.use('/api/splitter-types',  splitterTypesRouter)
app.use('/api/coverage-zones', coverageZonesRouter)
app.use('/api/users',         usersRouter)
app.use('/api/tools',         toolsRouter)
app.use('/api/qr',            qrRouter)      // public — no auth, QR scan redirect
app.use('/api/customers',     customerRouter)
app.use('/api/dashboard',     dashboardRouter)

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }))

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API listening on http://0.0.0.0:${PORT}`))
