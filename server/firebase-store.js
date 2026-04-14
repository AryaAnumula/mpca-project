const admin = require('firebase-admin');

const DEFAULT_SLOTS = [
  { location: 1, total_capacity: 10, label: 'Zone A' },
  { location: 2, total_capacity: 10, label: 'Zone B' },
  { location: 3, total_capacity: 8, label: 'Zone C' },
  { location: 4, total_capacity: 8, label: 'Zone D' },
  { location: 5, total_capacity: 6, label: 'Zone E' },
];

let firestore = null;
let initPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeUid(uid) {
  return String(uid || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function zoneLetter(location) {
  return String.fromCharCode(64 + Number(location));
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseServiceAccount() {
  const directJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (directJson) {
    try {
      return JSON.parse(directJson);
    } catch (err) {
      try {
        return JSON.parse(Buffer.from(directJson, 'base64').toString('utf8'));
      } catch (base64Err) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 encoded JSON');
      }
    }
  }

  const encodedJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encodedJson) {
    try {
      return JSON.parse(Buffer.from(encodedJson, 'base64').toString('utf8'));
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64 encoded JSON');
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

async function getFirestore() {
  if (firestore) return firestore;

  if (!initPromise) {
    initPromise = (async () => {
      if (!admin.apps.length) {
        const serviceAccount = parseServiceAccount();
        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id,
          });
        } else {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          });
        }
      }

      firestore = admin.firestore();
      firestore.settings({ ignoreUndefinedProperties: true });
      await seedDefaults();
      return firestore;
    })();
  }

  return initPromise;
}

async function init() {
  await getFirestore();
  return true;
}

async function getCollections() {
  const db = await getFirestore();
  return {
    users: db.collection('users'),
    logs: db.collection('logs'),
    slots: db.collection('slots'),
    activeSpots: db.collection('activeSpots'),
  };
}

function snapshotToRecord(doc) {
  return { id: doc.id, ...doc.data() };
}

async function seedDefaults() {
  const { slots } = await getCollections();
  const existing = await slots.get();
  if (!existing.empty) {
    const existingLocations = new Set(existing.docs.map((doc) => String(doc.id)));
    const missing = DEFAULT_SLOTS.filter((slot) => !existingLocations.has(String(slot.location)));
    if (missing.length === 0) return;

    const batch = firestore.batch();
    const timestamp = nowIso();
    missing.forEach((slot) => {
      batch.set(slots.doc(String(slot.location)), {
        ...slot,
        created_at: timestamp,
        updated_at: timestamp,
      });
    });
    await batch.commit();
    return;
  }

  const batch = firestore.batch();
  const timestamp = nowIso();
  DEFAULT_SLOTS.forEach((slot) => {
    batch.set(slots.doc(String(slot.location)), {
      ...slot,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });
  await batch.commit();
}

async function getActiveSpotMap() {
  const { activeSpots } = await getCollections();
  const snapshot = await activeSpots.get();
  const map = new Map();
  snapshot.docs.forEach((doc) => {
    const record = doc.data();
    map.set(normalizeUid(record.uid), { id: doc.id, ...record });
  });
  return map;
}

async function getUserActivityMap() {
  const { logs } = await getCollections();
  const snapshot = await logs.orderBy('timestamp', 'desc').get();
  const map = new Map();

  snapshot.docs.forEach((doc) => {
    const log = snapshotToRecord(doc);
    const uid = normalizeUid(log.uid);
    if (!uid) return;

    if (!map.has(uid)) {
      map.set(uid, {
        last_in_time: null,
        last_out_time: null,
        last_event_at: null,
        last_event_type: null,
      });
    }

    const activity = map.get(uid);
    if (!activity.last_event_at) {
      activity.last_event_at = log.timestamp || null;
      activity.last_event_type = log.event_type || null;
    }
    if (log.event_type === 'IN' && !activity.last_in_time) {
      activity.last_in_time = log.timestamp || null;
    }
    if (log.event_type === 'OUT' && !activity.last_out_time) {
      activity.last_out_time = log.timestamp || null;
    }
  });

  return map;
}

async function getUserByUid(uid) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return null;

  const { users } = await getCollections();
  const snapshot = await users.where('uid', '==', normalizedUid).limit(1).get();
  if (snapshot.empty) return null;
  return snapshotToRecord(snapshot.docs[0]);
}

async function getUserById(id) {
  const { users } = await getCollections();
  const snapshot = await users.doc(String(id)).get();
  if (!snapshot.exists) return null;
  return snapshotToRecord(snapshot);
}

async function listUsers(search = '') {
  const { users } = await getCollections();
  const [userSnapshot, activeSpotMap, activityMap] = await Promise.all([
    users.orderBy('created_at', 'desc').get(),
    getActiveSpotMap(),
    getUserActivityMap(),
  ]);

  const term = normalizeText(search).toLowerCase();

  return userSnapshot.docs
    .map((doc) => {
      const user = snapshotToRecord(doc);
      const activeSpot = activeSpotMap.get(normalizeUid(user.uid));
      const activity = activityMap.get(normalizeUid(user.uid)) || {};
      return {
        ...user,
        current_location: activeSpot ? activeSpot.location : null,
        current_spot: activeSpot ? activeSpot.spot_label : null,
        last_in_time: activity.last_in_time || null,
        last_out_time: activity.last_out_time || null,
        last_event_at: activity.last_event_at || null,
        last_event_type: activity.last_event_type || null,
      };
    })
    .filter((user) => {
      if (!term) return true;
      return [user.name, user.uid, user.vehicle_number]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
}

async function createUser({ uid, name, vehicle_number = '', phone = '', balance = 0 }) {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) {
    throw new Error('UID is required');
  }

  const existing = await getUserByUid(normalizedUid);
  if (existing) {
    throw new Error('UNIQUE constraint failed: users.uid');
  }

  const { users } = await getCollections();
  const record = {
    uid: normalizedUid,
    name: normalizeText(name),
    vehicle_number: normalizeText(vehicle_number),
    phone: normalizeText(phone),
    balance: Number(balance) || 0,
    is_active: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const ref = users.doc();
  await ref.set(record);
  return { id: ref.id, ...record };
}

async function updateUser(id, updates = {}) {
  const { users } = await getCollections();
  const ref = users.doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;

  const current = snapshot.data();
  const record = {
    ...current,
    name: updates.name !== undefined ? normalizeText(updates.name) : current.name,
    vehicle_number: updates.vehicle_number !== undefined ? normalizeText(updates.vehicle_number) : current.vehicle_number,
    phone: updates.phone !== undefined ? normalizeText(updates.phone) : current.phone,
    balance: updates.balance !== undefined ? Number(updates.balance) || 0 : Number(current.balance || 0),
    is_active: updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : current.is_active,
    updated_at: nowIso(),
  };

  await ref.set(record, { merge: true });
  return { id: ref.id, ...record };
}

async function deleteUser(id) {
  const { users, activeSpots } = await getCollections();
  const ref = users.doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;

  const user = snapshot.data();
  const activeSpotRef = activeSpots.doc(normalizeUid(user.uid));
  const batch = firestore.batch();
  batch.delete(ref);
  batch.delete(activeSpotRef);
  await batch.commit();
  return true;
}

async function listSlots() {
  const { slots, activeSpots } = await getCollections();
  const [slotSnapshot, activeSpotSnapshot] = await Promise.all([
    slots.orderBy('location').get(),
    activeSpots.get(),
  ]);

  const occupiedByLocation = new Map();
  activeSpotSnapshot.docs.forEach((doc) => {
    const activeSpot = doc.data();
    const location = Number(activeSpot.location);
    occupiedByLocation.set(location, (occupiedByLocation.get(location) || 0) + 1);
  });

  return slotSnapshot.docs.map((doc) => {
    const slot = snapshotToRecord(doc);
    const occupied = occupiedByLocation.get(Number(slot.location)) || 0;
    return {
      ...slot,
      occupied,
      available: Math.max(0, Number(slot.total_capacity || 0) - occupied),
    };
  });
}

async function getSlotByLocation(location) {
  const { slots } = await getCollections();
  const snapshot = await slots.doc(String(location)).get();
  if (!snapshot.exists) return null;
  return snapshotToRecord(snapshot);
}

async function updateSlot(location, updates = {}) {
  const { slots } = await getCollections();
  const ref = slots.doc(String(location));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;

  const current = snapshot.data();
  const record = {
    ...current,
    total_capacity: updates.total_capacity !== undefined ? Number(updates.total_capacity) : Number(current.total_capacity || 0),
    label: updates.label !== undefined ? normalizeText(updates.label) : current.label,
    updated_at: nowIso(),
  };

  await ref.set(record, { merge: true });
  return { id: ref.id, ...record };
}

async function listLogs(filters = {}, limit = 25, offset = 0) {
  const { logs } = await getCollections();
  const snapshot = await logs.orderBy('timestamp', 'desc').get();
  const uidTerm = normalizeText(filters.uid).toLowerCase();

  const rows = snapshot.docs
    .map(snapshotToRecord)
    .filter((log) => {
      if (uidTerm && !String(log.uid || '').toLowerCase().includes(uidTerm)) return false;
      if (filters.event_type && log.event_type !== filters.event_type) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.date_from && localDateKey(log.timestamp) < filters.date_from) return false;
      if (filters.date_to && localDateKey(log.timestamp) > filters.date_to) return false;
      return true;
    });

  return {
    logs: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  };
}

async function listAllLogs(filters = {}) {
  const result = await listLogs(filters, Number.MAX_SAFE_INTEGER, 0);
  return result.logs;
}

async function recordLog({ uid, user_name, event_type, location, status, spot_label = '-' }) {
  const { logs } = await getCollections();
  const ref = logs.doc();
  const record = {
    uid: normalizeUid(uid),
    user_name: normalizeText(user_name) || 'Unknown',
    event_type,
    location: Number(location),
    status,
    spot_label,
    timestamp: nowIso(),
  };

  await ref.set(record);
  return { id: ref.id, ...record };
}

async function assignSpot(uid, location) {
  const normalizedUid = normalizeUid(uid);
  const zoneLocation = Number(location);
  const maxZones = 5;

  const preferredOrder = [];
  if (!Number.isNaN(zoneLocation) && zoneLocation >= 1 && zoneLocation <= maxZones) {
    for (let step = 0; step < maxZones; step += 1) {
      const candidate = ((zoneLocation - 1 + step) % maxZones) + 1;
      preferredOrder.push(candidate);
    }
  } else {
    for (let candidate = 1; candidate <= maxZones; candidate += 1) {
      preferredOrder.push(candidate);
    }
  }

  const { slots, activeSpots } = await getCollections();
  const db = await getFirestore();
  const activeRef = activeSpots.doc(normalizedUid);

  return db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(activeRef);
    if (existingSnap.exists) {
      return { id: existingSnap.id, ...existingSnap.data() };
    }

    for (const candidateZone of preferredOrder) {
      const slotRef = slots.doc(String(candidateZone));
      const slotSnap = await transaction.get(slotRef);
      if (!slotSnap.exists) continue;

      const slot = slotSnap.data();
      const totalCapacity = Number(slot.total_capacity || 0);
      if (totalCapacity < 1) continue;

      const activeSnap = await transaction.get(activeSpots.where('location', '==', candidateZone));
      const occupiedSet = new Set(activeSnap.docs.map((doc) => Number(doc.data().spot_number)));

      let freeSpot = null;
      for (let index = 1; index <= totalCapacity; index += 1) {
        if (!occupiedSet.has(index)) {
          freeSpot = index;
          break;
        }
      }

      if (!freeSpot) continue;

      const record = {
        uid: normalizedUid,
        location: candidateZone,
        spot_number: freeSpot,
        spot_label: `${zoneLetter(candidateZone)}${freeSpot}`,
        assigned_at: nowIso(),
      };

      transaction.set(activeRef, record);
      return { id: activeRef.id, ...record };
    }

    return null;
  });
}

async function releaseSpot(uid) {
  const normalizedUid = normalizeUid(uid);
  const { activeSpots } = await getCollections();
  const db = await getFirestore();
  const activeRef = activeSpots.doc(normalizedUid);

  return db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(activeRef);
    if (!existingSnap.exists) return null;

    const record = { id: existingSnap.id, ...existingSnap.data() };
    transaction.delete(activeRef);
    return record;
  });
}

async function getDashboardStats() {
  const { users, logs, slots, activeSpots } = await getCollections();
  const [userSnapshot, logSnapshot, slotSnapshot, activeSpotSnapshot] = await Promise.all([
    users.get(),
    logs.orderBy('timestamp', 'desc').get(),
    slots.get(),
    activeSpots.get(),
  ]);

  const totalCapacity = slotSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().total_capacity || 0), 0);
  const today = localDateKey(new Date());
  const recentLogs = logSnapshot.docs.slice(0, 15).map(snapshotToRecord);
  const todayEntries = logSnapshot.docs.filter((doc) => localDateKey(doc.data().timestamp) === today).length;

  return {
    totalUsers: userSnapshot.size,
    currentlyParked: activeSpotSnapshot.size,
    totalCapacity,
    todayEntries,
    availableSlots: Math.max(0, totalCapacity - activeSpotSnapshot.size),
    recentLogs,
  };
}

module.exports = {
  init,
  getDashboardStats,
  listUsers,
  getUserById,
  getUserByUid,
  createUser,
  updateUser,
  deleteUser,
  listLogs,
  listAllLogs,
  listSlots,
  getSlotByLocation,
  updateSlot,
  assignSpot,
  releaseSpot,
  recordLog,
};