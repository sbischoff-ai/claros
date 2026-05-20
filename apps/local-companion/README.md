# @claros/local-companion

Local filesystem companion for the web editor.

This is intentionally separate from `@claros/cli`. The planned `claros` CLI is for project inspection, scripting, macro execution, and checkpoint workflows; this package is only a localhost bridge for the web editor.

## Usage

```bash
pnpm --filter @claros/local-companion build
pnpm --filter @claros/local-companion start -- /path/to/project
```

By default it binds to `127.0.0.1:3000`, generates a per-run token, and prints a web URL with connection parameters. Local development origins for `localhost` and `127.0.0.1` on ports `5173` and `5174` are allowed automatically.

For a hosted web app, pass its origin:

```bash
pnpm --filter @claros/local-companion start -- /path/to/project --web https://claros.example.com --origin https://claros.example.com
```

The companion exposes only project/document APIs for the selected Claros project folder. It does not provide arbitrary filesystem access.
