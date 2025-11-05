// src/App.tsx
import { ConfigProvider } from 'antd';
import AppRouter from './router/AppRouter';
import antdTheme from './theme/antdTheme';
import { ThemeProvider } from './contexts/ThemeContext';

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <ConfigProvider theme={antdTheme}>
        <AppRouter />
      </ConfigProvider>
    </ThemeProvider>
  );
}

export default App;
