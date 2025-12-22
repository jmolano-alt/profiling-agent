require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración
app.use(cors());
app.use(bodyParser.json());

// Middleware de autenticación
const authenticateRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.AGENT_API_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized - Invalid API Key' 
    });
  }
  
  next();
};

// Health check (sin autenticación)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Ruta principal de lookup (con autenticación)
app.post('/lookup', authenticateRequest, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { task, parameters } = req.body;
    
    if (!task || !parameters) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: task and parameters'
      });
    }
    
    console.log(`[${new Date().toISOString()}] Task: ${task}`);
    
    // Importar handler de tareas
    const taskHandler = require('./routes/taskHandler');
    const result = await taskHandler.executeTask(task, parameters);
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    res.json({
      success: true,
      task: task,
      data: result,
      execution_time_seconds: parseFloat(executionTime)
    });
    
  } catch (error) {
    console.error('Error in /lookup:', error);
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    res.status(500).json({
      success: false,
      task: req.body.task,
      error: error.message,
      execution_time_seconds: parseFloat(executionTime)
    });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Profiling Agent v1.0 running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Lookup endpoint: http://localhost:${PORT}/lookup`);
});
