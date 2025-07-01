const sql = require('mssql');

const config = {
  user: 'loginweb',
  password: 'contraseña123',
  server: 'localhost', // O tu IP o nombre de instancia
  database: 'DB_PLATAFORMA_TRANSPORTE',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

pool.on('error', err => {
  console.error('❌ Error de conexión con SQL Server:', err);
});

module.exports = {
  sql,
  poolConnect,
  pool
};