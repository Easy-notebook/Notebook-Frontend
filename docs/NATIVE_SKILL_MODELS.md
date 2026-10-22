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
stays unchanged, and rejects tampered resources. These are separate component and
HTTP tests; a full browser end-to-end run for lock import has not yet been recorded.
