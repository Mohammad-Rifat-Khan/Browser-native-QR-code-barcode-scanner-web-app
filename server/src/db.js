import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export const initDb = async () => {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        value TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        scanned_at TIMESTAMP DEFAULT NOW(),
        device_info JSONB,
        is_duplicate BOOLEAN DEFAULT false
      );
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scans_scanned_at 
      ON scans(scanned_at DESC);
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scans_value_type 
      ON scans(value, type);
    `)

    console.log('Database initialized successfully')
  } finally {
    client.release()
  }
}

export default pool
