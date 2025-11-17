# Deploying Audience Dice Roller (Render + Local)

This project contains a Vite React client in `client/` and an Express + socket.io server in `server/`.

## Local development (fast HMR)

Open two terminals:

Terminal A: client (Vite dev server)

```bash
cd client
npm install
npm run dev
```

Terminal B: server (socket server)

```bash
cd server
npm install
npm run dev
```

Notes:
- The client will run on Vite's port (default `:5173`) and the server on `:3000`.
- The client now reads `import.meta.env.VITE_SOCKET_URL` when present; in development it will fall back to connecting to the same origin unless you set `VITE_SOCKET_URL`.

## Production (Render)

Render will build the client and run the server. The server is configured to serve the built client from `client/dist` when `NODE_ENV=production`.

Recommended Render service settings (single Web Service):

- Environment: `Node`
- Branch: your branch (e.g. `main`)
- Build Command:

```bash
npm --prefix client install && npm --prefix client run build && npm --prefix server install
```

- Start Command:

```bash
npm --prefix server start
```

Render will provide the `PORT` environment variable; the server uses `process.env.PORT`.

Optional: If you want to point the client to a specific socket URL in production, set `VITE_SOCKET_URL` in Render environment variables to `https://your-app.onrender.com` (or omit it to use the same origin).

## Quick checklist before deploying

- Ensure `client/package.json` has a `build` script (Vite default: `vite build`).
- Ensure `server/package.json` includes the `start` script (`NODE_ENV=production node server.js`).
- Commit and push your repo to GitHub, then connect the repo on Render.

## Troubleshooting

- If socket connections fail in production, check that the app URL in `VITE_SOCKET_URL` (if set) matches the site and that WebSockets are allowed by your host.
- To debug on Render, enable logs and try the manual build commands locally to replicate the environment.
