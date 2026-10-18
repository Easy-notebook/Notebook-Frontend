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
- Both database entry points upgrade v2 records without clearing stores and add missing indexes.
- A conflicting unique index rolls back the upgrade and retains the original version/data.
- Split-cache clearing preserves unrelated notebooks and a subsequently admitted refresh.
- Both scoped and whole-cache clearing roll back all deletions on transaction failure.
- Notebook maintenance preserves concurrent counter increments and scopes statistics/retention correctly.
- Aborted counter adjustment and recomputation retain previous notebook statistics.
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
