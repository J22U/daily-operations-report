const sql = require('mssql');

const config = {
  user: process.env.DB_USER || 'loginweb',
  password: process.env.DB_PASSWORD || 'contraseña123',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'DB_PLATAFORMA_TRANSPORTE',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Crear un pool de conexión
const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

poolConnect.then(() => {
  console.log("✅ Conectado a la base de datos SQL Server");
}).catch(err => {
  console.error("❌ Error de conexión a la BD:", err);
});

module.exports = { sql, pool, poolConnect };