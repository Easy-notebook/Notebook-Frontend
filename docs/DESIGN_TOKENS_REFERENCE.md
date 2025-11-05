# 🎨 设计令牌快速参考

快速查找 CSS 变量和样式类的使用方法。

## 📦 CSS 变量

### 颜色
```css
/* 主色系 */
--color-primary: #41B883        /* Vue 绿 */
--color-primary-light: #52C896   /* 浅绿 */
--color-primary-dark: #369870    /* 深绿 */
--color-secondary: #3490DC       /* 蓝色 */
--color-accent: #6574CD          /* 紫色 */
--color-neutral: #35495E         /* 中性灰 */
--color-neutral-dark: #2c3e50    /* 深灰 */

/* 透明度变体 */
--color-primary-50: rgba(65, 184, 131, 0.05)   /* 5% */
--color-primary-100: rgba(65, 184, 131, 0.1)   /* 10% */
--color-primary-200: rgba(65, 184, 131, 0.2)   /* 20% */
--color-primary-300: rgba(65, 184, 131, 0.3)   /* 30% */
```

### 尺寸
```css
/* 侧边栏宽度 */
--sidebar-mini-width: 64px        /* 迷你栏 */
--sidebar-expanded-width: 384px   /* 展开左栏 */
--sidebar-collapsed-width: 64px   /* 折叠宽度 */
--sidebar-right-width: 300px      /* 右侧栏 */
```

### 效果
```css
/* 毛玻璃模糊 */
--glass-blur: blur(30px) saturate(180%)

/* 阴影 */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(65, 184, 131, 0.1)
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 1px rgba(65, 184, 131, 0.2)
```

### 圆角
```css
--radius-sm: 4px
--radius-md: 8px
--radius-lg: 12px
```

### 过渡
```css
--transition-fast: 150ms ease     /* 快速 */
--transition-normal: 200ms ease   /* 常规 */
--transition-slow: 300ms ease     /* 缓慢 */
```

---

## 🎭 实用样式类

### 背景效果
```tsx
// 毛玻璃效果 - 强
<div className="glass-morphism">...</div>

// 毛玻璃效果 - 微妙（推荐用于侧边栏）
<div className="glass-subtle">...</div>

// 渐变背景
<div className="gradient-bg">...</div>

// 噪声纹理（需配合 relative）
<div className="noise-texture relative">...</div>
```

### 阴影
```tsx
// 小阴影
<div className="shadow-theme-sm">...</div>

// 中等阴影
<div className="shadow-theme-md">...</div>
```

### 侧边栏样式
```tsx
// 活跃状态指示条（自动显示）
<button className="sidebar-item-active">...</button>

// 悬浮效果
<button className="sidebar-item-hover">...</button>

// 图标发光效果
<Icon className="icon-glow-active" />
```

---

## 🧩 常用组合

### 侧边栏按钮
```tsx
<button
  className={cn(
    'w-8 h-8',
    'relative rounded-lg',
    'sidebar-item-hover',
    isActive && 'sidebar-item-active icon-glow-active text-theme-600',
    !isActive && 'text-gray-500'
  )}
>
  <Icon size={18} />
</button>
```

### 卡片容器
```tsx
<div className="glass-subtle shadow-theme-sm rounded-lg p-4">
  {/* 内容 */}
</div>
```

### 模态框/弹窗
```tsx
<div className="glass-morphism shadow-theme-md rounded-xl p-6">
  {/* 内容 */}
</div>
```

### 主容器背景
```tsx
<div className="h-dvh gradient-bg noise-texture relative">
  {/* 内容 */}
</div>
```

---

## 💡 使用技巧

### 1. 在自定义 CSS 中使用变量
```css
.my-component {
  color: var(--color-primary);
  background: var(--color-primary-50);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
}

.my-component:hover {
  background: var(--color-primary-100);
  box-shadow: var(--shadow-md);
}
```

### 2. 响应式设计
```css
.responsive-sidebar {
  width: var(--sidebar-expanded-width);
  transition: width var(--transition-slow);
}

.responsive-sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}
```

### 3. 组合多个效果
```tsx
<div className="glass-subtle shadow-theme-sm noise-texture relative">
  {/* 同时具有毛玻璃、阴影和纹理效果 */}
</div>
```

---

## 🎨 颜色使用指南

| 场景 | 颜色变量 | 用途 |
|------|---------|------|
| 主要操作按钮 | `--color-primary` | 确认、提交、保存 |
| 次要操作按钮 | `--color-secondary` | 编辑、查看 |
| 强调元素 | `--color-accent` | 高亮、标签 |
| 文本/图标 | `--color-neutral` | 正文、说明 |
| 标题 | `--color-neutral-dark` | 标题、重要文字 |
| 悬浮背景 | `--color-primary-50` | 按钮悬浮 |
| 点击背景 | `--color-primary-100` | 按钮按下 |
| 边框/分割线 | `--color-primary-100` | 分界元素 |

---

## ⚡ 性能优化提示

### 优先使用 CSS 变量
```css
/* ✅ 好 - 使用变量 */
.component {
  transition: all var(--transition-normal);
}

/* ❌ 不好 - 硬编码 */
.component {
  transition: all 200ms ease;
}
```

### backdrop-filter 性能考虑
```css
/* ✅ 好 - 仅在需要时使用 */
.glass-subtle {
  backdrop-filter: blur(10px) saturate(150%);
  /* 浏览器会自动硬件加速 */
}

/* ⚠️ 注意 - 避免过度使用 */
/* 不要给每个元素都加毛玻璃效果 */
```

### 减少重绘
```css
/* ✅ 好 - 使用 transform 代替 left/top */
.element {
  transform: translateX(10px);
}

/* ❌ 不好 - 触发重排 */
.element {
  left: 10px;
}
```

---

## 🔍 调试工具

### 查看所有 CSS 变量
在浏览器控制台运行：
```javascript
const root = document.documentElement;
const styles = getComputedStyle(root);

// 获取特定变量
console.log(styles.getPropertyValue('--color-primary'));

// 设置变量（临时测试）
root.style.setProperty('--color-primary', '#ff6b6b');
```

### 切换玻璃效果（测试）
```javascript
// 移除玻璃效果
document.querySelectorAll('.glass-subtle').forEach(el => {
  el.classList.remove('glass-subtle');
});

// 添加玻璃效果
document.querySelector('.my-element').classList.add('glass-morphism');
```

---

## 📱 响应式断点

配合 Tailwind CSS 使用：
```tsx
<div className="
  glass-subtle
  shadow-theme-sm
  w-full
  md:w-[var(--sidebar-expanded-width)]
">
  {/* 移动端全宽，桌面端固定宽度 */}
</div>
```

---

## 🎯 最佳实践

1. **一致性**: 始终使用 CSS 变量，避免硬编码颜色/尺寸
2. **层次感**: 合理使用阴影和毛玻璃效果建立视觉层次
3. **性能**: 只在必要的地方使用 backdrop-filter
4. **可访问性**: 确保颜色对比度符合 WCAG AA 标准
5. **主题支持**: 通过修改 CSS 变量轻松切换主题

---

## 📚 相关文档

- [完整优化总结](./OPTIMIZATION_SUMMARY.md)
- [EasyPaper 参考项目](../ref/EasyPaper-main)
- [Tailwind CSS 文档](https://tailwindcss.com)

---

**提示**: 将此文档加入书签，在开发时随时查阅！
