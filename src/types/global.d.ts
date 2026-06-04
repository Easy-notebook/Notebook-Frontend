// Global ambient declarations to smooth TS in mixed DOM/Node contexts

// Align Timeout/Interval types with browser timers
type Timeout = ReturnType<typeof setTimeout>;
type Interval = ReturnType<typeof setInterval>;

// Vite import.meta env typing
interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly PROD?: boolean;
  readonly BASE_URL?: string;
  readonly VITE_APP_INFRA?: 'dev' | 'prod';
  readonly VITE_BACKEND_BASE_URL?: string;
  readonly VITE_DSLC_BASE_URL?: string;
  readonly VITE_WORKFLOW_API_BASE_URL?: string;
  readonly VITE_FRONTEND_BASE_URL?: string;
  readonly VITE_FORCE_HASH_ROUTER?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Stub modules without type definitions
declare module 'lodash-es';
declare module 'pdfmake/build/pdfmake';
declare module 'codesandbox/lib/api/define';
