const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const store = require('./firebase-store');
const mqttHandler = require('./mqtt-handler');

const usersRouter = require('./routes/users');
const logsRouter = require('./routes/logs');
const slotsRouter = require('./routes/slots');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MQTT_BROKER_HOST = process.env.MQTT_BROKER_HOST || 'test.mosquitto.org';
const MQTT_BROKER_PORT = Number(process.env.MQTT_BROKER_PORT || 1883);
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtt://${MQTT_BROKER_HOST}:${MQTT_BROKER_PORT}`;

// ─── Middleware ───
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ───
app.use('/api/users', usersRouter);
app.use('/api/logs', logsRouter);
app.use('/api/slots', slotsRouter);

// GET /api/dashboard — Aggregated stats for dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = await store.getDashboardStats();

    res.json({
      ...stats,
      mqttConnected: mqttHandler.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulate — Simulate an RFID scan (dev/test tool)
app.post('/api/simulate', async (req, res) => {
  const { uid, location, event_type } = req.body;
  if (!uid || !location || !event_type) {
    return res.status(400).json({ error: 'uid, location, and event_type are required' });
  }
  try {
    const result = await mqttHandler.simulateScan(uid.toUpperCase().trim(), parseInt(location, 10), event_type.toUpperCase());
    const spotSuffix = result && result.spot_label && result.spot_label !== '-' ? ` (Spot ${result.spot_label})` : '';
    res.json({
      success: true,
      message: `Simulated ${event_type.toUpperCase()} scan for ${uid.toUpperCase()} at Zone ${location}${spotSuffix}`,
      spot_label: result ? result.spot_label : '-',
      status: result ? result.status : 'DENIED',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Socket.IO ───
io.on('connection', (socket) => {
  console.log('🌐 Dashboard client connected');
  socket.emit('mqtt:status', { connected: mqttHandler.getStatus() });

  socket.on('disconnect', () => {
    console.log('🌐 Dashboard client disconnected');
  });
});

// ─── Initialize MQTT ───
async function start() {
  try {
    await store.init();
    mqttHandler.init(io);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════╗
║   🚗  Smart Parking System — Server         ║
╠══════════════════════════════════════════════╣
║   Dashboard:  http://localhost:${PORT}           ║
║   API:        http://localhost:${PORT}/api       ║
║   Storage:    Firebase Firestore           ║
║   MQTT:       ${MQTT_BROKER_URL.replace('mqtt://', '')}       ║
╚══════════════════════════════════════════════╝
  `);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
