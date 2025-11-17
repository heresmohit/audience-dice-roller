import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './RollerPage.css';

function RollerPage() {
  // State management
  const [canRoll, setCanRoll] = useState(false);
  const [result, setResult] = useState('');
  const [resultColor, setResultColor] = useState('white');
  const [status, setStatus] = useState('Connecting...');
  
  // Socket reference (persists across renders)
  const socketRef = useRef(null);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    // Get or create session ID
    let id = localStorage.getItem('diceRollerSessionId');
    if (!id) {
      id = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('diceRollerSessionId', id);
    }
    sessionIdRef.current = id;

    // Create socket connection
    socketRef.current = io();
    const socket = socketRef.current;

    // Socket event listeners
    socket.on('connect', () => {
      setStatus('Connected! Ready to roll');
      setCanRoll(true);
      socket.emit('register-session', { sessionId: sessionIdRef.current });
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected - reconnecting...');
      setCanRoll(false);
    });

    socket.on('already-rolled', () => {
      setResult('⚠️ Already rolled this round!');
      setResultColor('#FFB347');
      
      setTimeout(() => {
        setResult('');
        setResultColor('white');
      }, 2000);
    });


    socket.on('rolls-update', (stats) => {
            // Clear result if new round / no rolls
        if (stats.count === 0) {
            setResult('');
            setResultColor('white');
        }

        // New: disable rolling when round is inactive
        if (!stats.roundActive) {
            setCanRoll(false);
            setStatus('Waiting for host to start a round...');
        } else {
            setCanRoll(true);
            setStatus('Connected! Ready to roll');
        }
    });

    socket.on('round-inactive', () => {
    setResult('Round not active yet!');
    setResultColor('#FFB347');

    setTimeout(() => {
        setResult('');
        setResultColor('white');
    }, 2000);
    });

    // Cleanup on unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('already-rolled');
      socket.off('rolls-update');
      socket.disconnect();
    };
  }, []);

  // Roll handler
  const handleRoll = () => {
    if (!canRoll) return;

    const roll = Math.floor(Math.random() * 20) + 1;
    
    if (roll === 20) {
      setResult('🎉 NAT 20! 🎉');
      setResultColor('#FFD700');
    } else if (roll === 1) {
      setResult(`You rolled: ${roll}`);
      setResultColor('#FF6B6B');
    } else {
      setResult(`You rolled: ${roll}`);
      setResultColor('white');
    }

    socketRef.current.emit('roll-dice', { result: roll });
  };

    

  return (
    <div className="roller-page">
      <h1>🎲 Audience Dice Roller</h1>
      
      <button 
        className="roll-button" 
        onClick={handleRoll}
        disabled={!canRoll}
      >
        ROLL<br/>D20
      </button>
      
      <div className="result" style={{ color: resultColor }}>
        {result}
      </div>
      
      <div className="status">{status}</div>
    </div>
  );


  
}

export default RollerPage;