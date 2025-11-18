import { useEffect, useRef } from "react";
import "./HexRoller.css";

export default function HexRoller({ value, trigger }) {
  const svgRef = useRef(null);
  const textRef = useRef(null);
  const centerHexRef = useRef(null);

  const size = 40;
  const h = size * 2;
  const w = Math.sqrt(3) * size;
  const v = h * 0.75;

  let offX = 0;
  let offY = 0;
  let anim = null;

  const pm = (n, m) => ((n % m) + m) % m;

  const hexPoints = (cx, cy) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
    }
    return pts.join(" ");
  };

  useEffect(() => {
    drawGrid();
    window.addEventListener("resize", drawGrid);
    return () => window.removeEventListener("resize", drawGrid);
  }, []);

  function drawGrid() {
    const svg = svgRef.current;
    const txt = textRef.current;
    if (!svg || !txt) return;

    svg.innerHTML = `
      <defs>
        <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff77aa"/>
          <stop offset="100%" stop-color="#d777ff"/>
        </linearGradient>
      </defs>
      <g id="hexLayer"></g>
    `;

    const layer = svg.querySelector("#hexLayer");

    let best = null;

    const cols = Math.ceil(window.innerWidth / w) + 6;
    const rows = Math.ceil(window.innerHeight / v) + 6;

    for (let r = -3; r < rows - 3; r++) {
      for (let c = -3; c < cols - 3; c++) {
        const x = c * w + (r % 2) * (w / 2) + offX;
        const y = r * v + offY;

        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", hexPoints(x, y));
        poly.classList.add("hexagon");
        layer.appendChild(poly);

        const d = Math.hypot(x - window.innerWidth / 2, y - window.innerHeight / 2);
        if (!best || d < best.d) best = { d, poly, x, y };
      }
    }

    if (best) {
      best.poly.id = "centerHex";
      centerHexRef.current = best.poly;

      txt.setAttribute("x", best.x);
      txt.setAttribute("y", best.y + 2);
    }

    svg.appendChild(txt); // keep text on top
  }

  // Run animation when host reveals
  useEffect(() => {
    if (value === "-" || value === null) return;

    const svg = svgRef.current;
    const txt = textRef.current;
    const centerHex = centerHexRef.current;
    if (!svg || !txt || !centerHex) return;

    txt.classList.remove("result");
    txt.classList.add("roll-anim");
    txt.textContent = "";

    offX = offY = 0;

    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: -1 }, { x: -1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }
    ];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    anim = setInterval(() => {
      offX = pm(offX + dir.x * 22, w);
      offY = pm(offY + dir.y * 22, v);
      drawGrid();
    }, 50);

    svg.style.transition = "transform 2s ease";
    svg.style.transform = "scale(1.8)";

    setTimeout(() => {
      clearInterval(anim);
      txt.classList.remove("roll-anim");

      centerHex.classList.add("flip");
      txt.textContent = value;
      txt.classList.add("result");

      setTimeout(() => centerHex.classList.remove("flip"), 700);

      setTimeout(() => {
        svg.style.transform = "scale(1)";
      }, 5000);
    }, 2000);
  }, [trigger]);

  return (
    <svg id="hexGrid" ref={svgRef}>
      <text id="centerText" ref={textRef}>Roll</text>
    </svg>
  );
}
