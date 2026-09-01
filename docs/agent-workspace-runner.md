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
```

The backend leases a run only when its immutable execution profile matches the
runner runtime, provider, exact model, pool, locality and residency. An empty
provider, model or residency list does not act as a wildcard. The `local` and
`network isolated` claims are operator attestations; production packaging must
set them only for hosts whose deployment and egress controls satisfy the
organization policy.

`LEGION_PROJECT_PATHS` maps project IDs to operator-approved local workspace
roots. Business requests never provide filesystem paths.
