const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { sql, pool, poolConnect } = require('./db');

const app = express();
const PORT = 3000;

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'secreto-super-seguro',
  resave: false,
  saveUninitialized: true
}));

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('✅ Servidor funcionando correctamente');
});

app.get('/api/usuario', (req, res) => {
  if (req.session.user) {
    res.json({
      success: true,
      nombre: req.session.user.nombre || req.session.user.username
    });
  } else {
    res.json({ success: false, message: 'No autenticado' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const pool = await poolConnect;
    const result = await pool.request()
      .query("SELECT * FROM USUARIOS WHERE rol IN ('conductor','supervisor')");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// 🔄 Actualizar usuario
app.put('/api/actualizar-usuario', async (req, res) => {
  const { IdU, nombre, apellidos, correo, fechaNacimiento, rol, contraseña } = req.body;

  try {
    const pool = await poolConnect;
    const request = pool.request()
      .input('IdU', sql.Int, IdU)
      .input('nombre', sql.VarChar, nombre)
      .input('apellidos', sql.VarChar, apellidos)
      .input('correo', sql.VarChar, correo)
      .input('fechaNacimiento', sql.Date, fechaNacimiento)
      .input('rol', sql.VarChar, rol);

    if (contraseña && contraseña.trim() !== '') {
      request.input('contraseña', sql.VarChar, contraseña);
      await request.query(`
        UPDATE USUARIOS
        SET nombre = @nombre,
            apellidos = @apellidos,
            correo = @correo,
            fechaNacimiento = @fechaNacimiento,
            rol = @rol,
            contraseña = @contraseña
        WHERE IdU = @IdU
      `);
    } else {
      await request.query(`
        UPDATE USUARIOS
        SET nombre = @nombre,
            apellidos = @apellidos,
            correo = @correo,
            fechaNacimiento = @fechaNacimiento,
            rol = @rol
        WHERE IdU = @IdU
      `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

app.get('/api/nuevo-reporte', async (req, res) => {
  try {
    const result = await pool.request()
      .query("SELECT COUNT(*) AS cantidad FROM ReportesRevision WHERE revisado IS NULL OR revisado = 0");
    res.json({ nuevo: result.recordset[0].cantidad > 0 });
  } catch (err) {
    console.error('❌ Error al verificar reportes nuevos:', err);
    res.json({ nuevo: false });
  }
});

app.post('/api/marcar-revisados', async (req, res) => {
  try {
    await pool.request().query("UPDATE ReportesRevision SET revisado = 1");
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al marcar reportes:', err);
    res.json({ success: false });
  }
});

app.get('/api/notificaciones', async (req, res) => {
  try {
    const result = await pool.request()
      .query("SELECT COUNT(*) AS cantidad FROM ReportesRevision WHERE revisado IS NULL OR revisado = 0");
    res.json({ cantidad: result.recordset[0].cantidad });
  } catch (err) {
    console.error("❌ Error al obtener notificaciones:", err);
    res.status(500).json({ cantidad: 0 });
  }
});

app.post("/api/marcar-notificaciones-vistas", async (req, res) => {
  try {
    await pool.request().query("UPDATE ReportesRevision SET revisado = 1 WHERE revisado IS NULL OR revisado = 0");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error al marcar notificaciones como vistas:", err);
    res.status(500).json({ success: false });
  }
});

app.delete('/api/eliminar-usuario', async (req, res) => {
  const { idUsuario } = req.body;

  try {
    await poolConnect;

    // Eliminar rutas asignadas primero
    await pool.request()
      .input('idUsuario', sql.Int, idUsuario)
      .query(`DELETE FROM RUTASASIGNADAS WHERE idConductor = @idUsuario`);

    // Luego eliminar el usuario
    await pool.request()
      .input('idUsuario', sql.Int, idUsuario)
      .query(`DELETE FROM USUARIOS WHERE IdU = @idUsuario`);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al eliminar usuario y rutas:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});



// Obtener todas las rutas con nombre de conductor
app.get('/api/todas-rutas', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT R.idRuta, R.idConductor, 
             U.nombre + ' ' + U.apellidos AS nombreConductor,
             R.ruta, R.horaSalida, R.fecha, R.notasAdicionales
      FROM RUTASASIGNADAS R
      JOIN USUARIOS U ON R.idConductor = U.IdU
      ORDER BY R.fecha DESC, R.idRuta DESC
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('❌ Error al obtener rutas asignadas:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Rutas del conductor autenticado
app.get('/api/rutas-conductor', async (req, res) => {
  const usuario = req.session.user;
  if (!usuario || !usuario.id) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const result = await pool.request()
      .input('idConductor', sql.Int, usuario.id)
      .query(`
        SELECT idRuta, ruta, horaSalida, fecha, notasAdicionales 
        FROM RUTASASIGNADAS
        WHERE idConductor = @idConductor
        ORDER BY fecha DESC, idRuta DESC
      `);



    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener rutas asignadas:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Obtener todos los conductores
app.get('/api/conductores', async (req, res) => {
  try {
    const result = await pool.request()
      .query(`SELECT IdU, nombre, apellidos FROM Usuarios WHERE rol = 'conductor'`);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error al obtener conductores:", err.message);
    res.status(500).json({ error: "Error al obtener conductores" });
  }
});

// Obtener todos los reportes de revisión
app.get('/api/reportes-revision', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT * FROM ReportesRevision ORDER BY fecha DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener reportes:', err);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// Ruta de prueba para ver si hay datos en la tabla
app.get('/prueba-reportes', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT TOP 5 * FROM ReportesRevision ORDER BY fecha DESC
    `);
    res.send(result.recordset);
  } catch (err) {
    res.status(500).send('❌ Error al consultar reportes');
  }
});

app.get('/api/usuarios-conductores', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT IdU, nombre, apellidos, correo, rol, estado 
      FROM Usuarios 
      WHERE rol = 'conductor'
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error al obtener conductores:", err.message);
    res.status(500).json({ error: "Error del servidor" });
  }
});

app.post('/api/inhabilitar-usuario', async (req, res) => {
  const { idUsuario, nuevoEstado } = req.body;

  try {
    await pool.request()
      .input('id', sql.Int, idUsuario)
      .input('estado', sql.VarChar, nuevoEstado)
      .query(`
        UPDATE Usuarios SET estado = @estado WHERE IdU = @id
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al actualizar estado:', err);
    res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.request()
      .input('correo', sql.VarChar, username)
      .input('contraseña', sql.VarChar, password)
      .query(`
        SELECT * FROM Usuarios 
        WHERE correo = @correo AND contraseña = @contraseña
      `);

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

    const user = result.recordset[0];

    if (user.estado && user.estado.toLowerCase() === 'inhabilitado') {
      return res.json({ success: false, message: '⛔ Usuario inhabilitado. Contacte al administrador.' });
    }

    // Guardar sesión
    req.session.user = {
      id: parseInt(user.IdU),
      username: user.correo,
      nombre: user.nombre,
      rol: user.rol
    };

    // 🔹 Agregar nombre aquí también
    res.json({ success: true, rol: user.rol, nombre: user.nombre });

  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

app.put('/api/actualizar-ruta', async (req, res) => {
  const { idRuta, ruta, horaSalida, fecha, notasAdicionales } = req.body;

  try {
    await pool.request()
      .input('idRuta', sql.Int, idRuta)
      .input('ruta', sql.VarChar(255), ruta)
      .input('horaSalida', sql.VarChar(10), horaSalida)
      .input('fecha', sql.Date, fecha)
      .input('notasAdicionales', sql.VarChar(500), notasAdicionales)
      .query(`
        UPDATE RUTASASIGNADAS
        SET ruta = @ruta,
            horaSalida = @horaSalida,
            fecha = @fecha,
            notasAdicionales = @notasAdicionales
        WHERE idRuta = @idRuta
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al actualizar ruta:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar ruta en el servidor.' });
  }
});



// Asignar tarea
app.post('/api/asignar-tarea', async (req, res) => {
  const { idConductor, ruta, horaSalida, fechaAsignacion, fecha, notasAdicionales } = req.body;

  try {
    await pool.request()
      .input('idConductor', sql.Int, idConductor)
      .input('ruta', sql.VarChar, ruta)
      .input('horaSalida', sql.VarChar, horaSalida)
      .input('fechaAsignacion', sql.Date, new Date())
      .input('fecha', sql.Date, fecha)
      .input('notasAdicionales', sql.VarChar, notasAdicionales)
      .query(`
        INSERT INTO RUTASASIGNADAS (idConductor, ruta, horaSalida, fechaAsignacion, fecha, notasAdicionales)
        VALUES (@idConductor, @ruta, @horaSalida, @fechaAsignacion, @fecha, @notasAdicionales)
      `);

    res.json({ success: true, message: 'Tarea asignada correctamente' });
  } catch (error) {
    console.error('Error al asignar tarea:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// Guardar revisión preoperativa
app.post('/guardar-revision', async (req, res) => {
  try {
    const {
      placa, fecha, conductor, espejos, limpiaparabrisas,
      luces, pito, aceite, refrigerante, extintor,
      botiquin, neumaticos, carroceria, observaciones
    } = req.body;

    const request = await pool.request();

    request.input('placa', sql.VarChar, placa);
    request.input('fecha', sql.Date, fecha);
    request.input('conductor', sql.VarChar, conductor);
    request.input('espejos', sql.VarChar, espejos);
    request.input('limpiaparabrisas', sql.VarChar, limpiaparabrisas);
    request.input('luces', sql.VarChar, luces);
    request.input('pito', sql.VarChar, pito);
    request.input('aceite', sql.VarChar, aceite);
    request.input('refrigerante', sql.VarChar, refrigerante);
    request.input('extintor', sql.VarChar, extintor);
    request.input('botiquin', sql.VarChar, botiquin);
    request.input('neumaticos', sql.VarChar, neumaticos);
    request.input('carroceria', sql.VarChar, carroceria);
    request.input('observaciones', sql.Text, observaciones);

    await request.query(`
      INSERT INTO ReportesRevision
      (placa, fecha, conductor, espejos, limpiaparabrisas, luces, pito, aceite, refrigerante, extintor, botiquin, neumaticos, carroceria, observaciones)
      VALUES 
      (@placa, @fecha, @conductor, @espejos, @limpiaparabrisas, @luces, @pito, @aceite, @refrigerante, @extintor, @botiquin, @neumaticos, @carroceria, @observaciones)
    `);

    res.json({ success: true, message: 'Revisión guardada correctamente' });
  } catch (err) {
    console.error('❌ Error al guardar revisión:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// Registro de nuevo usuario
app.post('/register', async (req, res) => {
  const { nombre, apellidos, correo, fechaNacimiento, rol, contraseña } = req.body;

  try {
    const existe = await pool.request()
      .input('correo', sql.VarChar, correo)
      .query('SELECT * FROM USUARIOS WHERE correo = @correo');

    if (existe.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'El correo ya está registrado' });
    }

    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('apellidos', sql.VarChar, apellidos)
      .input('correo', sql.VarChar, correo)
      .input('fechaNacimiento', sql.Date, fechaNacimiento)
      .input('rol', sql.VarChar, rol)
      .input('contraseña', sql.VarChar, contraseña)
      .query(`
        INSERT INTO USUARIOS (nombre, apellidos, correo, fechaNacimiento, rol, contraseña)
        VALUES (@nombre, @apellidos, @correo, @fechaNacimiento, @rol, @contraseña)
      `);

    res.json({ success: true });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

// Lista de usuarios
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM Usuarios');
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error al listar usuarios:", err.message);
    res.status(500).send("Error del servidor al listar usuarios");
  }
});

const nodemailer = require("nodemailer");
const crypto = require("crypto");

// ✅ Endpoint para solicitar recuperación de contraseña
app.post("/api/forgot-password", async (req, res) => {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ success: false, message: "El correo es obligatorio" });
  }

  try {
    // Buscar usuario
    const result = await pool.request()
      .input("correo", sql.VarChar, correo)
      .query("SELECT * FROM Usuarios WHERE correo = @correo");

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: "No existe una cuenta con ese correo" });
    }

    const user = result.recordset[0];

    // 🔹 Generar token aleatorio
    const token = crypto.randomBytes(32).toString("hex");
    const expDate = new Date();
    expDate.setHours(expDate.getHours() + 1); // expira en 1 hora

    // Guardar token en la BD
    await pool.request()
      .input("id", sql.Int, user.IdU)
      .input("token", sql.VarChar, token)
      .input("exp", sql.DateTime, expDate)
      .query(`
        UPDATE Usuarios 
        SET resetToken = @token, resetTokenExpiry = @exp
        WHERE IdU = @id
      `);

    // 🔹 Configuración de transporte de correo
    const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // ⚠️ importante, false para TLS
  auth: {
    user: "tu_correo@gmail.com",
    pass: "tu_contraseña_app" // debe ser contraseña de aplicación, no tu clave normal
  }
});

    // 🔹 Enlace de recuperación
    const resetUrl = `http://localhost:3000/reset-password.html?token=${token}`;

    // 🔹 Contenido del correo
    await transporter.sendMail({
      from: '"Soporte Plataforma" <tu_correo@gmail.com>',
      to: user.correo,
      subject: "Recuperación de contraseña",
      html: `
        <h2>Hola ${user.nombre}</h2>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para continuar:</p>
        <a href="${resetUrl}" target="_blank">${resetUrl}</a>
        <p><b>Este enlace expirará en 1 hora.</b></p>
      `
    });

    res.json({ success: true, message: "📧 Correo enviado. Revisa tu bandeja de entrada" });

  } catch (err) {
    console.error("❌ Error en forgot-password:", err);
    res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});

// ✅ Endpoint para resetear contraseña
app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ success: false, message: "Faltan datos" });
  }

  try {
    const result = await pool.request()
      .input("token", sql.VarChar, token)
      .query("SELECT * FROM Usuarios WHERE resetToken = @token AND resetTokenExpiry > GETDATE()");

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: "Token inválido o expirado" });
    }

    const user = result.recordset[0];

    // 🔹 Actualizar contraseña y limpiar token
    await pool.request()
      .input("id", sql.Int, user.IdU)
      .input("password", sql.VarChar, password)
      .query(`
        UPDATE Usuarios 
        SET contraseña = @password, resetToken = NULL, resetTokenExpiry = NULL
        WHERE IdU = @id
      `);

    res.json({ success: true, message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("❌ Error en reset-password:", err);
    res.status(500).json({ success: false, message: "Error en el servidor" });
  }
});


// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});