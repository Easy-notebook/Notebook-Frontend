---
name: notebook-organization
description: Organize a live notebook through versioned document tools, preserving original evidence and creating immutable disk backups and result files.
---

Runtime instructions are defined in index.ts and injected by instructionsForRole into both model Hosts. Tool input schemas are authoritative in src/services/agent-cell/documentProtocol.ts.

Use read_notebook (follow nextOffset), read_cell, backup_notebook, apply_notebook_edits, flush_notebook and save_notebook_copy in that order. list_notebook_files/read_notebook_file inspect managed files. Back up before editing, preserve imported source metadata and tool outputs, and verify the saved result. A stale version requires a new read and backup; do not repeat an already applied edit after a persistence failure.

The optional AAL standard-library package aal.codex owns CodexAgent.run and its generic codex skill. Notebook supplies this notebook-organization workflow through the model Host. This skill is a document workflow supplied to that Host; it is not a claim that the model independently executes AAL or has arbitrary filesystem access.
