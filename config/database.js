import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'metro.proxy.rlwy.net',
  port: process.env.DB_PORT || 20518,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'JsyMJSxTQHHUfpzwrSoJWBusIMIcHZMn',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  // Timezone
  timezone: '+07:00',
  // Date handling
  dateStrings: ['DATE', 'DATETIME']
});


pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database error:', err.message);
  });

export default pool;
