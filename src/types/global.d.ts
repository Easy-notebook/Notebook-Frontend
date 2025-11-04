// Existing module declaration for importing .jsx as components
declare module "*.jsx" {
  import React from 'react';
  const component: React.ComponentType<any>;
  export default component;
}

// Global ambient declarations for browser globals
export {};

declare global {
  interface Window {
    Backend_BASE_URL?: string;
  }
}
