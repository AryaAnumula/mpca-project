const express = require('express');
const router = express.Router();
const store = require('../firebase-store');

// GET /api/users — List all registered users
router.get('/', async (req, res) => {
  try {
    const users = await store.listUsers(req.query.search || '');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — Get a single user
router.get('/:id', async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST /api/users — Register a new RFID user
router.post('/', async (req, res) => {
  const { uid, name, vehicle_number, phone, balance } = req.body;
  if (!uid || !name) {
    return res.status(400).json({ error: 'UID and Name are required' });
  }

  try {
    const user = await store.createUser({ uid, name, vehicle_number, phone, balance });
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'This UID is already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — Update user info
router.put('/:id', async (req, res) => {
  const user = await store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, vehicle_number, phone, balance, is_active } = req.body;

  try {
    const updated = await store.updateUser(req.params.id, { name, vehicle_number, phone, balance, is_active });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — Remove user
router.delete('/:id', async (req, res) => {
  const deleted = await store.deleteUser(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

module.exports = router;
