# Image editing lifecycle

`ImageModel` owns SAVE admission while the image is in `editing`. It accepts a string
and checks that the current editor position still identifies the same image node
(type plus cell identity, or exact node identity when no cell ID exists).

Valid image Markdown updates image attributes and returns to `focused`. Plain text
replaces the inline image within its existing paragraph; an empty string removes it.
Successful replacement enters the registered `destroyed` terminal state, whose events
have no further effects. Missing positions, replaced owners, invalid payloads, or
rejected editor commands do not publish saved content.

The view supplies an `onSave` callback instead of updating notebook content before
the FSM validates the edit. The callback updates only an existing cell in the captured
notebook. The view uses the actual `ExtensionFSM<ImageContext>` contract, including
its nullable initial state, rather than a separately maintained interface.

Tests use a real TipTap editor with an inline image schema. They cover valid Markdown,
plain-text replacement, empty removal, paragraph preservation, terminal repeat events,
stale node identities, missing positions, and malformed payloads. The generic extension
FSM and other image operations (generation/upload/alignment) retain their existing
behavior; these tests do not exercise a live image backend.
