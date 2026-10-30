# Blockers and constraints

## Active implementation blocker
- **FOUNDATION-002 runtime verification:** `docker compose config --quiet` passes, but Docker commands cannot connect to `unix:///Users/newuser/.docker/run/docker.sock`; the Docker daemon is not running. The Compose files cannot be marked complete until all service health checks are confirmed. Start the configured Docker engine and run the exact commands in `docs/progress/next-session.md`.

## Active planning constraints
- **REA CDP unavailable:** `list_browser_targets` to `127.0.0.1:9222` returned endpoint unreachable. This blocks REA live DOM/screenshot/network evidence. Public official pages and visible browser homepage provided fallback; no Chrome reconfiguration was done.
- **Owner decisions pending:** product segment/name, inventory policies, auth, tax/localization, deployment/data residency and pricing are required before dependent domain behavior.
- **Interview evidence deferred:** the protocol is ready, but 5–8 interviews across at least two segments have not occurred. Owner directed phase closure and deferred these interviews to pilot validation; no participant findings are claimed.
