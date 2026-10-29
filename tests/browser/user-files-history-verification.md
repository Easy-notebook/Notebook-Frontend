# User files and version history boundary

Workspace: 9977eedf-8bfb-44bc-83b3-95af250eb3e6.

Verified through the actual browser and native AAL endpoint:
- No system-generated Originals, Backups or Data folders in the working file catalog.
- Version history lists the original snapshot and existing import backup independently.
- Original preview reads all pages at one revision; restore creates a separate .easynb working file.
- Restored content exactly equals the original, 675928 UTF-8 bytes. Current notebook was not replaced.
- A genuine working folder called Backups accepts import, rename and move; its name has no reserved storage meaning.
- The user imported AmesHousing.csv into that working folder. It and its directory were preserved during cleanup; only the unchanged verification text and restored copy were removed.

Known file import boundary: native working resources currently hold UTF-8 text up to 2 MiB per file. Existing dataset APIs are independent and are not represented as filesystem partitions.
