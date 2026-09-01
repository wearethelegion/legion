# Agent Workspace runner

The desktop runner is disabled by default. Enable it only after compatible
backend and web versions have been deployed:

```text
LEGION_AGENT_WORKSPACE_ENABLED=true
```

Each runner must explicitly advertise the execution it can safely provide.
Comma-separated values are exact identifiers, not descriptive labels:

```text
LEGION_RUNNER_PROVIDERS=ollama
LEGION_RUNNER_MODELS=llama3.3:70b
LEGION_RUNNER_POOLS=sovereign-ua
LEGION_RUNNER_RESIDENCIES=ua
LEGION_RUNNER_LOCAL=true
LEGION_RUNNER_NETWORK_ISOLATED=true
LEGION_RUNNER_NETWORK_ISOLATION_ATTESTED=true
```

The backend leases a run only when its immutable execution profile matches the
runner runtime, provider, exact model, pool, locality and residency. An empty
provider, model or residency list does not act as a wildcard. The `local` and
`network isolated` claims are operator attestations. A runner advertises network
isolation only when both isolation variables are true; production packaging
must set them only for hosts whose deployment and egress controls satisfy the
organization policy.

`LEGION_PROJECT_PATHS` maps project IDs to operator-approved local workspace
roots. Business requests never provide filesystem paths.

The runner starts one job at a time by default. Operators may set
`LEGION_RUNNER_CONCURRENCY` after validating host capacity. Application-factory
runs always execute in a dedicated Git worktree and persist a
`legion/application-<run-id>` delivery branch. Legion commits that branch only
after the manifest's exact build and test commands both succeed; the mapped
checkout is never edited by the application run.
