const express = require('express');
const router = express.Router();
const store = require('../firebase-store');

// GET /api/logs — Paginated & filterable access logs
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;

    const { logs, total } = await store.listLogs({
      uid: req.query.uid,
      event_type: req.query.event_type,
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    }, limit, offset);

    res.json({ logs, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/export — Download all logs as CSV
router.get('/export', async (req, res) => {
  try {
    const logs = await store.listAllLogs();

    let csv = 'ID,UID,User Name,Event Type,Location,Status,Timestamp\n';
    for (const log of logs) {
      csv += `${log.id},"${log.uid}","${log.user_name}",${log.event_type},${log.location},${log.status},"${log.timestamp}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=parking_logs.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
