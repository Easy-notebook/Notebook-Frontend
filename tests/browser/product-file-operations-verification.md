# Product file operations — 2026-10-29

Workspace: 9977eedf-8bfb-44bc-83b3-95af250eb3e6, localhost:4186.

Verified in browser using actual menus and native AAL server:
1. Create an empty folder; it persists and appears without manually refreshing.
2. Right-click folder → create 草稿.md inside it.
3. Right-click file → rename 整理笔记.md.
4. Move file to product workspace root using folder picker; empty source folder stays.
5. Rename empty folder; new path appears automatically.
6. Right-click Originals: create/rename/move disabled. Primary notebook: rename/move/delete disabled.
7. Refresh five times: row positions, selected state and expanded state are identical.
8. Cleanup only the two unchanged zero-byte test entries via AAL compare-and-swap removal.

No source or notebook content was modified by these file operations. Screenshot shows the product root and permission-aware menu. Dark theme was already selected in the browser.
