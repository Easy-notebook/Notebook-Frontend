import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import useStore from '@Store/notebookStore';

interface EditorCoverProps {
  editor: Editor | null;
}

const RANDOM_COVERS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Abstract
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Landscape
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Nature
];

export const EditorCover: React.FC<EditorCoverProps> = ({ editor }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showIconMenu, setShowIconMenu] = useState(false);

  // Read cover and icon from notebookStore (first cell metadata)
  const cells = useStore((state) => state.cells);
  const updateCellMetadata = useStore((state) => state.updateCellMetadata);

  const firstCell = cells.length > 0 ? cells[0] : null;
  const cover = firstCell?.metadata?.cover || null;
  const icon = firstCell?.metadata?.icon || null;

  const changeCover = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || !firstCell) return;

    let newCover = cover;
    while (newCover === cover) {
      newCover = RANDOM_COVERS[Math.floor(Math.random() * RANDOM_COVERS.length)];
    }

    // Update both notebookStore metadata and editor node
    updateCellMetadata(firstCell.id, {
      ...firstCell.metadata,
      cover: newCover,
    });

    // Also update the title node in editor
    editor
      .chain()
      .command(({ tr }) => {
        const firstNode = tr.doc.firstChild;
        if (firstNode && firstNode.type.name === 'title') {
          tr.setNodeMarkup(0, undefined, { ...firstNode.attrs, cover: newCover });
          return true;
        }
        return false;
      })
      .run();
  };

  const removeCover = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || !firstCell) return;

    // Update both notebookStore metadata and editor node
    updateCellMetadata(firstCell.id, {
      ...firstCell.metadata,
      cover: null,
    });

    // Also update the title node in editor
    editor
      .chain()
      .command(({ tr }) => {
        const firstNode = tr.doc.firstChild;
        if (firstNode && firstNode.type.name === 'title') {
          tr.setNodeMarkup(0, undefined, { ...firstNode.attrs, cover: null });
          return true;
        }
        return false;
      })
      .run();
  };

  const changeIcon = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || !firstCell) return;

    const emojis = ['😀', '🚀', '📝', '💡', '✨', '🎨', '📚', '💻'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    // Update both notebookStore metadata and editor node
    updateCellMetadata(firstCell.id, {
      ...firstCell.metadata,
      icon: randomEmoji,
    });

    // Also update the title node in editor
    editor
      .chain()
      .command(({ tr }) => {
        const firstNode = tr.doc.firstChild;
        if (firstNode && firstNode.type.name === 'title') {
          tr.setNodeMarkup(0, undefined, { ...firstNode.attrs, icon: randomEmoji });
          return true;
        }
        return false;
      })
      .run();
  };

  const removeIcon = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editor || !firstCell) return;

    // Update both notebookStore metadata and editor node
    updateCellMetadata(firstCell.id, {
      ...firstCell.metadata,
      icon: null,
    });

    // Also update the title node in editor
    editor
      .chain()
      .command(({ tr }) => {
        const firstNode = tr.doc.firstChild;
        if (firstNode && firstNode.type.name === 'title') {
          tr.setNodeMarkup(0, undefined, { ...firstNode.attrs, icon: null });
          return true;
        }
        return false;
      })
      .run();
  };

  if (!cover && !icon) return null;

  return (
    <div
      className="relative w-full group shrink-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {cover && (
        <div
          className="relative w-full h-72 overflow-hidden"
          style={{
            borderRadius: '18px 18px 0 0',
          }}
        >
          <img src={cover} alt="Cover" className="w-full h-full object-cover select-none" />

          {/* Cover Controls */}
          <div
            className={`absolute bottom-4 right-10 flex gap-2 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          >
            <button
              onClick={changeCover}
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white/90 hover:bg-white text-gray-700 rounded shadow-sm backdrop-blur-sm transition-colors"
              type="button"
            >
              Change Cover
            </button>
            <button
              onClick={removeCover}
              onMouseDown={(e) => e.preventDefault()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white/90 hover:bg-white text-red-600 rounded shadow-sm backdrop-blur-sm transition-colors"
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Icon Area - Overlapping */}
      {icon && (
        <div className="w-full max-w-screen-lg mx-auto px-8 lg:px-18 pointer-events-none">
          <div className="pl-4">
            <div
              className={`editor-cover-icon relative -mt-10 mb-0 flex items-center text-7xl bg-transparent z-10 group/icon w-fit pointer-events-auto`}
            >
              <div
                className="hover:bg-gray-100 rounded-md p-1 cursor-pointer transition-colors relative leading-none"
                onClick={() => setShowIconMenu(!showIconMenu)}
              >
                {icon}

                {/* Icon Controls */}
                {showIconMenu && (
                  <div
                    className="absolute top-full left-0 mt-1 flex flex-col gap-1 bg-white rounded shadow-lg p-1 z-20 min-w-[100px]"
                    style={{ fontSize: '14px' }}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        changeIcon();
                        setShowIconMenu(false);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-50 rounded text-left whitespace-nowrap"
                      type="button"
                    >
                      Change
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeIcon();
                        setShowIconMenu(false);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center gap-2 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded text-left whitespace-nowrap"
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
