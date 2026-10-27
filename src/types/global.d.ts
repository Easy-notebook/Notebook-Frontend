/// <reference types="vite/client" />

// Global ambient declarations to smooth TS in mixed DOM/Node contexts

// Align Timeout/Interval types with browser timers
type Timeout = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

interface Window {
  Backend_BASE_URL?: string;
}

// Keep project environment keys explicit; framework fields come from Vite.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}
interface ImportMetaEnv {
  readonly VITE_FORCE_HASH_ROUTER?: string;
}

// Stub modules without type definitions
declare module 'lodash-es';
declare module 'pdfmake/build/pdfmake';
declare module 'codesandbox/lib/api/define';
