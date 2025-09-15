// Minimal Express server to serve as a local placeholder for Europa League endpoints
// Usage: node server/uel-server.js

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;

app.get('/uel/ping', (req, res) => {
  res.json({ ok: true, league: 'Europa League' });
});

// Serve static sample data if needed
app.use('/uel/static', express.static(path.join(__dirname, 'static')));

app.listen(PORT, () => {
  console.log(`UEL server listening on port ${PORT}`);
});
