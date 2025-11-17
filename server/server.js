// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
// Load local .env in development so `process.env.HOST_PASS` etc. are available.
// We point to the repository root .env (one level up from server/).
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // ignore if dotenv isn't installed or .env not present
}
const crypto = require('crypto');
const { Server } = require('socket.io');
let calcMode = "mean"; // default mode 

// Host credentials (set via env vars). In production ensure these are provided and
// that the server is behind TLS so Basic Auth credentials aren't exposed in plain text.
const HOST_USER = process.env.HOST_USER || '';
const HOST_PASS = process.env.HOST_PASS || '';
// Host token used for authenticating socket connections. If not provided, falls
// back to HOST_PASS (not ideal for rotation; providing a separate token is recommended).
const HOST_TOKEN = process.env.HOST_TOKEN || HOST_PASS;

// No in-memory token issuance anymore; socket host auth will only check
// the configured `HOST_TOKEN` environment variable.

// Timing-safe comparison helper
function safeEquals(a, b) {
  try {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch (e) {
    return false;
  }
}

// Basic Auth middleware for protecting the host UI routes
function basicAuth(req, res, next) {
  if (!HOST_PASS) {
    // If password isn't configured, treat as service unavailable rather than allow open access
    return res.status(503).send('Host auth not configured');
  }

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Host"');
    return res.status(401).send('Authentication required');
  }

  const b = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const idx = b.indexOf(':');
  // Accept any username, only validate the password to keep the browser prompt UX simple
  const pass = idx >= 0 ? b.slice(idx + 1) : '';

  if (safeEquals(pass, HOST_PASS)) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Host"');
  return res.status(401).send('Authentication required');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // CORS if needed in dev — adjust for production
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const distPath = path.join(__dirname, '..', 'client', 'dist');
console.log("Frontend build path:", distPath);

// Always serve the built client `client/dist` from this server (so port 3000
// serves the SPA). Enforce Basic Auth for `/host` routes in all environments.
app.use('/host', basicAuth, express.static(distPath));

// Serve static built client for all routes
app.use(express.static(distPath));

// SPA fallback so client-side routes like /display and /host return index.html
// For requests that start with /host we must enforce Basic Auth before
// returning the index.html so that client-side routing doesn't bypass auth.
app.use((req, res) => {
  if (req.path && req.path.startsWith('/host')) {
    return basicAuth(req, res, () => res.sendFile(path.join(distPath, 'index.html')));
  }
  return res.sendFile(path.join(distPath, 'index.html'));
});

// NOTE: token issuance/login endpoint removed — using simple Basic Auth and static
// HOST_TOKEN for socket host actions. If you need a token exchange later,
// reintroduce an endpoint here.
 
// Server state (authoritative)
let roundActive = false;
let currentRolls = [];
let usersWhoRolled = new Set(); // sessionId set
// Map socket.id -> sessionId for per-socket session-registered emissions
const socketSessionMap = new Map();
// rollMode: 'normal' | 'advantage' | 'disadvantage'
let rollMode = 'normal';

const PORT = process.env.PORT || 3000;

// Utility: calculate stats + include roundActive + connections
function calculateStats() {
  const connectedCount = io.sockets.sockets.size || 0;

  if (currentRolls.length === 0) {
    return {
      roundActive,
      count: 0,
      total: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      rolls: [],
      connectedCount,
      calcMode,
      computedResult: 0
    };
  }

  const results = currentRolls.map(r => r.result);
  const total = results.reduce((sum, v) => sum + v, 0);
  const average = Math.round((total / results.length)); // whole num  
  const highest = Math.max(...results);
  const lowest = Math.min(...results);

  // --- NEW CALCULATION MODES ---
  let computedResult = 0;

  if (calcMode === "mean") {
    computedResult = average;
  }

  else if (calcMode === "median") {
    const sorted = [...results].sort((a,b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    computedResult = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }

  else if (calcMode === "mode") {
    const freq = {};
    results.forEach(n => freq[n] = (freq[n] || 0) + 1);
    const maxFreq = Math.max(...Object.values(freq));
    const modes = Object.keys(freq).filter(k => freq[k] === maxFreq);
    computedResult = Number(modes[0]); // pick first mode
  }

  return {
    roundActive,
    count: results.length,
    total,
    average,
    highest,
    lowest,
    rolls: results,
    connectedCount,
    calcMode,
    rollMode,
    computedResult
  };
}


// Broadcast current state to all clients
function broadcastState() {
  const stats = calculateStats();
  io.emit('rolls-update', stats);
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Socket connections are not gated by a handshake token. Host UI is
  // protected by Basic Auth (HTTP) — sockets assume the client is allowed
  // to perform actions if it can access the host UI.

  // Immediately send current state to the newly connected client
  socket.emit('rolls-update', calculateStats());

  // Keep track of sessionId if provided later
  let sessionId = null;

  // Client registers sessionId after connecting
  socket.on('register-session', (data) => {
    if (data && data.sessionId) {
      sessionId = data.sessionId;
      console.log(`Registered session ${sessionId} for socket ${socket.id}`);
      socketSessionMap.set(socket.id, sessionId);
      // Inform the client whether this session has already rolled this round
      const already = usersWhoRolled.has(sessionId);
      socket.emit('session-registered', { hasRolled: already });
    }
  });

  // Start a round (host action)
  socket.on('start-round', () => {
    console.log('start-round requested by', socket.id);
    roundActive = true;
    // Clear previous per-round user flag but keep historical rolls if you want or clear
    // For "new round" semantics we usually clear rolls as well:
    currentRolls = [];
    usersWhoRolled.clear();
    // Broadcast state and notify all sockets of their session status
    broadcastState();
    // For each connected socket, inform whether that session has rolled (now all false)
    for (const [sid, sess] of socketSessionMap.entries()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('session-registered', { hasRolled: usersWhoRolled.has(sess) });
      }
    }
    io.emit('round-started');
  });

  // End a round (stop accepting rolls)
  socket.on('end-round', () => {
    console.log('end-round requested by', socket.id);
    roundActive = false;
    broadcastState();
    // Notify clients of round end and update their session status
    for (const [sid, sess] of socketSessionMap.entries()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('session-registered', { hasRolled: usersWhoRolled.has(sess) });
      }
    }
    io.emit('round-ended');
  });

  // Reset round (clear rolls + reopen for new)
  socket.on('reset-round', () => {
    console.log('reset-round requested by', socket.id);
    roundActive = false;
    currentRolls = [];
    usersWhoRolled.clear();
    broadcastState();
    for (const [sid, sess] of socketSessionMap.entries()) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('session-registered', { hasRolled: usersWhoRolled.has(sess) });
      }
    }
    io.emit('round-reset');
  });



  // Handle roll from a client
  socket.on('roll-dice', (data) => {
    if (!sessionId) {
      socket.emit('error', { message: 'No session ID registered. Please register session first.' });
      return;
    }

    if (!roundActive) {
      socket.emit('round-inactive', { message: 'Round is not active. Wait for host to start the round.' });
      socket.emit('roll-rejected', { reason: 'round-inactive', message: 'Round is not active.' });
      return;
    }

    // Prevent double-rolls per session
    if (usersWhoRolled.has(sessionId)) {
      socket.emit('already-rolled', { message: 'You already rolled this round!' });
      socket.emit('roll-rejected', { reason: 'already-rolled', message: 'You already rolled this round.' });
      return;
    }

    const rollValue = Number(data && data.result);
    if (!Number.isFinite(rollValue)) {
      socket.emit('error', { message: 'Invalid roll value' });
      return;
    }

    console.log(`Session ${sessionId} rolled: ${rollValue}`);

    currentRolls.push({
      sessionId,
      result: rollValue,
      raw: Array.isArray(data && data.raw) ? data.raw : undefined,
      timestamp: Date.now()
    });

    usersWhoRolled.add(sessionId);

    // Acknowledge the rolling socket that the roll was accepted
    const stats = calculateStats();
    socket.emit('roll-accepted', { result: rollValue, stats });

    broadcastState();
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'reason:', reason);
    // We do not remove usersWhoRolled entries on disconnect — sessionId is persistent in localStorage
    // Broadcast connection count change
    socketSessionMap.delete(socket.id);
    broadcastState();
  });

  socket.on('set-mode', (newMode) => {
  if (typeof newMode === 'string') {
    calcMode = newMode;
    console.log("Calculation mode changed to:", newMode);
    broadcastState(); // update everyone
  }
  });

  // Set roll mode: 'normal' | 'advantage' | 'disadvantage'
  socket.on('set-roll-mode', (mode) => {
    if (typeof mode === 'string' && ['normal', 'advantage', 'disadvantage'].includes(mode)) {
      rollMode = mode;
      console.log('Roll mode changed to:', rollMode);
      broadcastState();
    }
  });

  socket.on('host-test-roll', (value) => {
  if (!roundActive) return; // respect round rules

  const rollValue = Number(value);
  if (!Number.isFinite(rollValue)) return;

  console.log("HOST TEST ROLL:", rollValue);

  // Push a synthetic roll
  currentRolls.push({
    sessionId: "HOST_TEST",
    result: rollValue,
    timestamp: Date.now()
  });

  broadcastState();
});



});

server.listen(PORT, () => {
  console.log(`🎲 Audience Dice Roller running on http://localhost:${PORT}`);
  console.log(`📱 Roller: http://localhost:${PORT}/`);
  console.log(`📺 Display: http://localhost:${PORT}/display`);
  console.log(`🧑‍✈️ Host: http://localhost:${PORT}/host`);
});
