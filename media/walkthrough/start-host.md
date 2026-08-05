# Start a database host

An unowned database (no process is serving it) offers **Start Database Host**.
StrataDB spawns `strata start`, which takes ownership and opens a socket —
your app, the CLI, and this extension can all attach to it concurrently.

Hosts started here are tied to this workspace session and stopped when the
window closes. In untrusted workspaces StrataDB is attach-only and never
starts processes.
