# Install the strata CLI

**Attaching needs no binary.** If your app (or `strata start`, the REPL, or
`strata mcp serve`) is already hosting the database, StrataDB connects to its
socket directly.

The `strata` binary is only needed to *start* a host for an unowned database,
or to run `strata doctor`. StrataDB finds it on `PATH`, or at the
machine-scoped `strata.binaryPath` setting.
