const express = require('express');
const router = express.Router();
const store = require('../firebase-store');

// GET /api/slots — All zones with live occupancy
router.get('/', async (req, res) => {
  try {
    const slots = await store.listSlots();
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/slots/:location — Update zone capacity or label
router.put('/:location', async (req, res) => {
  try {
    const slot = await store.getSlotByLocation(req.params.location);
    if (!slot) return res.status(404).json({ error: 'Zone not found' });

    const { total_capacity, label } = req.body;

    const updated = await store.updateSlot(req.params.location, { total_capacity, label });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
