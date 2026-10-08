require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv);

// 1. Validar que la variable JWT_SECRET esté definida de forma segura
if (!process.env.JWT_SECRET) {
  console.error('ERROR CRÍTICO: Debes definir la variable JWT_SECRET en el archivo .env');
  process.exit(1);
}
const SECRET = process.env.JWT_SECRET;

// 2. Conexión robusta a MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/bananocheck')
  .then(() => console.log('MongoDB conectado exitosamente.'))
  .catch(e => {
    console.error('Error al conectar a MongoDB:', e.message);
    process.exit(1);
  });

// ---- Modelos NoSQL (MongoDB) ----
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true, lowercase: true },
  hash: { type: String, required: true }
}, { timestamps: true });

const evaluationSchema = new mongoose.Schema({
  ts: { type: Number, default: Date.now },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uname: { type: String, required: true },
  prod: { type: String, default: 'Banano' },
  lote: { type: String, default: '' },
  label: { type: String, required: true },
  conf: { type: Number, required: true },
  life: { type: String, required: true },
  bad: { type: Number, default: 0 },
  img: { type: String, default: '' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Ev = mongoose.model('Evaluation', evaluationSchema);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Middlewares de Autenticación ----
const sign = u => jwt.sign({ id: u._id, username: u.username }, SECRET, { expiresIn: '7d' });

const guard = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado o formato incorrecto' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión expirada o token inválido' });
  }
};

// ---- Rutas de Autenticación Sanitizadas ----
app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || password.length < 4) {
      return res.status(400).json({ error: 'El usuario debe ser válido y la contraseña tener al menos 4 caracteres.' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'El nombre de usuario ya está registrado.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ username, hash });

    res.status(201).json({ token: sign(u), username: u.username });
  } catch (e) {
    res.status(500).json({ error: 'Error interno en el servidor.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    // Sanitización forzada a String para prevenir inyección NoSQL
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    }

    const u = await User.findOne({ username });
    if (!u || !(await bcrypt.compare(password, u.hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    res.json({ token: sign(u), username: u.username });
  } catch (e) {
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
});

app.get('/api/me', guard, (req, res) => res.json(req.user));

// ---- Evaluaciones ----
app.get('/api/evaluations', guard, async (req, res) => {
  try {
    const list = await Ev.find().sort({ ts: -1 }).limit(100).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener las evaluaciones.' });
  }
});

app.post('/api/evaluations', guard, async (req, res) => {
  try {
    const b = req.body || {};
    
    // Validación básica de imagen base64
    let imgSrc = String(b.img || '');
    if (imgSrc && !imgSrc.startsWith('data:image/')) {
      imgSrc = '';
    }

    const e = await Ev.create({
      ts: Date.now(),
      user: req.user.id,
      uname: req.user.username,
      prod: String(b.prod || 'Banano').slice(0, 80),
      lote: String(b.lote || '').slice(0, 120),
      label: String(b.label || 'Desconocido').slice(0, 60),
      conf: Number(b.conf) || 0,
      life: String(b.life || 'N/A').slice(0, 40),
      bad: b.bad ? 1 : 0,
      img: imgSrc.slice(0, 50000) // Límite seguro para miniatura Base64
    });

    io.emit('evaluation', e.toObject());
    res.status(201).json({ ok: true, id: e._id });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo registrar la evaluación.' });
  }
});

// ---- Socket.IO Authentication Middleware ----
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Autenticación requerida'));
  
  try {
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    next(new Error('Token inválido'));
  }
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));