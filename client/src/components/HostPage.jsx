// client/src/components/HostPage.jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './HostPage.css';

  function HostPage() {
    const [stats, setStats] = useState({
      roundActive: false,
      count: 0,
      total: 0,
      highest: 0,
      lowest: 0,
      rolls: [],
      connectedCount: 0,
      calcMode: "mean",
      computedResult: 0
    });

    const [status, setStatus] = useState('Connecting...');
    const [mode, setMode] = useState("mean");
    const [rollMode, setRollMode] = useState('normal');
    const socketRef = useRef(null);

    const prettyName = {
      mean: "Mean",
      median: "Median",
      mode: "Mode"
    };

    useEffect(() => {
      const socketUrl = import.meta.env.VITE_SOCKET_URL ? import.meta.env.VITE_SOCKET_URL : undefined;
      socketRef.current = io(socketUrl);
      const socket = socketRef.current;

      socket.on('connect', () => {
        setStatus('Connected');
      });

      socket.on('disconnect', () => {
        setStatus('Disconnected');
      });

      socket.on('rolls-update', (newStats) => {
        setStats(newStats);
        setMode(newStats.calcMode);
        if (newStats.rollMode) setRollMode(newStats.rollMode);
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

    // Optional: host test roll
    const hostTestRoll = () => {
      const roll = Math.floor(Math.random() * 20) + 1;
      socketRef.current.emit('host-test-roll', roll);
    };

    const changeMode = (newMode) => {
      setMode(newMode);
      socketRef.current.emit('set-mode', newMode);
    };

    const changeRollMode = (newMode) => {
      setRollMode(newMode);
      socketRef.current.emit('set-roll-mode', newMode);
    };

    const revealResult = () => {
        socketRef.current.emit('reveal-result');
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
            <button onClick={revealResult}>Reveal Result</button>
          </div>

          {/* MODE SELECTOR */}
          <div className="mode-selector">
            <label>Calculation Mode:</label>
            <select 
              value={mode}
              onChange={(e) => changeMode(e.target.value)}
            >
              <option value="mean">Mean (Average)</option>
              <option value="median">Median</option>
              <option value="mode">Mode</option>
            </select>
          </div>

          {/* ROLL MODE SELECTOR */}
          <div className="mode-selector">
            <label>Roll Mode:</label>
            <select
              value={rollMode}
              onChange={(e) => changeRollMode(e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="advantage">Advantage</option>
              <option value="disadvantage">Disadvantage</option>
            </select>
          </div>

          {/* STATS GRID */}
          <div className="stats-grid">

            {/* NEW RESULT CARD */}
            <div className="stat">
              <div className="label">Result ({prettyName[stats.calcMode]})</div>
              <div className="value">{stats.computedResult}</div>
            </div>

            <div className="stat">
              <div className="label">Total Rolls</div>
              <div className="value">{stats.count}</div>
            </div>

            <div className="stat">
              <div className="label">Highest</div>
              <div className="value">{stats.highest || "—"}</div>
            </div>

            <div className="stat">
              <div className="label">Lowest</div>
              <div className="value">{stats.lowest || "—"}</div>
            </div>
          </div>

          {/* ROLLS LIST */}
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
            <small>
              /display will show only the final result based on your selected mode.
            </small>
          </div>
        </div>
      </div>
    );
  }

export default HostPage;
