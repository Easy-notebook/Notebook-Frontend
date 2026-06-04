import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { EasyNotebookContainer } from './EasyNotebookContainer';
import type { EasyNotebookContainerProps } from './EasyNotebookContainer';

export interface MountedEasyNotebook {
  root: Root;
  unmount: () => void;
}

const resolveMountElement = (target: HTMLElement | string): HTMLElement => {
  if (typeof target !== 'string') return target;

  const element = document.querySelector<HTMLElement>(target);
  if (!element) {
    throw new Error(`[EasyNotebook] Mount target not found: ${target}`);
  }
  return element;
};

export const mountEasyNotebook = (
  target: HTMLElement | string,
  options: EasyNotebookContainerProps = {}
): MountedEasyNotebook => {
  const element = resolveMountElement(target);
  const root = createRoot(element);

  root.render(
    <React.StrictMode>
      <EasyNotebookContainer {...options} />
    </React.StrictMode>
  );

  return {
    root,
    unmount: () => root.unmount(),
  };
};
