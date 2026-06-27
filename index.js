require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./server/config/db');
connectDB();
const apiRoutes = require('./server/routes/api');
const { startSyncJob } = require('./server/jobs/syncJob');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Serve Static Frontend ────────────────────────────────────────────────────
// HTML: never cache — always fetch fresh so code changes reflect immediately
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// CSS / JS: ETag-based caching (browser revalidates, gets fresh copy when file changes)
app.use(express.static(path.join(__dirname, 'public'), {
  etag:         true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status:  'running',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ─── Serve SPA for any unknown route ─────────────────────────────────────────
app.get('/*splat', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ─── Start Server ─────────────────────────────────────────────────────────────
const start = async () => {
  app.listen(PORT, () => {
    console.log(`\n🚀 CodeTracker running at http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api\n`);
  });
  startSyncJob();
};

start();
