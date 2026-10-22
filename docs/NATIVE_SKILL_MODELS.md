# Import housing models from a frozen skill lock

In the housing study panel, use **冻结分群模型文件** to upload either a standalone
model (`.json` or `.aalkm`) or an exported skill resource lock JSON. For a lock,
choose the desired entry under **技能包中的房屋模型**, then supply the new-sample CSV
and select **使用导入模型分群**. The same chosen model also feeds the existing reference
comparison panel. No model is selected automatically when a lock contains entries.

The updated local Rust notebook server must expose
`POST /api/workspaces/{id}/model-file/skill-lock`. The browser sends `{ lock }` and
receives notebook-bound entries containing skill, origin source/location, content
hash, package-relative resource path and decoded numerical model. It does not read
paths on the server, execute SKILL.md instructions, install skills, or grant model
tools. This is numerical data import; the separate CLI `--segment-resource` grant
for model-selected tools is not made available through this form.

Rust validates the entire skill lock, including accepted package content hashes,
before decoding binary housing resources using the existing AALKM codec. Binary
resources are recognized by AALKM magic or an `.aalkm` suffix. A selected model needs
no original source directory or remote provider after the lock has been produced.
The displayed hash identifies content; it is not independent proof of a human
reviewer's identity or an external signature.

The web request limit is 5 MiB (including its JSON envelope); at most 64 models are
returned. Standalone JSON models remain limited to 128 KiB and binary models to
32 KiB. An invalid lock or invalid recognized binary model fails the import instead
of silently returning partially validated entries. The browser validates notebook
identity and numerical response shape, and ignores late responses after another
file is chosen. Assignment uses the existing workspace/revision checks and does
not replace the current study or migrate FoKn declarations.

Validation: frontend component/client tests cover explicit selection, transfer to
native assignment, stale-response cancellation and wrong-notebook responses. The
Rust HTTP integration test deletes the original package directory, imports the
lock, compares actual assignments with native model outputs, verifies the study
stays unchanged, and rejects tampered resources. A Chromium end-to-end run now also passes; details and reproduction follow.


## Chromium end-to-end evidence

`tests/browser/native-skill-model.spec.js` passed on 2026-10-23 (15.5 s test,
17.7 s total). It uses the actual Vite page, Rust server and native assignment CLI.
The page fits and exports a binary model; the real skills CLI packs, unpacks and
accepts a synthetic test package. Its review record is explicitly labeled an
automated fixture, not independent human review. The test deletes the source
package directory, stops and restarts the server, uploads the resulting lock and
requires explicit resource selection. All three native assignments exactly match
the offline CLI, feature explanations render, tampered content disables assignment
and clears prior results, and the browser reports no page script errors.

Reproduce with newly built binaries and an available loopback port:

```sh
AAL_NATIVE_SERVER=/absolute/path/to/aal-notebook-server \
AAL_NATIVE_ASSIGN=/absolute/path/to/aal-notebook-assign \
AAL_SKILLS_CLI=/absolute/path/to/aal-skills \
AAL_NOTEBOOK_TARGET=http://127.0.0.1:18879 \
npx playwright test tests/browser/native-skill-model.spec.js
```

The harness owns a disposable native state directory and stops its server on
completion. No remote model or online EasyNet service is used. This test covers
frozen numerical-resource import, not LLM-selected tool grants or all notebook UI
behavior. Run log: `/tmp/aal-skill-browser.log`.

## Workspace ownership of imported inputs

The import session is keyed by both frontend notebook ID and native workspace ID.
Changing either replaces the complete import session: model/file selection, package
entries, query CSV, reference CSV/identity, numerical results and pending reads.
This prevents the previous workspace's locally loaded data from becoming the new
workspace's default input. The nested reference-comparison form shares this lifetime.
A revision change within the same workspace retains input drafts while invalidating
results through the existing scoped-read lifecycle.

The ownership regression was reproduced in both notebook-switch and workspace-switch
cases before the fix. The 2026-10-23 component run passed 18 tests across
`ImportedModel.test.tsx` and `HousingStudyPanel.test.tsx`, including cancellation of
an in-flight package inspection whose late response cannot populate the new session.
ESLint passed for the two changed component/test files. This check does not extend
the earlier Chromium coverage or add a Web grant for LLM-selected imported tools.
