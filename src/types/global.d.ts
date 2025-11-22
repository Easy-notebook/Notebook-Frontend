// Global ambient declarations to smooth TS in mixed DOM/Node contexts

// Align Timeout/Interval types with browser timers
type Timeout = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

// Vite import.meta env typing
interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly BASE_URL?: string;
  // Add other envs as needed
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Stub modules without type definitions
declare module 'lodash-es';
declare module 'pdfmake/build/pdfmake';
declare module 'codesandbox/lib/api/define';
