# Editor block management ownership

`TiptapNotebookEditor` mounts `TipTap/BlockManager/SimpleDragManager.tsx` around its editor.
This is the current application integration for block controls and file insertion. File uploads
use the shared notebook upload control and FileUploadClient. Changes to block interactions
must be evaluated against that mounted implementation and the editor's document transactions.

The directory previously also contained unmounted experimental block managers, an unused
hook/toolbar/indicator, and two unused extension files (one empty). None was imported from
outside that obsolete group. There is no glob-based registration of these modules. Those
implementations have been removed, including their duplicate event handlers, positioning,
node movement, and timer logic. The mounted component and its import path are unchanged.

This cleanup removes unused alternatives rather than selecting a new drag implementation.
It does not assert that the mounted component has completed its own architectural review.
