# 🎨 按钮和输入框系统

统一的按钮、输入框和图标设计系统，参考 Fluent Design 规范。

## 📦 按钮系统

### 按钮类型

#### 1. 主按钮 (Primary Button)
用于主要操作（如"运行"、"保存"、"提交"）

```tsx
<button className="btn btn-primary btn-sm">
  <Play className="icon-sm" />
  运行
</button>
```

**样式**:
- 渐变背景（绿色）
- 白色文字
- 阴影效果
- 悬浮时上移动画

---

#### 2. 次要按钮 (Secondary Button)
用于次要操作（如"导入"、"添加"）

```tsx
<button className="btn btn-secondary btn-sm">
  <Upload className="icon-sm" />
  导入
</button>
```

**样式**:
- 浅绿色背景
- 绿色文字和边框
- 悬浮时背景加深

---

#### 3. 幽灵按钮 (Ghost Button)
用于图标按钮或不重要的操作

```tsx
<button className="btn btn-ghost btn-sm">
  <Settings className="icon-sm" />
  设置
</button>
```

**样式**:
- 透明背景
- 灰色文字
- 悬浮时显示浅绿色背景

---

#### 4. 图标按钮 (Icon Button)
只有图标，无文字

```tsx
<button className="btn btn-icon btn-icon-sm btn-ghost">
  <TerminalSquare className="icon-md" />
</button>
```

**样式**:
- 正方形
- 居中图标
- 三种尺寸可选

---

### 按钮尺寸

| 类名 | 高度 | 内边距 | 字体大小 | 用途 |
|------|------|--------|----------|------|
| `btn-sm` | 32px | 0 12px | 13px | 工具栏、卡片 |
| `btn-md` | 36px | 0 16px | 14px | 默认按钮 |
| `btn-lg` | 40px | 0 20px | 15px | 主要操作 |

图标按钮尺寸：

| 类名 | 尺寸 |
|------|------|
| `btn-icon-sm` | 32x32px |
| `btn-icon` | 36x36px |
| `btn-icon-lg` | 40x40px |

---

### 完整示例

```tsx
// Header 工具栏
<header className="h-14 flex items-center justify-between px-4 glass-subtle">
  {/* 主要操作 */}
  <button className="btn btn-primary btn-sm">
    <Play className="icon-sm" />
    运行全部
  </button>

  {/* 次要操作 */}
  <button className="btn btn-secondary btn-sm">
    <Upload className="icon-sm" />
    导入
  </button>

  {/* 图标按钮 */}
  <button className="btn btn-icon btn-icon-sm btn-ghost">
    <TerminalSquare className="icon-md" />
  </button>
</header>
```

---

## 📝 输入框系统

### 基础输入框

```tsx
<input
  type="text"
  className="input"
  placeholder="请输入..."
/>
```

**样式**:
- 高度：36px
- 圆角：8px
- 边框：浅绿色
- 焦点时：绿色边框 + 外发光

---

### 文本域

```tsx
<textarea
  className="input textarea"
  placeholder="请输入..."
  rows={4}
/>
```

**特性**:
- 最小高度：80px
- 可垂直调整大小
- 其他样式同输入框

---

### 禁用状态

```tsx
<input
  className="input"
  disabled
/>
```

**效果**:
- 50% 不透明度
- 浅绿色背景
- 不可点击光标

---

## 🎯 图标系统

### 图标尺寸

| 类名 | 尺寸 | 用途 |
|------|------|------|
| `icon-sm` | 16x16px | 小按钮、标签 |
| `icon-md` | 20x20px | 常规按钮 |
| `icon-lg` | 24x24px | 大图标、标题 |

### 使用方法

```tsx
import { Play, Upload, Settings } from 'lucide-react';

// 小图标
<Play className="icon-sm" />

// 中等图标
<Upload className="icon-md" />

// 大图标
<Settings className="icon-lg" />
```

---

## 🎨 已优化的组件

### 1. Header 组件
路径: `src/components/Notebook/MainContainer/Header.tsx`

**改动**:
- ✅ 添加 `glass-subtle` 亚克力背景
- ✅ 移除黑色边框，使用 `border-gray-200/50`
- ✅ 所有按钮使用新的按钮系统
- ✅ 图标统一使用 `icon-sm` 和 `icon-md`

**效果**:
```tsx
// 之前
<button className="flex items-center gap-2 px-3 py-1.5 text-sm...">
  <Play size={16} />
  运行
</button>

// 之后
<button className="btn btn-primary btn-sm">
  <Play className="icon-sm" />
  运行
</button>
```

---

### 2. CellDivider 组件
路径: `src/components/Notebook/MainContainer/CellDivider.tsx`

**改动**:
- ✅ 容器使用 `glass-morphism` 强亚克力效果
- ✅ 添加 `shadow-theme-md` 阴影
- ✅ 所有按钮使用新样式
- ✅ AI生成按钮使用 `btn-primary`

**效果**:
```tsx
// 之前
<div className="...bg-white/80 backdrop-blur-md...">
  <button className="flex items-center gap-1 px-3 py-1.5...">

// 之后
<div className="...glass-morphism shadow-theme-md...">
  <button className="btn btn-secondary btn-sm">
```

---

## 💡 使用指南

### 选择合适的按钮类型

| 场景 | 推荐类型 |
|------|----------|
| 主要操作（运行、保存） | `btn-primary` |
| 次要操作（导入、添加） | `btn-secondary` |
| 工具栏图标按钮 | `btn-ghost + btn-icon` |
| 表单提交按钮 | `btn-primary btn-lg` |
| 取消按钮 | `btn-ghost` |

---

### 按钮组合

```tsx
// 操作按钮组
<div className="flex items-center gap-2">
  <button className="btn btn-primary btn-sm">确认</button>
  <button className="btn btn-ghost btn-sm">取消</button>
</div>

// 图标按钮组
<div className="flex items-center gap-1">
  <button className="btn btn-icon btn-icon-sm btn-ghost">
    <Edit className="icon-md" />
  </button>
  <button className="btn btn-icon btn-icon-sm btn-ghost">
    <Trash className="icon-md" />
  </button>
</div>
```

---

### 响应式设计

```tsx
// 移动端隐藏文字，只显示图标
<button className="btn btn-primary btn-sm">
  <Play className="icon-sm" />
  <span className="hidden sm:inline">运行</span>
</button>
```

---

## 🎯 设计原则

### 1. 一致性
- 所有按钮使用统一的高度和圆角
- 图标大小与按钮尺寸匹配
- 间距统一使用 `gap-1` 或 `gap-2`

### 2. 层次感
- 主按钮使用渐变和阴影
- 次要按钮使用边框区分
- 幽灵按钮透明背景

### 3. 反馈性
- 悬浮时颜色加深
- 点击时轻微缩放
- 禁用时明确的视觉反馈

### 4. 可访问性
- 所有按钮支持键盘导航
- 图标按钮添加 `title` 属性
- 足够的点击区域（最小 32px）

---

## 🔧 自定义按钮

### 创建自定义按钮组件

```tsx
interface CustomButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

const CustomButton: React.FC<CustomButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  children,
  ...props
}) => {
  return (
    <button
      className={cn(
        'btn',
        `btn-${variant}`,
        `btn-${size}`
      )}
      {...props}
    >
      {Icon && <Icon className="icon-sm" />}
      {children}
    </button>
  );
};

// 使用
<CustomButton variant="primary" size="sm" icon={Play}>
  运行
</CustomButton>
```

---

## 📚 相关文档

- [设计令牌参考](./DESIGN_TOKENS_REFERENCE.md)
- [迁移指南](./MIGRATION_GUIDE.md)
- [优化总结](./OPTIMIZATION_SUMMARY.md)

---

## ✅ 待优化组件

以下组件还需应用新的按钮系统：

- [ ] `ExportToFile` 组件
- [ ] `ModeToggle` 组件
- [ ] `AITerminal` 组件中的输入框
- [ ] `ViewSwitcher` 组件
- [ ] 所有对话框和模态框中的按钮

---

**提示**: 在新组件中始终使用统一的按钮和输入框样式！
