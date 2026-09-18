import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { Image as ImageIcon } from 'lucide-react';
import useStore from '@Store/notebookStore';
import { useTranslation } from 'react-i18next';

const RANDOM_COVERS = [
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Landscape
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80', // Nature
];

export const TitleNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
  const [isHovered, setIsHovered] = useState(false);
  const cover = node.attrs.cover;
  const icon = node.attrs.icon;
  const cells = useStore((state) => state.cells);
  const updateCellMetadata = useStore((state) => state.updateCellMetadata);

  // Use refs to track previous values and prevent infinite loops
  const prevCoverRef = useRef<string | null>(null);
  const prevIconRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  // Load cover and icon from first cell metadata on mount
  useEffect(() => {
    if (!isInitializedRef.current && cells.length > 0) {
      const firstCell = cells[0];
      const metadata = firstCell.metadata || {};

      if (metadata.cover || metadata.icon) {
        // Load from metadata if available
        const newAttrs: { cover?: string; icon?: string } = {};
        if (metadata.cover && !cover) newAttrs.cover = metadata.cover;
        if (metadata.icon && !icon) newAttrs.icon = metadata.icon;

        if (Object.keys(newAttrs).length > 0) {
          updateAttributes(newAttrs);
        }
      }

      isInitializedRef.current = true;
    }
  }, [cells, cover, icon, updateAttributes]);

  // Sync cover and icon to first cell's metadata whenever they change
  useEffect(() => {
    // Only update if values have actually changed
    if (prevCoverRef.current === cover && prevIconRef.current === icon) {
      return;
    }

    if (cells.length > 0) {
      const firstCell = cells[0];
      const currentMetadata = firstCell.metadata || {};

      // Only update if values have changed from what's in metadata
      if (currentMetadata.cover !== cover || currentMetadata.icon !== icon) {
        updateCellMetadata(firstCell.id, {
          ...currentMetadata,
          cover: cover || null,
          icon: icon || null,
        });
      }
    }

    // Update refs
    prevCoverRef.current = cover;
    prevIconRef.current = icon;
  }, [cover, icon, cells, updateCellMetadata]); // Include cells to detect changes

  const addRandomCover = () => {
    const randomCover = RANDOM_COVERS[Math.floor(Math.random() * RANDOM_COVERS.length)];
    updateAttributes({ cover: randomCover });
  };

  const addRandomIcon = () => {
    const emojis = ['😀', '🚀', '📝', '💡', '✨', '🎨', '📚', '💻'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    updateAttributes({ icon: randomEmoji });
  };

  const { t } = useTranslation();
  const isDefaultTitle = node.textContent.trim() === t('common.untitled');

  return (
    <NodeViewWrapper
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Controls (Visible when hovered/focused) - Only show if at least one is missing */}
      {(!icon || !cover) && (
        <div
          className={`flex gap-2 mb-2 transition-opacity duration-200 ${isHovered || editor.isActive('title') ? 'opacity-100' : 'opacity-0'}`}
        >
          {!icon && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addRandomIcon();
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              type="button"
            >
              <span className="text-base">☺</span>
              Add Icon
            </button>
          )}
          {!cover && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addRandomCover();
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              type="button"
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
        className={`node-title-content !text-[40px] !font-bold !leading-[1.2] outline-none ${isDefaultTitle ? '!text-gray-400 dark:!text-gray-500' : ''}`}
      />
    </NodeViewWrapper>
  );
};
