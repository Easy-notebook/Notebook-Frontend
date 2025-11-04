// src/App.tsx
import { ConfigProvider } from 'antd'
import AppRouter from './router/AppRouter'
import antdTheme from './theme/antdTheme'

function App(): JSX.Element {
  return (
    <ConfigProvider theme={antdTheme}>
      <AppRouter />
    </ConfigProvider>
  )
}

export default App