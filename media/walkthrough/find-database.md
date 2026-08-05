# Find or add a database

StrataDB discovers databases in your workspace by their layout (a
`manifest/current` file inside the database directory). Databases outside the
workspace can be added explicitly with the `strata.databases` setting.

Every database shows its attachment state in the explorer — live, unowned,
owned-but-unreachable, or a layout that needs attention — with an action to
take next.
