import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './HostPage.css';

function HostPage() {
  const [stats, setStats] = useState({
    roundActive: false,
    count: 0,
    total: 0,
    average: 0,
    highest: 0,
    lowest: 0,
    rolls: [],
    connectedCount: 0
  });

  const [status, setStatus] = useState('Connecting...');
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    socket.on('connect', () => {
      setStatus('Connected');
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
    });

    socket.on('rolls-update', (newStats) => {
      setStats(newStats);
    });

    socket.on('already-rolled', (msg) => {
      console.warn('already-rolled:', msg);
    });

    socket.on('round-inactive', (msg) => {
      console.warn('round-inactive:', msg);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('rolls-update');
      socket.disconnect();
    };
  }, []);

  const startRound = () => socketRef.current.emit('start-round');
  const endRound = () => socketRef.current.emit('end-round');
  const resetRound = () => {
    if (window.confirm('Reset round and clear all rolls?')) {
      socketRef.current.emit('reset-round');
    }
  };

  // Host can generate a test roll (useful before audience joins)
  const hostTestRoll = () => {
    const roll = Math.floor(Math.random() * 20) + 1;
    socketRef.current.emit('roll-dice', { result: roll, test: true });
  };

  return (
    <div className="host-page">
      <div className="host-container">
        <h1>Host Dashboard — Audience Dice Roller</h1>
        <div className="host-top">
          <div className="host-status">Status: <strong>{status}</strong></div>
          <div className="host-connections">Connected: <strong>{stats.connectedCount}</strong></div>
          <div className="host-round">Round Active: <strong>{stats.roundActive ? 'Yes' : 'No'}</strong></div>
        </div>

        <div className="controls">
          <button onClick={startRound}>Start Round</button>
          <button onClick={endRound}>End Round</button>
          <button onClick={resetRound}>Reset Round</button>
          <button onClick={hostTestRoll}>Host Test Roll</button>
        </div>

        <div className="stats-grid">
          <div className="stat">
            <div className="label">Total Rolls</div>
            <div className="value">{stats.count}</div>
          </div>
          <div className="stat">
            <div className="label">Average</div>
            <div className="value">{stats.average ? stats.average.toFixed(1) : '—'}</div>
          </div>
          <div className="stat">
            <div className="label">Total</div>
            <div className="value">{stats.total}</div>
          </div>
          <div className="stat">
            <div className="label">Highest</div>
            <div className="value">{stats.highest || '—'}</div>
          </div>
          <div className="stat">
            <div className="label">Lowest</div>
            <div className="value">{stats.lowest || '—'}</div>
          </div>
        </div>

        <div className="rolls-section">
          <h3>Recent Rolls</h3>
          <div className="rolls-list">
            {stats.rolls && stats.rolls.length ? (
              stats.rolls.slice().reverse().map((r, i) => (
                <div key={i} className="roll-item">{r}</div>
              ))
            ) : (
              <div className="roll-empty">No rolls yet</div>
            )}
          </div>
        </div>

        <div className="note">
          <small>Open <code>/display</code> on the projector when ready. Host dashboard is for operator controls only.</small>
        </div>
      </div>
    </div>
  );
}

export default HostPage;
