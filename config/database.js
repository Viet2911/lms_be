import pg from 'pg';

const { Pool } = pg;

// Parse PostgreSQL bigint (COUNT returns bigint) and numeric as JS numbers
pg.types.setTypeParser(20, val => parseInt(val, 10));
pg.types.setTypeParser(1700, val => parseFloat(val));

const password = encodeURIComponent(process.env.DB_PASSWORD || '');
const connectionString = process.env.DATABASE_URL ||
  `postgresql://postgres.jxialvpusjciwraycofd:${password}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;

const pgPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Convert MySQL ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let counter = 0;
  return sql.replace(/\?/g, () => `$${++counter}`);
}

// Wrap pg result to behave like mysql2's [rows, fields] return
function wrapResult(pgResult) {
  const rows = pgResult.rows || [];
  // Allow result.insertId to work when query has RETURNING id
  Object.defineProperty(rows, 'insertId', {
    get: () => pgResult.rows?.[0]?.id ?? 0,
    enumerable: false, configurable: true,
  });
  // Allow result.affectedRows to work for UPDATE/DELETE
  Object.defineProperty(rows, 'affectedRows', {
    get: () => pgResult.rowCount ?? 0,
    enumerable: false, configurable: true,
  });
  return rows;
}

// mysql2-compatible pool.query()
async function compatQuery(sql, params = []) {
  const pgSql = convertPlaceholders(sql);
  const result = await pgPool.query(pgSql, params);
  return [wrapResult(result), result.fields || []];
}

// mysql2-compatible client (for transactions via getConnection)
function wrapClient(client) {
  return {
    query: async (sql, params = []) => {
      const pgSql = convertPlaceholders(sql);
      const result = await client.query(pgSql, params);
      return [wrapResult(result), result.fields || []];
    },
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release(),
  };
}

pgPool.connect()
  .then(client => {
    client.release();
    console.log('✅ Connected to Supabase PostgreSQL');
  })
  .catch(err => {
    console.error('❌ Database error:', err.message);
  });

// Export mysql2-compatible API
const pool = {
  query: compatQuery,
  getConnection: async () => {
    const client = await pgPool.connect();
    return wrapClient(client);
  },
  connect: pgPool.connect.bind(pgPool),
  end: pgPool.end.bind(pgPool),
};

export default pool;
