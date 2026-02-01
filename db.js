// db.js
// Simple Neon/Postgres connection helper

const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
  console.error(
    "❌ DATABASE_URL / NEON_DATABASE_URL is not set. Please configure .env"
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // required for many managed Postgres providers
  },
});

pool
  .connect()
  .then((client) => {
    console.log("✅ Connected to Neon/Postgres");
    client.release();
  })
  .catch((err) => {
    console.error("❌ Failed to connect to Neon/Postgres:", err.message);
  });

module.exports = {
  query: (text, params) => pool.query(text, params),
};
