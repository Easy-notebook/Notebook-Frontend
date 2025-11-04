import React from 'react';
import TiptapNotebookEditor from '../../Editor/TiptapNotebookEditor.js';
import JupyterNotebookEditor from '../../Editor/JupyterNotebookEditor.js';
import { useSettings } from '../../../store/settingsStore.js';

interface CreateModeProps {
  className?: string;
  readOnly?: boolean;
}

/**
 * CreateMode component renders the notebook editor in "create" mode.
 * It decides which underlying editor (Tiptap or Jupyter-style) to show
 * based on the user's editor settings stored in the global settings store.
 */
const CreateMode: React.FC<CreateModeProps> = ({ 
  className = "",
  readOnly = false 
}) => {
  const settings = useSettings();
  
  // Determine which editor to render based on the current settings.
  const editorType = settings.editorSettings?.editorType || 'tiptap';
  
  if (editorType === 'tiptap') {
    // Render Tiptap-based notebook editor
    return (
      <div className={`w-full h-full flex flex-col ${className}`}>
        <div className="flex-1 w-full max-w-screen-lg mx-auto px-8 lg:px-18 flex flex-col">
          <div className="h-10 w-full flex-shrink-0"></div>
          <div className="relative flex-1 flex flex-col" style={{ minHeight: '500px' }}>
            <TiptapNotebookEditor
              className="w-full h-full"
              placeholder="Untitled"
              readOnly={readOnly}
            />
          </div>
          <div className="h-20 w-full flex-shrink-0"></div>
        </div>
      </div>
    );
  } else {
    // Render Jupyter-style notebook editor
    return (
      <div className={`w-full h-full flex flex-col ${className}`}>
        <div className="flex-1 w-full max-w-screen-lg mx-auto px-8 lg:px-18 flex flex-col">
          <div className="h-10 w-full flex-shrink-0"></div>
          <div className="relative flex-1 flex flex-col" style={{ minHeight: '500px' }}>
            <JupyterNotebookEditor
              className="w-full h-full"
              placeholder="Untitled"
              readOnly={readOnly}
            />
          </div>
          <div className="h-20 w-full flex-shrink-0"></div>
        </div>
      </div>
    );
  }
};

CreateMode.displayName = 'CreateMode';

export default CreateMode;