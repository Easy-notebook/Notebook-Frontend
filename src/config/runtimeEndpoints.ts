type RuntimeInfra = 'dev' | 'prod';

type RuntimeEndpoints = {
  Backend_BASE_URL: string;
  DSLC_BASE_URL: string;
  WORKFLOW_API_BASE_URL: string;
  FRONTEND_BASE_URL: string;
};

const runtimeInfra: RuntimeInfra = import.meta.env.VITE_APP_INFRA ?? 'dev';

const endpointDefaults: Record<RuntimeInfra, RuntimeEndpoints> = {
  dev: {
    Backend_BASE_URL: 'http://localhost:18600',
    DSLC_BASE_URL: 'http://localhost:18600/v1',
    WORKFLOW_API_BASE_URL: 'http://localhost:28600',
    FRONTEND_BASE_URL: 'http://localhost:3000',
  },
  prod: {
    Backend_BASE_URL: 'https://easy-notebook.silan.tech/api/',
    DSLC_BASE_URL: 'https://easy-notebook.silan.tech/api/v1',
    WORKFLOW_API_BASE_URL: 'https://easy-notebook.silan.tech/api/v2',
    FRONTEND_BASE_URL: 'https://easy-notebook.silan.tech',
  },
};

const endpoints: RuntimeEndpoints = {
  Backend_BASE_URL:
    import.meta.env.VITE_BACKEND_BASE_URL ?? endpointDefaults[runtimeInfra].Backend_BASE_URL,
  DSLC_BASE_URL: import.meta.env.VITE_DSLC_BASE_URL ?? endpointDefaults[runtimeInfra].DSLC_BASE_URL,
  WORKFLOW_API_BASE_URL:
    import.meta.env.VITE_WORKFLOW_API_BASE_URL ??
    endpointDefaults[runtimeInfra].WORKFLOW_API_BASE_URL,
  FRONTEND_BASE_URL:
    import.meta.env.VITE_FRONTEND_BASE_URL ?? endpointDefaults[runtimeInfra].FRONTEND_BASE_URL,
};

export const Backend_BASE_URL = endpoints.Backend_BASE_URL;
export const DSLC_BASE_URL = endpoints.DSLC_BASE_URL;
export const WORKFLOW_API_BASE_URL = endpoints.WORKFLOW_API_BASE_URL;
export const FRONTEND_BASE_URL = endpoints.FRONTEND_BASE_URL;
