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

## Inspect the imported skill's tool bindings

Selecting a `house-feature-review` entry now exposes **检查技能工具绑定**. This sends
an explicit preview request to the native server built with `web,model`; no provider
configuration is needed. The default preview covers CSV profiling and frozen-model
assignment only when the skill declares those tools. To include observed-sample
comparison, select **包含参考样本比较工具** and enter the package-relative reference CSV
path and the original reference identity. The Rust service verifies the reference
against the selected model before returning the effective tools.

Inspection is opt-in and read-only. The UI shows checked bindings and compiled
content identity, never an execution authorization. Changes to the selected resources,
reference or workspace revision invalidate the preview; stale responses cannot restore
it. The client also rejects a mismatched selection/workspace or a response claiming
execution authorization. No new model call, fitting, FoKn migration or durable grant
occurs. The explicit authorization and execution flow is described below.

Preview validation on 2026-10-23: 14 frontend component tests and changed-source ESLint
passed. The extended Chromium test passed (17.0 s test, 19.3 s total), including the
actual Rust preview endpoint after source deletion/server restart, followed by native
assignment and tamper rejection. Log: `/tmp/aal-skill-preview-browser.log`. Full-project
TypeScript checking still reports errors in other modules; the final check has no
diagnostics in the changed preview/import/transport files. Log:
`/tmp/aal-skill-preview-typecheck-final.log`. This is not a claim that the entire
frontend repository passes type checking or that skill execution is authorized.


## Approve, execute and recover the exact imported call

With a model-enabled Rust server, **保存本次技能调用供审批** freezes the selected
lock, resource bindings, CSV, workspace revision and a single invocation ID before
requesting approval. The server-checked preview is shown with separate approval,
denial and execution buttons. Inspection, preparation and approval do not call the
model. Execution uses the native kernel and only the checked skill tools; output
is displayed separately and is not automatically published as FoKn evidence.

The session persists before each remote operation. If a response is lost, use
**恢复本次操作（复用原调用）** to resend the same stage with the same frozen input and
ID. Reload does not automatically dispatch. Server-side completed execution replay
can return the stored result after server restart even with the provider offline.
Pending or unknown calls cannot be discarded to silently create a replacement ID.
Completed or denied local records can be explicitly cleared.

Retention uses `sessionStorage`, scoped by frontend notebook and native workspace:
it supports reload in the same tab, not recovery after closing that tab. Storage
failure prevents a new dispatch; invalid stored records remain blocked and retained.
After a workspace revision change, an unresolved execution offers **取回原调用结果**.
It sends the original frozen input and invocation; the Rust service returns only an
exact completed result and rejects unfinished old-revision work. Approval and first
execution remain disabled for stale calls. Results display their input revision and
are labeled historical when it differs from the current revision; they do not
replace the new study input. This flow adds no global model-spend budget and
requires the existing server model configuration. CSV is limited to 32 KiB.

Validation on 2026-10-23: 30 session/component tests passed, including lost approval
and execution replies, completion-storage failure, immutable input, scope rejection,
denial and corrupt storage. Full-project TypeScript checking still fails in unrelated
modules; the changed native-study and transport files have no diagnostics in
`/tmp/aal-skill-execution-types-verified.log`. This is not a repository-wide type-check
pass. The browser test now exercises approval, actual native tool output, deliberately
lost execution response and exact replay after a server restart with the local fixture
provider offline. No paid model calls or online EasyNet calls are part of these tests.

Final Chromium run: **1 passed**, 27.4 s test / 29.5 s total; log
`/tmp/aal-skill-execution-browser-clean.log`. Earlier runs intermittently lost the
research dialog during notebook initialization; the test now waits for the loaded
notebook heading before opening it. No general dialog lifecycle fix is claimed.
Changed-source ESLint and `git diff --check` passed.

## Historical completion after a study edit (2026-10-23)

The Chromium scenario now advances the reference input after deliberately losing a
completed review response, stops the model fixture, restarts Rust, reloads the page
and explicitly recovers the original result. The UI retains the new reference CSV,
labels the result historical, and the provider request count stays at two. This uses
the Rust completed-result lookup added in AAL commit `4a2739c`; it does not permit
resuming unfinished stale work or recover storage after closing the browser tab.

Validation: 23 session/component tests, scoped ESLint and diff checks passed. Chromium:
1 passed, 35.6 s test / 39.1 s total (`/tmp/aal-historical-ui-browser.log`). No paid
model requests or online EasyNet validation. Full repository type checking is not
claimed by these scoped checks.
