const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' folder
app.use(express.static('public'));

// Store current round's rolls
let currentRolls = [];
let usersWhoRolled = new Set(); // Track who has rolled this round (by session ID)

const PORT = process.env.PORT || 3000;


// When someone connects
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Store session ID for this socket
  let sessionId = null;

  // Send current state to new connection

  // Register session ID
  socket.on('register-session', (data) => {
    sessionId = data.sessionId;
    console.log('Session registered:', sessionId);
    
    // Tell them if they already rolled this round
    if (usersWhoRolled.has(sessionId)) {
      socket.emit('already-rolled', { message: 'You already rolled this round!' });
    }
  });

  // When someone rolls dice
  socket.on('roll-dice', (data) => {
    if (!sessionId) {
      socket.emit('error', { message: 'No session ID' });
      return;
    }

    // Check if user already rolled this round (by session)
    if (usersWhoRolled.has(sessionId)) {
      socket.emit('already-rolled', { message: 'You already rolled this round!' });
      return;
    }

    console.log(`Session ${sessionId} rolled: ${data.result}`);
    
    // Add roll to current round
    currentRolls.push({
      sessionId: sessionId,
      result: data.result,
      timestamp: Date.now()
    });

    // Mark this session as having rolled
    usersWhoRolled.add(sessionId);

    // Calculate and broadcast stats to everyone
    const stats = calculateStats();
    io.emit('rolls-update', stats);
  });

  // When host resets the round
  socket.on('reset-round', () => {
    console.log('Round reset by host');
    currentRolls = [];
    usersWhoRolled.clear(); // Clear the list of users who rolled
    io.emit('rolls-update', calculateStats());
  });

  // When someone disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Calculate statistics from current rolls
function calculateStats() {
  if (currentRolls.length === 0) {
    return {
      count: 0,
      total: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      rolls: []
    };
  }

  const results = currentRolls.map(r => r.result);
  const total = results.reduce((sum, val) => sum + val, 0);
  const average = total / results.length;
  const highest = Math.max(...results);
  const lowest = Math.min(...results);

  return {
    count: currentRolls.length,
    total: total,
    average: Math.round(average * 10) / 10, // Round to 1 decimal
    highest: highest,
    lowest: lowest,
    rolls: results
  };
}


server.listen(PORT, () => {
  console.log(`🎲 Audience Dice Roller running on http://localhost:${PORT}`);
  console.log(`📱 Roller: http://localhost:${PORT}/`);
  console.log(`📺 Display: http://localhost:${PORT}/display.html`);
});