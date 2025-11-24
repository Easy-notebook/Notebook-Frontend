const infra: 'dev' | 'prod' = 'dev';

const config = {
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

export const Backend_BASE_URL = config[infra].Backend_BASE_URL;
export const DSLC_BASE_URL = config[infra].DSLC_BASE_URL;
export const WORKFLOW_API_BASE_URL = config[infra].WORKFLOW_API_BASE_URL;
export const FRONTEND_BASE_URL = config[infra].FRONTEND_BASE_URL;

// # Backend 服务 (port 18600)
// location /api/ {
//     proxy_pass http://127.0.0.1:18600/;

//     proxy_set_header Host $host;
//     proxy_set_header X-Real-IP $remote_addr;
//     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//     proxy_set_header X-Forwarded-Proto $scheme;

//     proxy_http_version 1.1;
//     proxy_set_header Upgrade $http_upgrade;
//     proxy_set_header Connection "upgrade";
// }

// # DSLC 服务 (port 18600/v1)
// location /api/v1/ {
//     proxy_pass http://127.0.0.1:18600/v1/;

//     proxy_set_header Host $host;
//     proxy_set_header X-Real-IP $remote_addr;
//     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//     proxy_set_header X-Forwarded-Proto $scheme;
// }

// # Workflow 服务 (port 28600)
// location /api/v2/ {
//     proxy_pass http://127.0.0.1:28600/;

//     proxy_set_header Host $host;
//     proxy_set_header X-Real-IP $remote_addr;
//     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
//     proxy_set_header X-Forwarded-Proto $scheme;

//     proxy_http_version 1.1;
//     proxy_set_header Upgrade $http_upgrade;
//     proxy_set_header Connection "upgrade";
// }
