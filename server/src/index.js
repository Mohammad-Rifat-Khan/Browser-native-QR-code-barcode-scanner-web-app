import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import http from 'http'
import useragent from 'express-useragent'
import { Server } from 'socket.io'
import pool, { initDb } from './db.js'

dotenv.config()

const app = express()
const server = http.createServer(app)

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : '*'

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
})

app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json({ limit: '256kb' }))
app.use(useragent.express())

const allowedTypes = new Set(['QR_CODE', 'EAN_13', 'MANUAL'])
const duplicateWindowSeconds = 5

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'scanner-api' })
})

app.get('/api/scans', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const type = typeof req.query.type === 'string' ? req.query.type.trim() : ''

  const values = []
  const filters = []

  if (search) {
    values.push(`%${search}%`)
    filters.push(`value ILIKE $${values.length}`)
  }

  if (type && allowedTypes.has(type)) {
    values.push(type)
    filters.push(`type = $${values.length}`)
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

  const result = await pool.query(
    `SELECT id, value, type, scanned_at, device_info, is_duplicate
     FROM scans
     ${whereClause}
     ORDER BY scanned_at DESC
     LIMIT 200;`,
    values,
  )

  res.json({ scans: result.rows })
}))

app.post('/api/scans', asyncHandler(async (req, res) => {
  const value = typeof req.body.value === 'string' ? req.body.value.trim() : ''
  const type = typeof req.body.type === 'string' ? req.body.type.trim().toUpperCase() : ''

  if (!value) {
    res.status(400).json({ error: 'value is required' })
    return
  }

  if (!allowedTypes.has(type)) {
    res.status(400).json({ error: 'type must be QR_CODE, EAN_13, or MANUAL' })
    return
  }

  const duplicateCheck = await pool.query(
    `SELECT id
     FROM scans
     WHERE value = $1 AND type = $2
       AND scanned_at > NOW() - ($3::text || ' seconds')::interval
     ORDER BY scanned_at DESC
     LIMIT 1;`,
    [value, type, duplicateWindowSeconds],
  )

  const isDuplicate = duplicateCheck.rows.length > 0

  const browserInfo = req.useragent || {}
  const providedDeviceInfo = req.body.deviceInfo && typeof req.body.deviceInfo === 'object'
    ? req.body.deviceInfo
    : {}

  const deviceInfo = {
    browser: browserInfo.browser,
    os: browserInfo.os,
    platform: browserInfo.platform,
    userAgent: req.headers['user-agent'],
    ...providedDeviceInfo,
  }

  const insertResult = await pool.query(
    `INSERT INTO scans (value, type, device_info, is_duplicate)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, value, type, scanned_at, device_info, is_duplicate;`,
    [value, type, JSON.stringify(deviceInfo), isDuplicate],
  )

  const scan = insertResult.rows[0]
  io.emit('scan:created', scan)

  res.status(201).json({ scan })
}))

app.use((err, _req, res, _next) => {
  console.error('Unhandled API error', err)
  if (res.headersSent) {
    return
  }
  res.status(500).json({ error: 'Internal server error' })
})

const port = Number(process.env.PORT || 4000)

const start = async () => {
  await initDb()
  server.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})

const shutdown = async (signal) => {
  console.log(`${signal} received. Closing server...`)
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
  console.log('Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
