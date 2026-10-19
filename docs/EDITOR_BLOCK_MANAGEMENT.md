# Editor block management ownership

`TiptapNotebookEditor` mounts `TipTap/BlockManager/SimpleDragManager.tsx` around its editor.
This is the current application integration for dropped-file insertion. File uploads
use the shared notebook upload control and FileUploadClient. Changes to file insertion
must be evaluated against that mounted implementation and the editor's document transactions.

The directory previously also contained unmounted experimental block managers, an unused
hook/toolbar/indicator, and two unused extension files (one empty). None was imported from
outside that obsolete group. There is no glob-based registration of these modules. Those
implementations have been removed, including their duplicate event handlers, positioning,
node movement, and timer logic. The mounted component and its import path are unchanged.

This cleanup removes unused alternatives rather than selecting a new drag implementation.
It does not assert that the mounted component has completed its own architectural review.

The mounted wrapper no longer tracks hovered cells or schedules toolbar hiding: the toolbar
was not rendered, so those listeners and timers had no visible behavior. It subscribes only
to notebook identity. A mounted editor binding owns drop listeners, with layout cleanup on
replacement/unmount. Each drop captures an identity revision; synchronous notebook transitions
invalidate pending reads even when navigation returns to the same notebook before React renders.
Later drops can still be admitted. Markdown loading checks ownership after each asynchronous
boundary, and asset callbacks check it before inserting each item. Destroyed editors reject
publication. File-read failures are handled by the same drop error boundary as upload failures.

Already-inserted content is not rolled back, and local File.text promises are not abortable.
The existing upload control continues to own HTTP cancellation. This change does not replace
the existing Markdown parser or asset insertion format.
