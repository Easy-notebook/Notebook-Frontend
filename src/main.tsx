// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'antd/dist/reset.css' // Import Ant Design reset styles first
import './index.css' // Then our custom styles to override
import App from './App'
import './i18n' // Import i18n configuration

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)