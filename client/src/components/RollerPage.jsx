import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './RollerPage.css';

function RollerPage() {
  // State management
  const [canRoll, setCanRoll] = useState(false);
  const [result, setResult] = useState('');
  const [resultColor, setResultColor] = useState('white');
  const [status, setStatus] = useState('Connecting...');
  const [rollMode, setRollMode] = useState('normal');
  
  // Socket reference (persists across renders)
  const socketRef = useRef(null);
  const sessionIdRef = useRef(null);
  const lastLocalRollRef = useRef(null); // { value, ts, timeoutId }
  const hasRolledRef = useRef(false);
  const [hasRolled, setHasRolled] = useState(false);
  const safetyTimeoutRef = useRef(null);
  const sessionRegisteredRef = useRef(false);
  const [localRolls, setLocalRolls] = useState(null); // { raw: [r1, r2?], selected }
  const latestStatsRef = useRef(null);

  useEffect(() => {
    // Get or create session ID
    let id = localStorage.getItem('diceRollerSessionId');
    if (!id) {
      id = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('diceRollerSessionId', id);
    }
    sessionIdRef.current = id;

    // Create socket connection (allow overriding via VITE_SOCKET_URL)
    const socketUrl = import.meta.env.VITE_SOCKET_URL ? import.meta.env.VITE_SOCKET_URL : undefined;
    socketRef.current = io(socketUrl);
    const socket = socketRef.current;

    // Socket event listeners
    socket.on('connect', () => {
      setStatus('Connected! Ready to roll');
      // set based on whether round is active and whether we've rolled
        setStatus('Connected — waiting for session info...');
        setCanRoll(false);
      socket.emit('register-session', { sessionId: sessionIdRef.current });
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected - reconnecting...');
      setCanRoll(false);
    });

    socket.on('already-rolled', (payload) => {
      // mark that this session has rolled this round
      hasRolledRef.current = true;
      setHasRolled(true);

      // Show warning, but if we just displayed a local roll, delay the warning
      const now = Date.now();
      const last = lastLocalRollRef.current;

      const showWarning = () => {
        setResult('⚠️ Already rolled this round!');
        setResultColor('#FFB347');

        setTimeout(() => {
          setResult('');
          setResultColor('white');
        }, 2000);
      };

      if (last && (now - last.ts) < 1200) {
        const id = setTimeout(showWarning, 900);
        lastLocalRollRef.current.timeoutId = id;
      } else {
        showWarning();
      }
      sessionRegisteredRef.current = true;
    });
    socket.on('session-registered', (payload) => {
      // server told us whether this session already rolled this round
      const already = payload && payload.hasRolled;
      hasRolledRef.current = !!already;
      setHasRolled(!!already);
      sessionRegisteredRef.current = true;

      // Now that the server confirmed our session status, enable rolling if appropriate
      const stats = latestStatsRef.current;
      if (stats && stats.roundActive && !hasRolledRef.current) {
        setCanRoll(true);
      } else {
        setCanRoll(false);
      }
    });


    socket.on('rolls-update', (stats) => {
            // Clear result if new round / no rolls
        if (stats.count === 0) {
            setResult('');
            setResultColor('white');
        }

      // store latest stats for session-registered handling
      latestStatsRef.current = stats;

        // New: disable rolling when round is inactive
          if (!stats.roundActive) {
            setCanRoll(false);
            setStatus('Waiting for host to start a round...');
          } else {
            // Only enable rolling if the server confirmed our session status
            if (sessionRegisteredRef.current) {
              setCanRoll(!hasRolledRef.current);
            } else {
              // still waiting for session registration to know if we've already rolled
              setCanRoll(false);
            }
            setStatus('Connected! Ready to roll');
      }
        // update roll mode if provided
        if (stats && stats.rollMode) setRollMode(stats.rollMode);
    });

    socket.on('round-inactive', () => {
    setResult('Round not active yet!');
    setResultColor('#FFB347');

    setTimeout(() => {
        setResult('');
        setResultColor('white');
    }, 2000);
    });

    socket.on('roll-accepted', (payload) => {
      // server acknowledged our roll — mark that we've rolled
      hasRolledRef.current = true;
      setHasRolled(true);
      setCanRoll(false);

      // optionally update UI/stats if payload.stats provided
      if (payload && payload.stats) {
        // if the server cleared rolls (new round) payload.stats.count===0 would be handled by rolls-update
      }
      // clear safety timeout if any
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    });

    socket.on('roll-rejected', (payload) => {
      // treat similarly to already-rolled or round-inactive
      const reason = payload && payload.reason;
      hasRolledRef.current = reason === 'already-rolled' ? true : hasRolledRef.current;
      setHasRolled(hasRolledRef.current);

      const now = Date.now();
      const last = lastLocalRollRef.current;

      const showRejected = () => {
        if (reason === 'round-inactive') {
          setResult('Round not active yet!');
        } else if (reason === 'already-rolled') {
          setResult('⚠️ Already rolled this round!');
        } else {
          setResult(payload && payload.message ? payload.message : 'Roll rejected');
        }
        setResultColor('#FFB347');

        setTimeout(() => {
          setResult('');
          setResultColor('white');
        }, 2000);
      };

      if (last && (now - last.ts) < 1200) {
        const id = setTimeout(showRejected, 900);
        lastLocalRollRef.current.timeoutId = id;
      } else {
        showRejected();
      }
      // clear safety timeout
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    });

    // Cleanup on unmount
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('already-rolled');
      socket.off('rolls-update');
      socket.off('round-inactive');
      socket.off('session-registered');
      socket.off('roll-accepted');
      socket.off('roll-rejected');
      socket.disconnect();

      // clear any pending local roll timeout
      const last = lastLocalRollRef.current;
      if (last && last.timeoutId) clearTimeout(last.timeoutId);
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, []);

  // Roll handler
  const handleRoll = () => {
    if (!canRoll) return;

    // prevent further clicks until server acknowledges or rejects
    setCanRoll(false);

    // safety: if no server response within X ms, re-enable so user isn't stuck
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      if (!hasRolledRef.current) setCanRoll(true);
      safetyTimeoutRef.current = null;
    }, 5000);

    // Helper to record last local roll for delayed rejection/warning handling
    const recordLocal = (payload) => {
      if (lastLocalRollRef.current && lastLocalRollRef.current.timeoutId) {
        clearTimeout(lastLocalRollRef.current.timeoutId);
      }
      lastLocalRollRef.current = { ...payload, ts: Date.now(), timeoutId: null };
      setLocalRolls({ raw: Array.isArray(payload.raw) ? payload.raw : [payload.selected], selected: payload.selected });
    };

    if (rollMode === 'advantage' || rollMode === 'disadvantage') {
      const r1 = Math.floor(Math.random() * 20) + 1;
      const r2 = Math.floor(Math.random() * 20) + 1;
      const selected = rollMode === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
      recordLocal({ raw: [r1, r2], selected });

      const modeText = rollMode === 'advantage' ? ' (advantage)' : ' (disadvantage)';
      if (selected === 20) {
        setResult(`🎉 ${r1} & ${r2} → ${selected}${modeText} 🎉`);
        setResultColor('#FFD700');
      } else if (selected === 1) {
        setResult(`${r1} & ${r2} → ${selected}${modeText}`);
        setResultColor('#FF6B6B');
      } else {
        setResult(`${r1} & ${r2} → ${selected}${modeText}`);
        setResultColor('white');
      }

      socketRef.current.emit('roll-dice', { result: selected, raw: [r1, r2] });
    } else {
      const roll = Math.floor(Math.random() * 20) + 1;
      recordLocal({ raw: [roll], selected: roll });

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
    }
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
        {localRolls && localRolls.raw && localRolls.raw.length > 1 ? (
          <div>
            <div className="rolls-inline">
              {localRolls.raw.map((v, i) => (
                <span
                  key={i}
                  className={`roll-num ${v === localRolls.selected ? 'selected' : 'other'}`}
                >
                  {v}
                </span>
              ))}
            </div>
            <div className="roll-note">Selected: <strong>{localRolls.selected}</strong></div>
          </div>
        ) : (
          result
        )}
      </div>
      
      <div className="status">{status}</div>
    </div>
  );


  
}

export default RollerPage;