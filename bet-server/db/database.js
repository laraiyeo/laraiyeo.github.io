const { Pool } = require("pg");
const dns = require("dns");
const { URL } = require("url");

if (!process.env.DATABASE_URL) {
  console.error(
    "FATAL: Missing DATABASE_URL environment variable. Server cannot connect to Postgres."
  );
  console.error(
    "Set DATABASE_URL to your Postgres connection string (postgres://user:pass@host:port/dbname) in the environment."
  );
  process.exit(1);
}

// Helper to build a Pool config object from components
function buildPoolConfig({ user, password, host, port, database, sslEnabled }) {
  const cfg = {
    user,
    password,
    host,
    port: port ? Number(port) : 5432,
    database,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
  return cfg;
}

// Try default connection first; if it fails due to IPv6/unreachable errors,
// attempt to resolve the host to an IPv4 address and reconnect using that.
let pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function ensureConnectivity() {
  try {
    const client = await pool.connect();
    client.release();
    console.log("Connected to PostgreSQL database");
    return;
  } catch (err) {
    console.error(
      "Postgres initial connection failed:",
      err && err.code ? err.code : err.message || err
    );

    // If the error indicates IPv6/unreachable, try IPv4 lookup and recreate pool
    const host = new URL(process.env.DATABASE_URL).hostname;
    try {
      const lookup = await dns.promises.lookup(host, { family: 4 });
      if (lookup && lookup.address) {
        console.log("Resolved IPv4 for DB host", host, "->", lookup.address);
        // parse URL components
        const u = new URL(process.env.DATABASE_URL);
        const username = decodeURIComponent(u.username || "");
        const password = decodeURIComponent(u.password || "");
        const dbName = u.pathname ? u.pathname.replace(/^\//, "") : "";
        const port = u.port || 5432;
        const cfg = buildPoolConfig({
          user: username,
          password,
          host: lookup.address,
          port,
          database: dbName,
          sslEnabled: process.env.NODE_ENV === "production",
        });

        // replace pool
        pool.end().catch(() => {});
        pool = new Pool(cfg);

        // test again
        const client2 = await pool.connect();
        client2.release();
        console.log("Connected to PostgreSQL database via IPv4 fallback");
        return;
      }
    } catch (dnsErr) {
      console.error(
        "IPv4 lookup for DB host failed or no IPv4 address:",
        dnsErr && dnsErr.code ? dnsErr.code : dnsErr.message || dnsErr
      );
    }

    // If we reach here, connectivity couldn't be established
    console.error(
      "FATAL: Unable to connect to Postgres DB. Check DATABASE_URL and network connectivity."
    );
    // Rethrow to let the process manager / logs capture the full error
    throw err;
  }
}

// Start connectivity check (async). If it throws, allow the error to bubble up.
ensureConnectivity().catch((e) => {
  console.error(
    "Database connectivity check failed, exiting.",
    e && e.stack ? e.stack : e
  );
  process.exit(1);
});

// Test connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

module.exports = pool;
