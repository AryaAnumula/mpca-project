const mqtt = require('mqtt');
const store = require('./firebase-store');

let mqttClient = null;
let io = null;

const MQTT_BROKER_HOST = process.env.MQTT_BROKER_HOST || 'test.mosquitto.org';
const MQTT_BROKER_PORT = Number(process.env.MQTT_BROKER_PORT || 1883);
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtt://${MQTT_BROKER_HOST}:${MQTT_BROKER_PORT}`;

function zoneLetter(location) {
  return String.fromCharCode(64 + location); // 1->A, 2->B, ...
}

async function getOrAssignSpot(uid, location) {
  return store.assignSpot(uid, location);
}

async function releaseSpot(uid) {
  return store.releaseSpot(uid);
}

function init(socketIo) {
  io = socketIo;

  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    clientId: 'parking-server-' + Date.now(),
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT broker');
    mqttClient.subscribe(['rfid/in', 'rfid/out'], (err) => {
      if (err) console.error('MQTT subscribe error:', err);
      else console.log('📡 Subscribed to rfid/in and rfid/out');
    });
    if (io) io.emit('mqtt:status', { connected: true });
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
    if (io) io.emit('mqtt:status', { connected: false, error: err.message });
  });

  mqttClient.on('close', () => {
    console.log('❌ MQTT connection closed');
    if (io) io.emit('mqtt:status', { connected: false });
  });

  mqttClient.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT...');
  });

  mqttClient.on('message', (topic, message) => {
    const payload = message.toString().trim();
    console.log(`📨 [${topic}] ${payload}`);

    if (topic === 'rfid/in') {
      console.log(`📥 Received scan on [rfid/in]: ${payload}`);
      handleScan(payload, 'IN').catch((err) => console.error('Scan handling error:', err));
    } else if (topic === 'rfid/out') {
      console.log(`📥 Received scan on [rfid/out]: ${payload}`);
      handleScan(payload, 'OUT').catch((err) => console.error('Scan handling error:', err));
    }
  });
}

/**
 * Core scan handler — processes both real RFID scans and simulated ones.
 * Looks up the UID, determines access, logs the event, publishes MQTT response,
 * and emits a WebSocket event to all connected dashboard clients.
 */
async function handleScan(payload, eventType) {
  const parts = payload.split(',');
  if (parts.length < 2) {
    console.warn('⚠️ Invalid payload format:', payload);
    return;
  }

  const uid = parts[0].trim().toUpperCase();
  const location = parseInt(parts[1].trim(), 10);

  if (isNaN(location) || location < 1 || location > 5) {
    console.warn('⚠️ Invalid location:', parts[1]);
    return;
  }

  // Lookup user in database
  const user = await store.getUserByUid(uid);

  let status = 'DENIED';
  let name = 'Unknown';
  let spotLabel = '-';
  let resolvedLocation = location;
  let denialReason = '';

  if (user) {
    name = user.name;
    if (user.is_active) {
      if (eventType === 'IN') {
        const assignment = await getOrAssignSpot(uid, location);
        if (assignment) {
          status = 'ALLOWED';
          spotLabel = assignment.spot_label;
          resolvedLocation = Number(assignment.location || location);
        } else {
          denialReason = 'all zones full (no free spots)';
        }
      } else if (eventType === 'OUT') {
        const released = await releaseSpot(uid);
        if (released) {
          status = 'ALLOWED';
          spotLabel = released.spot_label;
          resolvedLocation = Number(released.location || location);
        } else {
          denialReason = 'no active spot assigned';
        }
      }
    } else {
      denialReason = 'user is inactive';
    }
  } else {
    denialReason = 'UID not found';
  }

  // Log the event
  await store.recordLog({
    uid,
    user_name: name,
    event_type: eventType,
    location: resolvedLocation,
    status,
    spot_label: spotLabel,
  });

  // Publish access response back to ESP32: UID,STATUS,NAME,SPOT
  const response = `${uid},${status},${name},${spotLabel}`;
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish('access/response', response);
    console.log(`📤 [access/response] ${response}`);
  }

  // Emit real-time event to web dashboard
  const logEntry = {
    uid,
    user_name: name,
    event_type: eventType,
    location: resolvedLocation,
    status,
    spot_label: spotLabel,
    timestamp: new Date().toISOString(),
  };

  if (io) io.emit('parking:event', logEntry);
  if (status === 'ALLOWED') {
    console.log(`✅ ${eventType} | ${uid} | ${name} | Zone ${resolvedLocation} | Spot ${spotLabel}`);
  } else {
    console.log(`🚫 ${eventType} | ${uid} | ${name} | Zone ${resolvedLocation} | ${denialReason || 'denied'}`);
  }

  return logEntry;
}

/**
 * Simulate an RFID scan (for testing without hardware).
 * Calls the same handleScan pipeline so the full flow is exercised.
 */
function simulateScan(uid, location, eventType) {
  const payload = `${uid},${location}`;
  return handleScan(payload, eventType);
}

function getStatus() {
  return mqttClient ? mqttClient.connected : false;
}

module.exports = { init, simulateScan, getStatus };
