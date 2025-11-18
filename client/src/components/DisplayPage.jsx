import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import HexRoller from "./HexRoller";
import "./DisplayPage.css";

function DisplayPage() {
  const [result, setResult] = useState("-");
  const [mode, setMode] = useState("mean");
  const [status, setStatus] = useState("Connecting...");
  const [triggerRoll, setTriggerRoll] = useState(0);

  const socketRef = useRef(null);

  const prettyName = {
    mean: "Mean",
    median: "Median",
    mode: "Mode",
  };

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || undefined;
    socketRef.current = io(socketUrl);
    const socket = socketRef.current;

    socket.on("connect", () => setStatus("Connected"));
    socket.on("disconnect", () => setStatus("Disconnected"));

    socket.on("rolls-update", (stats) => {
      setMode(stats.calcMode);
      setResult(stats.computedResult ?? "-");

      if (!stats.roundActive) {
        setStatus("Waiting for round...");
      } else {
        setStatus("Round Active");
      }
    });

    socket.on("reveal-result", () => {
      setTriggerRoll((x) => x + 1);
    });
    

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("rolls-update");
      socket.disconnect();
    };
  }, []);

  return (
    <div className="display-full">
      <HexRoller value={result} trigger={triggerRoll} />

      <div className="display-center">
        <div className="display-label">{prettyName[mode]} Result</div>
        <div className="display-status">{status}</div>
      </div>
    </div>
  );
}

export default DisplayPage;
