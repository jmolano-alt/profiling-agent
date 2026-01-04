// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Config ----
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- Env (names must match Render) ----
const {
  AGENT_API_KEY,
  ROCKETREACH_USER,
  ROCKETREACH_PASS,
  INTELIUS_USER,
  INTELIUS_PASS,
} = process.env;

console.log('ENV CHECK', {
  ROCKETREACH_USER: !!process.env.ROCKETREACH_USER,
  ROCKETREACH_PASS: !!process.env.ROCKETREACH_PASS,
});


// Optional: fail fast on missing vars (prevents “envs viejos” confusion)
const missing = [];
if (!AGENT_API_KEY) missing.push('AGENT_API_KEY');
if (!ROCKETREACH_USER) missing.push('ROCKETREACH_USER');
if (!ROCKETREACH_PASS) missing.push('ROCKETREACH_PASS');
if (!INTELIUS_USER) missing.push('INTELIUS_USER');
if (!INTELIUS_PASS) missing.push('INTELIUS_PASS');

if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
}

// ---- Auth middleware ----
function authenticateRequest(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== AGENT_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid API Key',
    });
  }

  next();
}

// ---- Routes ----
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'profiling-agent',
    version: '1.0.0',
    endpoints: { health: '/health (GET)', lookup: '/lookup (POST)' },
  });
});

// Health check (sin autenticación)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: {
      AGENT_API_KEY: !!AGENT_API_KEY,
      ROCKETREACH_USER: !!ROCKETREACH_USER,
      ROCKETREACH_PASS: !!ROCKETREACH_PASS,
      INTELIUS_USER: !!INTELIUS_USER,
      INTELIUS_PASS: !!INTELIUS_PASS,
    },
  });
});

// Ruta principal de lookup (con autenticación)
app.post('/lookup', authenticateRequest, async (req, res) => {
  const startTime = Date.now();

  try {
    const { task, parameters } = req.body || {};

    if (!task || !parameters) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: task and parameters',
      });
    }

    console.log(`[${new Date().toISOString()}] Task: ${task}`);

    // Importar handler de tareas
    const taskHandler = require('./routes/taskHandler');

    // Pasamos env de credenciales al handler por si lo necesita explícitamente
    const result = await taskHandler.executeTask(task, parameters, {
      ROCKETREACH_USER,
      ROCKETREACH_PASS,
      INTELIUS_USER,
      INTELIUS_PASS,
    });

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

    return res.json({
      success: true,
      task,
      data: result,
      execution_time_seconds: Number(executionTime),
    });
  } catch (error) {
    console.error('Error in /lookup:', error);

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

    return res.status(500).json({
      success: false,
      task: req.body?.task,
      error: error.message,
      execution_time_seconds: Number(executionTime),
    });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`🚀 Profiling Agent v1.0 running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Lookup endpoint: http://localhost:${PORT}/lookup`);
});

