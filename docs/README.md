# 📚 Notebook-Frontend 文档中心

欢迎来到 Notebook-Frontend 的文档中心！

## 🎨 UI/UX 优化文档

### [✨ 优化总结](./OPTIMIZATION_SUMMARY.md)
**完整的 UI/UX 优化说明**

- 📊 对比分析（优化前 vs 优化后）
- 🎯 设计原则和技术亮点
- 📁 修改文件清单
- 🔄 浏览器兼容性
- 📚 参考资料

**适合**: 想要了解整体优化思路和实现细节的开发者

---

### [🎨 设计令牌参考](./DESIGN_TOKENS_REFERENCE.md)
**CSS 变量和样式类快速参考**

- 📦 所有 CSS 变量一览
- 🎭 实用样式类速查
- 🧩 常用组合示例
- 💡 使用技巧
- ⚡ 性能优化建议

**适合**: 日常开发时快速查找样式的开发者

---

### [🚀 迁移指南](./MIGRATION_GUIDE.md)
**如何在现有组件中应用新设计**

- 📋 快速开始指南
- 🎨 常见场景示例
- 🔧 自定义组件模板
- ⚠️ 注意事项和最佳实践
- 🎯 迁移检查清单

**适合**: 需要更新现有组件的开发者

---

## 🗂️ 文档结构

```
docs/
├── README.md                      # 本文件 - 文档导航
├── OPTIMIZATION_SUMMARY.md        # 完整优化说明
├── DESIGN_TOKENS_REFERENCE.md     # 设计令牌快速参考
└── MIGRATION_GUIDE.md             # 组件迁移指南
```

---

## 🚀 快速开始

### 1️⃣ 第一次接触？
👉 先阅读 [优化总结](./OPTIMIZATION_SUMMARY.md)，了解整体优化内容

### 2️⃣ 需要查找样式？
👉 查看 [设计令牌参考](./DESIGN_TOKENS_REFERENCE.md)，快速找到需要的 CSS 变量或样式类

### 3️⃣ 准备更新组件？
👉 参考 [迁移指南](./MIGRATION_GUIDE.md)，按步骤应用新设计

---

## 💡 核心概念速览

### CSS 变量系统
所有设计令牌（颜色、尺寸、效果）集中管理：

```css
:root {
  --color-primary: #41B883;
  --sidebar-mini-width: 64px;
  --glass-blur: blur(30px) saturate(180%);
  --transition-normal: 200ms ease;
}
```

### 背景材质
三层背景系统：

1. **渐变背景** (`gradient-bg`)
2. **噪声纹理** (`noise-texture`)
3. **毛玻璃效果** (`glass-subtle` / `glass-morphism`)

### 活跃指示
侧边栏按钮的视觉反馈：

- `sidebar-item-active` - 渐变指示条
- `sidebar-item-hover` - 悬浮效果
- `icon-glow-active` - 图标发光

---

## 🎯 最常用的样式类

### 容器
```tsx
<div className="h-dvh gradient-bg noise-texture relative">
```

### 侧边栏
```tsx
<nav className="glass-subtle shadow-theme-sm">
```

### 按钮
```tsx
<button className={cn(
  'sidebar-item-hover',
  active && 'sidebar-item-active text-theme-600'
)}>
```

### 卡片
```tsx
<div className="glass-subtle rounded-lg shadow-theme-sm p-4">
```

---

## 📂 参考项目

### EasyPaper
位置: `/ref/EasyPaper-main`

这是一个 Tauri 桌面 LaTeX 编辑器，我们的优化参考了它的：
- 多层背景材质实现
- CSS 变量驱动的布局系统
- SidebarTabs 的活跃指示设计

**关键文件**:
- `app/src/App.tsx` - 背景材质
- `app/src/modules/project/SidebarTabs.tsx` - 侧边栏实现

---

## 🛠️ 工具和资源

### 开发工具
- **CSS 变量检查器**: 浏览器 DevTools → Elements → Computed
- **性能分析**: Chrome DevTools → Performance
- **兼容性检查**: [Can I Use](https://caniuse.com)

### 设计资源
- **配色参考**: Vue.js 官网配色
- **设计语言**: Windows 11 Fluent Design, macOS Acrylic
- **图标库**: Lucide Icons

---

## 🔧 常见问题

### Q: 毛玻璃效果不显示？
A: 检查浏览器版本是否支持 `backdrop-filter`。可以使用降级方案：

```tsx
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)');
<div className={supportsBackdropFilter ? 'glass-subtle' : 'bg-white'}>
```

### Q: CSS 变量如何使用？
A: 在 CSS 中使用 `var()` 函数：

```css
.my-component {
  color: var(--color-primary);
  width: var(--sidebar-mini-width);
}
```

### Q: 如何自定义主题色？
A: 修改 `src/index.css` 中的 `:root` 变量：

```css
:root {
  --color-primary: #你的颜色;
}
```

### Q: 性能会受影响吗？
A: `backdrop-filter` 会使用 GPU 加速，性能影响很小。避免过度嵌套即可。

---

## 📈 更新日志

### 2025-01-XX - v1.0.0
- ✅ 添加 CSS 变量系统
- ✅ 实现背景材质（毛玻璃 + 渐变 + 纹理）
- ✅ 更新布局使用 h-dvh
- ✅ 增强 MiniSidebar 视觉反馈
- ✅ 完善文档系统

---

## 🤝 贡献

如果您发现文档有误或需要补充，欢迎：

1. 提交 Issue
2. 发起 Pull Request
3. 联系项目维护者

---

## 📞 联系方式

- **项目仓库**: [GitHub](...)
- **问题反馈**: [Issues](...)

---

## 📜 许可证

本项目遵循 [LICENSE](../LICENSE) 中的许可协议。

---

**最后更新**: 2025-01-05

**维护者**: Notebook-Frontend Team

---

<div align="center">

**Happy Coding! 🎉**

如有疑问，请先查阅相关文档，或提交 Issue

</div>
