# Native storage integration tests

Run from the repository root:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Playwright starts an isolated Vite server on `127.0.0.1:4179` and loads a minimal
fixture importing production storage code. It does not launch the application UI
or connect to a user's browser profile. Each test has an isolated browser context;
the normal-restart test creates and removes its own temporary persistent profile.
Browser reports and results are ignored by Git.

Coverage:

- Committed data survives page reload/new provider construction.
- A native unique-key failure rolls back a multi-store transaction.
- Closing drains accepted writes and rejects new transaction admission.
- A blocked upgrade rejects, then succeeds after the blocking connection closes.
- The shared provider upgrades v2 records without clearing stores and add missing indexes.
- A conflicting unique index rolls back the upgrade and retains the original version/data.
- Split-cache clearing preserves unrelated notebooks and a subsequently admitted refresh.
- Both scoped and whole-cache clearing roll back all deletions on transaction failure.
- Notebook maintenance preserves concurrent counter increments and scopes statistics/retention correctly.
- Aborted counter adjustment and recomputation retain previous notebook statistics.
- File mutations atomically update notebook totals; failed commits roll back all related stores.
- Old plain payloads marked compressed remain readable and remote-reference queries avoid boolean IDB keys.
- Configuration patches preserve concurrent settings; initialization retains existing configuration.
- Activity retention deletes only expired records; aborted maintenance rolls back all writes.
- Retention preview/execution agree, remove all excess notebooks, and emergency cleanup retains recent notebooks.
- Access/file writes admitted before cleanup affect selection; overlapping cleanup does not double-count deletions.
- Notebook deletion cascades through tab/split caches; retention failure rolls back owned records and configuration.
- Autosaved local-only and unclassified historical documents survive both cleanup modes and page reload.
- Explicit document deletion remains available despite automatic retention protection.
- Usage snapshots distinguish logical file sizes from UTF-8 local/split payloads, identify orphan bytes,
  stay consistent during concurrent writes, and reject failed read transactions.
- Content budgets use local/split payload bytes, preserve remote-only caches under byte pressure,
  report protected over-budget content, and roll back failed quota cleanup.
- Snapshot/metadata saves derive file totals transactionally, preserve other files and access history,
  and roll back content/counters/retention promotion together on failure.
- File writes atomically establish missing notebook ownership and correct totals; failed saves
  leave no parent/child records, and orphan deletion does not resurrect notebooks.
- Acknowledged data survives a normal browser process restart.
- A real user gesture plus unsaved edits triggers the native beforeunload dialog;
  cancelling navigation allows saving, after which reload reads the saved notebook.

The last case requests reload through the page's location API: a cancelled navigation
has no successful load event for Playwright's `page.reload()` to await.

These tests do not establish power-loss/crash durability, browser back-forward cache
restoration, native Tauri close coordination, cross-window conflict resolution, or
Firefox/WebKit behavior. Vitest excludes this directory and continues running the
existing event-double/unit tests separately.

Runner configuration follows [Playwright web server documentation](https://playwright.dev/docs/test-webserver).
