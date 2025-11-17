// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
let calcMode = "mean"; // default mode 

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

if (process.env.NODE_ENV === 'production') {
  // Serve static built client in production
  app.use(express.static(distPath));

  // SPA fallback so client-side routes like /display and /host return index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // In development we expect the Vite dev server to serve the client (fast HMR)
  console.log('Development mode: run the client with `npm --prefix client run dev`');
}
 
// Server state (authoritative)
let roundActive = false;
let currentRolls = [];
let usersWhoRolled = new Set(); // sessionId set

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

  // Immediately send current state to the newly connected client
  socket.emit('rolls-update', calculateStats());

  // Keep track of sessionId if provided later
  let sessionId = null;

  // Client registers sessionId after connecting
  socket.on('register-session', (data) => {
    if (data && data.sessionId) {
      sessionId = data.sessionId;
      console.log(`Registered session ${sessionId} for socket ${socket.id}`);
      // If they already rolled this round, inform them
      if (usersWhoRolled.has(sessionId)) {
        socket.emit('already-rolled', { message: 'You already rolled this round!' });
      }
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
    broadcastState();
  });

  // End a round (stop accepting rolls)
  socket.on('end-round', () => {
    console.log('end-round requested by', socket.id);
    roundActive = false;
    broadcastState();
  });

  // Reset round (clear rolls + reopen for new)
  socket.on('reset-round', () => {
    console.log('reset-round requested by', socket.id);
    roundActive = false;
    currentRolls = [];
    usersWhoRolled.clear();
    broadcastState();
  });



  // Handle roll from a client
  socket.on('roll-dice', (data) => {
    if (!sessionId) {
      socket.emit('error', { message: 'No session ID registered. Please register session first.' });
      return;
    }

    if (!roundActive) {
      socket.emit('round-inactive', { message: 'Round is not active. Wait for host to start the round.' });
      return;
    }

    // Prevent double-rolls per session
    if (usersWhoRolled.has(sessionId)) {
      socket.emit('already-rolled', { message: 'You already rolled this round!' });
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
      timestamp: Date.now()
    });

    usersWhoRolled.add(sessionId);

    broadcastState();
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'reason:', reason);
    // We do not remove usersWhoRolled entries on disconnect — sessionId is persistent in localStorage
    // Broadcast connection count change
    broadcastState();
  });

  socket.on('set-mode', (newMode) => {
  if (typeof newMode === 'string') {
    calcMode = newMode;
    console.log("Calculation mode changed to:", newMode);
    broadcastState(); // update everyone
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
