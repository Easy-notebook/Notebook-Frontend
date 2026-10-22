# Frozen housing clustering model export

After a current housing clustering run, the study panel offers **导出冻结分群模型**.
The download is `mining-model.json`, containing the native version, training row
count, selected feature names and frozen means/scales, and cluster centers.
The response parser retains feature parameters rather than projecting only names.
The browser exports the loaded snapshot without refitting or contacting the server.
Unsaved reference/configuration changes and pending dataset operations disable export.
Absent, stale or structurally incomplete models cannot be exported.

This is the native `mining::Model` format, consumed by Rust
`DataMining.assign(model, csv)` / `skill.segment_assign`. Rust owns numerical
validation. It is a clustering model, not a regression predictor. It contains no
individual reference rows and cannot on its own reproduce nearest-sample explanations.
A standalone model import UI and full skill archive download are not provided here.

Verification: `studyModel.test.ts` covers complete response parsing and export,
including means/scales and stale/missing/incomplete rejection.
`native-model-export.spec.js` runs the actual Rust server, performs a housing
clustering run, restarts server and browser page, shuts down the server, downloads
the model, and compares every field with the native result. Editing the reference
CSV then disables export. The existing study-session and panel suites also run.

## Native offline loading

The AAL Notebook binary `aal-notebook-assign MODEL_JSON QUERY_CSV STATE_DIR INVOCATION_ID`
loads the downloaded file, validates it in Rust and invokes `DataMining.assign`.
It writes `assignments.json` without requiring the training workspace or a model
provider. Use the same AAL checkout's `demos/notebook/Cargo.toml` to build the binary.

The browser test also passes the actual downloaded file to this binary after server
shutdown, assigns three new houses, and independently checks the nearest center
and squared distance from the exported scaling values. Run it with absolute
`AAL_NATIVE_SERVER` and `AAL_NATIVE_ASSIGN` binary paths and an explicit loopback
`AAL_NOTEBOOK_TARGET`; all three are required to avoid silently skipping native
loading. This closes browser-export/native-load interoperability; model import
inside the browser UI remains separate work.
