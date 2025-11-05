# 🚀 UI 优化迁移指南

如何在现有组件中应用新的设计系统。

## 📋 快速开始

### 1. 更新容器背景

**之前**:
```tsx
<div className="h-screen flex bg-white">
```

**之后**:
```tsx
<div className="h-dvh flex gradient-bg noise-texture relative">
```

**效果**: 添加微妙的渐变背景和纹理，提升质感。

---

### 2. 更新侧边栏样式

**之前**:
```tsx
<div className="w-16 h-full bg-white border-r">
```

**之后**:
```tsx
<div className="w-16 h-full glass-subtle border-r relative z-10">
```

**效果**: 添加毛玻璃效果，更现代化。

---

### 3. 更新按钮样式

**之前**:
```tsx
<button
  className={cn(
    'w-8 h-8 rounded-lg transition-colors',
    active ? 'text-green-500' : 'text-gray-500'
  )}
>
  <Icon />
</button>
```

**之后**:
```tsx
<button
  className={cn(
    'w-8 h-8 rounded-lg',
    'sidebar-item-hover',
    active && 'text-theme-600 sidebar-item-active icon-glow-active',
    !active && 'text-gray-500'
  )}
>
  <Icon />
</button>
```

**效果**: 添加活跃指示条、悬浮效果和图标发光。

---

## 🎨 常见场景

### 场景 1: 卡片组件

**之前**:
```tsx
<div className="bg-white rounded-lg shadow-md p-4">
  {/* 内容 */}
</div>
```

**之后**:
```tsx
<div className="glass-subtle rounded-lg shadow-theme-sm p-4">
  {/* 内容 */}
</div>
```

---

### 场景 2: 模态框

**之前**:
```tsx
<div className="bg-white rounded-xl shadow-lg p-6">
  <h2 className="text-xl font-bold mb-4">标题</h2>
  {/* 内容 */}
</div>
```

**之后**:
```tsx
<div className="glass-morphism rounded-xl shadow-theme-md p-6">
  <h2 className="text-xl font-bold mb-4">标题</h2>
  {/* 内容 */}
</div>
```

---

### 场景 3: 侧边栏导航

**之前**:
```tsx
<nav className="w-64 bg-white border-r">
  <ul>
    {items.map(item => (
      <li key={item.id}>
        <button className={item.active ? 'text-green-500' : 'text-gray-500'}>
          {item.label}
        </button>
      </li>
    ))}
  </ul>
</nav>
```

**之后**:
```tsx
<nav className="w-64 glass-subtle border-r shadow-theme-sm">
  <ul>
    {items.map(item => (
      <li key={item.id}>
        <button
          className={cn(
            'sidebar-item-hover',
            item.active && 'sidebar-item-active text-theme-600',
            !item.active && 'text-gray-500'
          )}
        >
          {item.label}
        </button>
      </li>
    ))}
  </ul>
</nav>
```

---

## 📐 布局更新

### 使用 CSS 变量代替硬编码尺寸

**之前**:
```tsx
<div
  style={{
    width: isCollapsed ? '64px' : '384px',
    transition: 'width 0.5s ease'
  }}
>
```

**之后**:
```tsx
<div
  style={{
    width: isCollapsed
      ? 'var(--sidebar-collapsed-width)'
      : 'var(--sidebar-expanded-width)',
    transition: 'width var(--transition-slow)'
  }}
>
```

---

### 动态视口高度

**之前**:
```tsx
<div className="h-screen">
  {/* 在移动端可能有地址栏遮挡问题 */}
</div>
```

**之后**:
```tsx
<div className="h-dvh">
  {/* 自动适配移动端地址栏 */}
</div>
```

---

## 🎭 主题颜色迁移

### 替换硬编码颜色

| 旧颜色 | 新 CSS 变量 | Tailwind 类 |
|--------|------------|------------|
| `#41B883` | `var(--color-primary)` | `text-theme-600` |
| `#3490DC` | `var(--color-secondary)` | - |
| `#6574CD` | `var(--color-accent)` | - |
| `#35495E` | `var(--color-neutral)` | - |

**示例**:

**之前**:
```css
.my-button {
  background-color: #41B883;
  color: white;
}

.my-button:hover {
  background-color: #369870;
}
```

**之后**:
```css
.my-button {
  background-color: var(--color-primary);
  color: white;
}

.my-button:hover {
  background-color: var(--color-primary-dark);
}
```

---

## 🔧 自定义组件示例

### 创建带活跃指示的列表项

```tsx
interface ListItemProps {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

const ListItem: React.FC<ListItemProps> = ({ active, icon: Icon, label, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        // 基础样式
        'w-full px-4 py-2 flex items-center gap-3',
        'relative rounded-lg',
        'transition-all',

        // 悬浮效果
        'sidebar-item-hover',

        // 活跃状态
        active && [
          'sidebar-item-active',
          'text-theme-600',
          'icon-glow-active',
          'font-medium'
        ],

        // 非活跃状态
        !active && 'text-gray-500'
      )}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
};
```

---

### 创建玻璃形态卡片

```tsx
interface GlassCardProps {
  title: string;
  children: React.ReactNode;
  variant?: 'subtle' | 'strong';
}

const GlassCard: React.FC<GlassCardProps> = ({
  title,
  children,
  variant = 'subtle'
}) => {
  return (
    <div
      className={cn(
        'rounded-lg p-6',
        variant === 'subtle' ? 'glass-subtle shadow-theme-sm' : 'glass-morphism shadow-theme-md',
        'transition-all duration-300',
        'hover:shadow-theme-md'
      )}
    >
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
};
```

---

## ⚠️ 注意事项

### 1. backdrop-filter 兼容性

如果需要支持老版本浏览器，添加降级方案：

```tsx
<div className="glass-subtle">
  {/* 对于不支持 backdrop-filter 的浏览器，会显示纯白背景 */}
</div>
```

可以添加 JavaScript 检测：

```typescript
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)');

<div className={supportsBackdropFilter ? 'glass-subtle' : 'bg-white'}>
```

---

### 2. 性能考虑

**不要过度使用毛玻璃效果**:

```tsx
// ❌ 不好 - 嵌套太多层毛玻璃
<div className="glass-morphism">
  <div className="glass-morphism">
    <div className="glass-morphism">
      {/* ... */}
    </div>
  </div>
</div>

// ✅ 好 - 只在必要的层级使用
<div className="glass-subtle">
  <div className="bg-white bg-opacity-50">
    <div className="bg-transparent">
      {/* ... */}
    </div>
  </div>
</div>
```

---

### 3. z-index 管理

使用毛玻璃效果时注意层级：

```tsx
<div className="relative">
  {/* 背景层 */}
  <div className="noise-texture">

    {/* 玻璃层 */}
    <div className="glass-subtle relative z-10">
      {/* 内容 */}
    </div>
  </div>
</div>
```

---

## 🎯 迁移检查清单

在迁移组件时，检查以下项目：

- [ ] 更新容器使用 `h-dvh` 代替 `h-screen`
- [ ] 添加 `gradient-bg` 和 `noise-texture` 到主容器
- [ ] 侧边栏添加 `glass-subtle` 效果
- [ ] 按钮添加 `sidebar-item-hover` 和活跃状态类
- [ ] 卡片使用 `glass-subtle` 或 `glass-morphism`
- [ ] 阴影使用 `shadow-theme-sm/md` 代替默认阴影
- [ ] 硬编码颜色替换为 CSS 变量
- [ ] 硬编码尺寸替换为 CSS 变量
- [ ] 过渡时间使用 CSS 变量
- [ ] 测试在不同浏览器的兼容性

---

## 🧪 测试建议

### 视觉测试

1. **浏览器测试**:
   - Chrome (最新版)
   - Safari (最新版)
   - Firefox (最新版)
   - Edge (最新版)

2. **设备测试**:
   - 桌面 (1920x1080)
   - 平板 (768x1024)
   - 手机 (375x667)

3. **主题测试**:
   - 浅色模式
   - 深色模式（如支持）

### 性能测试

使用 Chrome DevTools:

1. 打开 Performance 面板
2. 录制页面交互
3. 检查:
   - FPS 是否稳定在 60
   - Layout Shift 是否最小
   - Paint 时间是否合理

---

## 📚 相关资源

- [设计令牌参考](./DESIGN_TOKENS_REFERENCE.md)
- [优化总结](./OPTIMIZATION_SUMMARY.md)
- [EasyPaper 源码](../ref/EasyPaper-main)

---

## 💬 获取帮助

如果在迁移过程中遇到问题：

1. 查看 [设计令牌参考](./DESIGN_TOKENS_REFERENCE.md)
2. 参考 `MiniSidebar.tsx` 的实现
3. 检查浏览器控制台是否有 CSS 警告

---

**提示**: 建议逐步迁移，先在一个组件上测试效果，确认无误后再推广到其他组件。
