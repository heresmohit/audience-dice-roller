// client/src/components/DisplayPage.jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './DisplayPage.css';

function DisplayPage() {
  const [result, setResult] = useState('-');
  const [mode, setMode] = useState('mean');
  const [status, setStatus] = useState('Connecting...');

  const socketRef = useRef(null);

  const prettyName = {
    mean: "Mean",
    median: "Median",
    mode: "Mode"
  };

  useEffect(() => {
    socketRef.current = io();
    const socket = socketRef.current;

    socket.on('connect', () => {
      setStatus('Connected');
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
    });

    socket.on('rolls-update', (stats) => {
      setMode(stats.calcMode);
      setResult(stats.computedResult ?? '-');

      if (!stats.roundActive) {
        setStatus('Waiting for round...');
      } else {
        setStatus('Round Active');
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('rolls-update');
      socket.disconnect();
    };
  }, []);

  return (
    <div className="display-full">
      <div className="display-center">
        <div className="display-label">{prettyName[mode]} Result</div>
        <div className="display-result">{result}</div>
        <div className="display-status">{status}</div>
      </div>
    </div>
  );
}

export default DisplayPage;
