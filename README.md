# RelayDock

RelayDock is a local agent relay workspace for continuing tasks across Codex and
other model providers.

The project focuses on a problem that ordinary chat export cannot solve: when a
model quota runs out or a provider becomes unavailable, another agent should be
able to continue the same coding task with the relevant task state, tool history,
workspace changes, and acceptance criteria intact.

RelayDock is planned as:

- a Codex skill for checkpoint, handoff, and recovery workflows;
- a local bridge service for session storage and provider adaptation;
- a visual workspace for inspecting and controlling agent handoffs;
- a routing layer for connecting model providers such as DeepSeek.

## Documentation

- [Initial design](docs/initial-design.md)

## Project Status

RelayDock is currently in the design and prototyping stage. The repository starts
with the architecture and scope for the first implementation.

## Core Concepts

- **Session**: one task and its complete event history.
- **Checkpoint**: a recoverable snapshot of task state and workspace state.
- **Handoff**: a controlled transfer from one model provider to another.
- **Relay Packet**: the structured context sent to the receiving agent.
- **Route**: the policy that selects and falls back between providers.

## Design Principles

1. Preserve explicit task state instead of attempting to copy hidden model state.
2. Keep one canonical event history with provider-specific views.
3. Allow only one agent to hold the workspace write lease at a time.
4. Treat imported model output as untrusted content.
5. Keep credentials and provider secrets out of session transcripts.
6. Prefer reversible, auditable handoffs over opaque context copying.
