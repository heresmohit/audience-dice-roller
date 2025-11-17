import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './DisplayPage.css';

function DisplayPage() {
  // State for stats
  const [stats, setStats] = useState({
    count: 0,
    total: 0,
    average: 0,
    highest: 0,
    lowest: 0,
    rolls: []
  });
  
  const [status, setStatus] = useState('Connecting...');
  
  // Socket reference
  const socketRef = useRef(null);

  useEffect(() => {
    // Create socket connection
    socketRef.current = io();
    const socket = socketRef.current;

    // Socket event listeners
    socket.on('connect', () => {
      setStatus('✓ Connected');
    });

    socket.on('disconnect', () => {
      setStatus('✗ Disconnected');
    });

    socket.on('rolls-update', (newStats) => {
        setStats(newStats);

        // Update connection status label nicely
        if (!newStats.roundActive) {
            setStatus('⏳ Waiting for host to start round');
        } else {
            setStatus('✓ Round Active');
        }
    });

    // Cleanup on unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('rolls-update');
      socket.disconnect();
    };
  }, []);

  // Reset handler
  const handleReset = () => {
    if (window.confirm('Reset this round? All rolls will be cleared.')) {
      socketRef.current.emit('reset-round');
    }
  };

  // Render individual rolls with special styling
  const renderRolls = () => {
    if (stats.rolls.length === 0) {
      return <span style={{ opacity: 0.5 }}>No rolls yet</span>;
    }
    
    return stats.rolls.map((roll, index) => {
      let className = 'roll-item';
      if (roll === 20) className += ' roll-nat20';
      if (roll === 1) className += ' roll-nat1';
      
      return (
        <span key={index} className={className}>
          {roll}
        </span>
      );
    });
  };

  return (
    <div className="display-page">
      <div className="container">
        <h1>🎲 AUDIENCE DICE ROLLER 🎲</h1>

        <div className="round-status">
        {stats.roundActive ? (
            <div className="round-on">🟢 Round Active</div>
        ) : (
            <div className="round-off">⚪ Waiting for next round</div>
        )}
        </div>
        
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Rolls</div>
            <div className="stat-value">{stats.count}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Average</div>
            <div className="stat-value">{stats.average.toFixed(1)}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Highest</div>
            <div className="stat-value">{stats.highest || '-'}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-label">Lowest</div>
            <div className="stat-value">{stats.lowest || '-'}</div>
          </div>
        </div>
        
        <div className="rolls-list">
          <h3>Recent Rolls:</h3>
          <div className="rolls-container">
            {renderRolls()}
          </div>
        </div>
        
        <div className="controls">
          <button onClick={handleReset}>RESET ROUND</button>
        </div>
        
        <div className="status">{status}</div>
      </div>
    </div>
  );
}

export default DisplayPage;