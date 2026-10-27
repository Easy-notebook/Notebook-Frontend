import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import { getAntdTheme } from '../../src/theme/antdTheme';
import LibraryHeader from '../../src/components/Scenario/State/LibraryState/views/components/LibraryHeader';
import AICommandInput from '../../src/components/Scenario/State/EmptyState/AICommandInput';
import '../../src/i18n';
import '../../src/index.css';
function Probe() {
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState([]);
  document.documentElement.className = dark ? 'dark' : 'light';
  return (
    <ConfigProvider theme={getAntdTheme(dark)}>
      <main style={{ maxWidth: 760, margin: '32px auto', padding: 16 }}>
        <button onClick={() => setDark(!dark)}>Toggle theme</button>
        <LibraryHeader
          totalNotebooks={0}
          totalSize={0}
          searchQuery={query}
          viewMode="grid"
          refreshing={false}
          onSearchChange={setQuery}
          onViewModeChange={() => {}}
          onRefresh={() => {}}
        />
        <AICommandInput files={files} setFiles={setFiles} />
      </main>
    </ConfigProvider>
  );
}
createRoot(document.getElementById('root')).render(<Probe />);
