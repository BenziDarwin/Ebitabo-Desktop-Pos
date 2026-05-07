# Ebitabo POS Desktop + Web

Next.js 16 app wrapped with Electron.

The web app is built as a static export (`out/`), and the Electron desktop app serves that build through a local bridge server in production.

## Requirements

- Node.js 20+
- npm

## Install

```bash
npm install
```

## Scripts

- `npm run dev`: run Next.js dev server (web only).
- `npm run dev:web`: run Next.js dev server on fixed `localhost:3000`.
- `npm run dev:electron`: launch Electron in development mode.
- `npm run electron:dev`: run web + Electron together (recommended for desktop development).
- `npm run build`: production Next.js build (generates static export in `out/`).
- `npm run dist`: package desktop app for current platform.
- `npm run dist:win`: package Windows installer.
- `npm run dist:linux`: package Linux build.
- `npm run lint`: run ESLint.

## Desktop Development Flow

Use:

```bash
npm run electron:dev
```

Behavior:

- Next dev server is forced to `localhost:3000`.
- Electron waits for TCP port `3000`.
- If port `3000` is already in use, startup fails fast and clearly.
- If another `next dev` instance is already running for this repo, Next.js 16 lockfile behavior will block a duplicate instance.

## Production Desktop Runtime

In production, Electron does not load `file://.../out/index.html` directly.

It starts a local desktop bridge (`electron/desktop-bridge.js`) that:

- serves static files from `out/`,
- forwards `/api` and `/api/*` to a backend target when configured,
- returns `503` for `/api/*` when no proxy target is configured.

## API Proxy Configuration (Packaged App)

Set `EBITABO_API_PROXY_TARGET` to your backend URL:

PowerShell:

```powershell
$env:EBITABO_API_PROXY_TARGET="https://api.example.com"
```

CMD:

```cmd
set EBITABO_API_PROXY_TARGET=https://api.example.com
```

Bash:

```bash
export EBITABO_API_PROXY_TARGET=https://api.example.com
```

Then start/package the app.

## Build And Share

For Windows:

```bash
npm run dist:win
```

For Linux:

```bash
npm run dist:linux
```

Share the generated installer/artifacts from the `dist/` directory with users.

## Next.js / Static Export Notes

- `next.config.ts` uses `output: "export"` for desktop packaging.
- `assetPrefix` is `./` in production so static assets resolve correctly in packaged desktop builds.
- `turbopack.root` is set to project root to avoid wrong parent-root inference warnings.
- `images.unoptimized` is enabled for static export compatibility.

## Troubleshooting

### `npm run dev` shows `Can't resolve 'tailwindcss' in C:\Users\...\Desktop\Code`

This usually means resolution is happening from a parent folder context. Use commands from this project root and ensure dependencies are installed:

```bash
npm install
```

### Desktop build opens but has no CSS / broken design

Use the local bridge runtime (already implemented in `electron/main.js`) and ensure the app is built before packaging:

```bash
npm run build
npm run dist:win
```

### `electron-builder` winCodeSign symlink privilege error on Windows

If you see:

`Cannot create symbolic link : A required privilege is not held by the client`

Use one of:

- enable Windows Developer Mode, or
- run terminal as Administrator.

### Lint errors for `require()` in Electron files

`eslint.config.mjs` includes an override for `electron/**/*.js` and `pre-commit.js` to allow CommonJS `require()` usage in Node/Electron scripts.
