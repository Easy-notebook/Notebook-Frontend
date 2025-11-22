import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { Image as ImageIcon } from 'lucide-react';
import useStore from '@Store/notebookStore';

const RANDOM_COVERS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Abstract
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Landscape
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Nature
  'https://images.unsplash.com/photo-1501854140884-074cf2b21d25?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Mountain
];

export const TitleNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const [isHovered, setIsHovered] = useState(false);
  const cover = node.attrs.cover;
  const icon = node.attrs.icon;

  // Use refs to track previous values and prevent infinite loops
  const prevCoverRef = useRef<string | null>(null);
  const prevIconRef = useRef<string | null>(null);

  // Sync cover and icon to first cell's metadata whenever they change
  useEffect(() => {
    // Only update if values have actually changed
    if (prevCoverRef.current === cover && prevIconRef.current === icon) {
      return;
    }

    const { cells: currentCells, updateCellMetadata: updateMeta } = useStore.getState();

    if (currentCells.length > 0) {
      const firstCell = currentCells[0];
      const currentMetadata = firstCell.metadata || {};

      // Only update if values have changed from what's in metadata
      if (currentMetadata.cover !== cover || currentMetadata.icon !== icon) {
        updateMeta(firstCell.id, {
          ...currentMetadata,
          cover: cover || null,
          icon: icon || null,
        });
      }
    }

    // Update refs
    prevCoverRef.current = cover;
    prevIconRef.current = icon;
  }, [cover, icon]); // Only depend on cover and icon

  const addRandomCover = () => {
    const randomCover = RANDOM_COVERS[Math.floor(Math.random() * RANDOM_COVERS.length)];
    updateAttributes({ cover: randomCover });
  };

  const addRandomIcon = () => {
    const emojis = ['😀', '🚀', '📝', '💡', '✨', '🎨', '📚', '💻'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    updateAttributes({ icon: randomEmoji });
  };

  return (
    <NodeViewWrapper
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Controls (Visible when hovered/focused) */}
      {(!icon || !cover) && (
        <div
          className={`flex gap-2 mb-0 transition-opacity duration-200 ${isHovered || editor.isActive('title') ? 'opacity-100' : 'opacity-0'}`}
        >
          {!icon && (
            <button
              onClick={addRandomIcon}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <span className="text-base">☺</span>
              Add Icon
            </button>
          )}
          {!cover && (
            <button
              onClick={addRandomCover}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <ImageIcon size={14} />
              Add Cover
            </button>
          )}
        </div>
      )}

      {/* Title Content */}
      <NodeViewContent
        as="h1"
        className={`node-title-content !text-[40px] !font-bold !leading-[1.2] outline-none placeholder:text-gray-300 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300 empty:before:float-left empty:before:h-0 empty:before:pointer-events-none`}
        data-placeholder="Untitled"
      />
    </NodeViewWrapper>
  );
};
