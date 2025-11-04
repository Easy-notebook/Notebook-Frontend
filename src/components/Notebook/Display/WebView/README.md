# WebView System - CodeSandbox Integration

基于 CodeSandbox 的增强 WebView 系统，支持项目预览、文件管理和多种框架。

## 🚀 功能特性

### 核心功能
- **CodeSandbox 集成**: 使用 `codesandbox` npm 包进行在线预览
- **自动项目检测**: 自动识别 HTML、React、Vue、Angular、TypeScript 项目
- **智能文件扫描**: 扫描项目文件并解析依赖关系
- **Sandbox 目录管理**: 自动创建和管理 `.sandbox` 目录
- **多标签页支持**: 同时预览多个项目

### 支持的项目类型
- **HTML**: 静态 HTML 页面
- **React**: Create React App 项目
- **Vue**: Vue CLI 项目  
- **Angular**: Angular CLI 项目
- **TypeScript**: TypeScript 项目
- **JavaScript**: 纯 JavaScript 项目

## 📁 目录结构

```
WebView/
├── CodeSandboxWebView.tsx      # 主要的 CodeSandbox 预览组件
├── WebViewManager.tsx          # WebView 管理器和项目浏览器
├── NotebookTabManager.tsx      # 标签页管理系统
├── ReactLiveSandbox.tsx        # 轻量级 React Live 预览
├── WebViewDemo.tsx             # 演示组件
└── README.md                   # 说明文档
```

## 🛠 组件使用

### 1. 基础使用 - CodeSandboxWebView

```tsx
import CodeSandboxWebView from './WebView/CodeSandboxWebView';

function MyComponent() {
  return (
    <CodeSandboxWebView
      projectPath="/path/to/your/project"
      projectType="react"
      title="My React App"
      onProjectChange={(newPath) => console.log('Project changed:', newPath)}
    />
  );
}
```

### 2. 项目管理 - WebViewManager

```tsx
import WebViewManager from './WebView/WebViewManager';

function ProjectPreview() {
  return (
    <WebViewManager 
      initialPath="/path/to/project"
      initialType="project"
    />
  );
}
```

### 3. 完整标签页系统 - NotebookTabManager + TabContentRenderer

```tsx
import NotebookTabManager, { TabContentRenderer } from './WebView/NotebookTabManager';

function NotebookInterface() {
  const [activeTab, setActiveTab] = useState(null);

  return (
    <div className="h-screen flex flex-col">
      <NotebookTabManager />
      <div className="flex-1">
        <TabContentRenderer activeTab={activeTab} />
      </div>
    </div>
  );
}
```

## ⚙️ 后端 API

### Sandbox 管理 API

```python
# 扫描可用项目
GET /api/sandbox/scan-available-projects

# 扫描特定项目文件
POST /api/sandbox/scan-project
{
  "projectPath": "/path/to/project",
  "projectType": "react"
}

# 准备项目用于 CodeSandbox
POST /api/sandbox/prepare
{
  "projectPath": "/path/to/project", 
  "projectType": "react"
}

# 验证项目路径
POST /api/sandbox/validate-path
{
  "projectPath": "/path/to/project"
}
```

### .sandbox 目录逻辑

系统会自动在以下位置创建 `.sandbox` 目录：

- **项目文件夹**: `project-folder/.sandbox/`
- **单个文件**: `file-parent-folder/.sandbox/`

## 🎯 使用场景

### 1. 快速项目预览
```tsx
// 适用于快速查看项目效果
<CodeSandboxWebView
  projectPath="/Users/demo/my-react-app"
  projectType="react"
/>
```

### 2. 项目开发调试
```tsx
// 适用于开发过程中的实时预览
<WebViewManager />
```

### 3. 多项目管理
```tsx
// 适用于同时管理多个项目
<div>
  <NotebookTabManager />
  <TabContentRenderer activeTab={activeTab} />
</div>
```

## 🔧 配置选项

### CodeSandboxWebView Props

```typescript
interface CodeSandboxWebViewProps {
  projectPath: string;                    // 项目路径
  projectType: 'html' | 'react' | ...;   // 项目类型
  title?: string;                         // 显示标题
  onProjectChange?: (path: string) => void; // 项目切换回调
}
```

### WebViewManager Props

```typescript
interface WebViewManagerProps {
  initialPath?: string;           // 初始项目路径
  initialType?: 'project' | 'file'; // 初始类型
}
```

## 🚥 项目检测规则

系统使用以下规则自动检测项目类型：

```typescript
const detectionRules = [
  {
    type: 'react',
    files: ['package.json'],
    dependencies: ['react', '@types/react', 'react-dom']
  },
  {
    type: 'vue', 
    files: ['package.json'],
    dependencies: ['vue', '@vue/cli', 'vite']
  },
  {
    type: 'angular',
    files: ['package.json', 'angular.json'],
    dependencies: ['@angular/core', '@angular/cli']
  },
  {
    type: 'typescript',
    files: ['tsconfig.json', 'package.json'],
    dependencies: ['typescript']
  }
];
```

## 📦 依赖要求

### 前端依赖
```json
{
  "dependencies": {
    "codesandbox": "^2.2.3",
    "react-live": "^4.1.7",
    "lucide-react": "^0.468.0"
  }
}
```

### 后端依赖
```python
# requirements.txt
fastapi>=0.68.0
pathlib
mimetypes
```

## 🐛 故障排除

### 常见问题

1. **CodeSandbox 加载失败**
   - 检查网络连接
   - 确认项目文件格式正确

2. **项目检测错误**
   - 验证 `package.json` 格式
   - 检查依赖配置

3. **.sandbox 目录权限问题**
   - 确保有写入权限
   - 检查路径是否存在

### 日志调试

```typescript
// 启用详细日志
const webView = (
  <CodeSandboxWebView
    projectPath={path}
    projectType={type}
    onProjectChange={(newPath) => {
      console.log('Project changed:', newPath);
    }}
  />
);
```

## 🚀 性能优化

### 最佳实践

1. **项目大小控制**: 避免包含大型文件
2. **依赖优化**: 仅包含必要的依赖
3. **缓存策略**: 利用浏览器缓存加速加载
4. **懒加载**: 按需加载项目内容

### 文件过滤

系统自动排除以下文件/目录：
- `node_modules/`
- `.git/`
- `dist/`, `build/`
- `__pycache__/`
- `.sandbox/` (避免递归)

## 📄 许可证

本项目遵循 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个 WebView 系统！