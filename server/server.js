// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

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
console.log("Serving frontend from:", distPath);

app.use(express.static(distPath));
 
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
      connectedCount
    };
  }

  const results = currentRolls.map(r => r.result);
  const total = results.reduce((sum, val) => sum + val, 0);
  const average = total / results.length;
  const highest = Math.max(...results);
  const lowest = Math.min(...results);

  return {
    roundActive,
    count: currentRolls.length,
    total,
    average: Math.round(average * 10) / 10,
    highest,
    lowest,
    rolls: results,
    connectedCount
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
});

server.listen(PORT, () => {
  console.log(`🎲 Audience Dice Roller running on http://localhost:${PORT}`);
  console.log(`📱 Roller: http://localhost:${PORT}/`);
  console.log(`📺 Display: http://localhost:${PORT}/display`);
  console.log(`🧑‍✈️ Host: http://localhost:${PORT}/host`);
});
