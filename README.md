# companion-module-nevion-videoipath

Control the **Nevion VideoIPath** media orchestration platform. Route sources to destinations, monitor connections, and get feedback on active routes.

## Features

- **Route control** — Connect sources to destinations with configurable conflict handling
- **Connection feedback** — Visual feedback for active routes and connection status
- **Variables** — Expose sources and destinations labels, and active connectionss as variables
- **Port type filtering** — Enable/disable endpoints by type (Video/Audio, GPIO, Tally, Group, Junction)

## Configuration

- **Host** — VideoIPath server address (e.g. `videoipath.example.com`)
- **Port** — HTTPS port (default: 443)
- **Username / Password** — API credentials
- **Poll interval** — State refresh rate (1–30 seconds)

See [HELP.md](./companion/HELP.md) for detailed usage.

## Getting Started

1. Add the module
2. Configure host, port, username, and password
3. Map actions and feedbacks to your buttons

## Development

```bash
# Install dependencies
yarn

# Build once (required to load the module)
yarn build

# Watch mode — recompile on change while developing
yarn dev
```

## License

MIT — see [LICENSE](./LICENSE)
