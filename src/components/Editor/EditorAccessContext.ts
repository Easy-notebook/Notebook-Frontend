import { createContext, useContext } from 'react';

/** Runtime view policy, not persisted cell data. React portals retain this context. */
export const EditorReadOnlyContext = createContext(false);
export const useEditorReadOnly = () => useContext(EditorReadOnlyContext);
