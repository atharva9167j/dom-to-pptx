# dom-to-pptx 使用指南

本文档总结了使用 `dom-to-pptx` 将 HTML 导出为 PowerPoint 的最佳实践和注意事项。

## 快速开始

### 安装

```bash
npm install dom-to-pptx
```

### 基本用法

```javascript
import { exportToPptx } from 'dom-to-pptx';

// 单个幻灯片
await exportToPptx('#slide-container', {
  fileName: 'presentation.pptx',
});

// 多个幻灯片
const slides = document.querySelectorAll('.slide');
await exportToPptx(Array.from(slides), {
  fileName: 'multi-slides.pptx',
});
```

### 浏览器直接使用（CDN）

```html
<script src="https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js"></script>
<script>
  await domToPptx.exportToPptx('#slide', { fileName: 'slide.pptx' });
</script>
```

---

## HTML 编写规范

### 1. 幻灯片容器

推荐使用 **16:9** 比例的固定尺寸容器：

```html
<!-- 推荐尺寸 -->
<div class="slide" style="width: 1920px; height: 1080px;">
  ...
</div>

<!-- 或者较小的等比尺寸 -->
<div class="slide" style="width: 960px; height: 540px;">
  ...
</div>
```

### 2. 样式写法

**推荐使用内联样式**，这样可以确保导出时样式被正确读取：

```html
<!-- 推荐：内联样式 -->
<div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 60px;">
  <h1 style="color: white; font-size: 48px;">标题</h1>
</div>
```

如果使用 `<style>` 标签，确保样式在导出时能被正确应用：

```html
<style>
  .slide { ... }
  .title { ... }
</style>
<div class="slide">
  <h1 class="title">标题</h1>
</div>
```

### 3. 定位方式

| 定位方式 | 支持程度 | 说明 |
|---------|---------|------|
| `position: relative` | ✅ 完全支持 | 推荐用于容器 |
| `position: absolute` | ✅ 完全支持 | 确保父级有 `position: relative` |
| `display: flex` | ✅ 支持 | 库会读取计算后的位置 |
| `display: grid` | ✅ 支持 | 库会读取计算后的位置 |
| `transform: translate()` | ⚠️ 部分支持 | 仅支持 `rotate`，不支持 `translate/scale` |

---

## 支持的 CSS 属性

### 完全支持

| 属性 | 示例 |
|------|------|
| 背景颜色 | `background: #fff` / `background: rgba(0,0,0,0.5)` |
| 线性渐变 | `background: linear-gradient(135deg, #667eea, #764ba2)` |
| 圆角 | `border-radius: 16px` / `border-radius: 50%` |
| 边框 | `border: 1px solid #ccc` |
| 阴影 | `box-shadow: 0 4px 20px rgba(0,0,0,0.2)` |
| 字体样式 | `font-size`, `font-weight`, `font-family`, `color` |
| 文字变换 | `text-transform: uppercase` |
| 字间距 | `letter-spacing: 2px` |
| 内边距 | `padding: 20px` |
| 透明度 | `opacity: 0.8` |
| 模糊效果 | `filter: blur(10px)` |

### 不支持或有限支持

| 属性 | 状态 | 替代方案 |
|------|------|---------|
| `backdrop-filter` | ❌ 不支持 | 使用半透明背景色 |
| `transform: scale()` | ❌ 不支持 | 直接设置元素尺寸 |
| `animation` | ❌ 不支持 | 无 |
| `transition` | ❌ 不支持 | 无 |
| 径向渐变 | ⚠️ 有限支持 | 建议使用线性渐变 |
| `text-shadow` | ⚠️ 有限支持 | 可能不完全还原 |

---

## 图片处理

### 1. 使用网络图片

图片必须使用**完整的 HTTPS URL**，且服务器需要支持 CORS：

```html
<!-- ✅ 正确 -->
<img src="https://images.unsplash.com/photo-xxx?w=400" />

<!-- ❌ 错误：相对路径 -->
<img src="./images/photo.jpg" />

<!-- ❌ 错误：本地文件 -->
<img src="file:///Users/xxx/photo.jpg" />
```

### 2. 圆角图片

库会自动处理圆角图片，无需额外操作：

```html
<img
  src="https://example.com/avatar.jpg"
  style="width: 100px; height: 100px; border-radius: 50%;"
/>
```

### 3. 背景图片

背景图片同样需要使用完整 URL：

```html
<!-- ✅ 正确 -->
<div style="background: url('https://example.com/bg.jpg') center/cover;"></div>

<!-- ❌ 错误 -->
<div style="background: url('./bg.jpg') center/cover;"></div>
```

---

## 字体处理

### 自动字体嵌入

库默认会自动检测并嵌入使用的字体（`autoEmbedFonts: true`）。

### Google Fonts 使用

使用 Google Fonts 时，需要添加 `crossorigin` 属性：

```html
<!-- ✅ 正确 -->
<link
  href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap"
  rel="stylesheet"
  crossorigin="anonymous"
/>

<!-- ❌ 可能无法嵌入字体 -->
<link
  href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

### 手动指定字体

如果自动检测失败，可以手动指定：

```javascript
await exportToPptx('#slide', {
  fileName: 'slide.pptx',
  fonts: [
    {
      name: 'Roboto',
      url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2',
    },
  ],
});
```

---

## 常见问题排查

### 1. 导出位置错乱

**原因**：导出时 DOM 元素受到 CSS `transform`、`flex` 布局或父容器影响。

**解决方案**：
- 确保导出的元素没有被 `transform: scale()` 影响
- 将要导出的 HTML 放到一个干净的容器中（无 flex/grid 影响）
- 参考 demo.html 中的 `#export-stage` 实现

### 2. 图片导出失败

**原因**：
- 图片 URL 无法访问
- 图片服务器不支持 CORS
- 使用了相对路径

**解决方案**：
- 使用支持 CORS 的图片服务（如 Unsplash、Cloudinary）
- 将图片转为 Base64 内联

### 3. 字体显示为 Arial

**原因**：字体无法嵌入，PowerPoint 回退到默认字体。

**解决方案**：
- 确保字体 URL 可访问
- 检查 CORS 设置
- 手动指定字体配置

### 4. 渐变显示不正确

**原因**：复杂的渐变语法可能无法完全解析。

**解决方案**：
- 使用标准的 `linear-gradient` 语法
- 避免使用 `radial-gradient` 或复杂的多色渐变
- 测试后调整颜色值

---

## Demo 使用说明

项目提供了一个本地 demo 页面 `demo.html`，可以直接在浏览器中打开测试。

### 功能

1. **HTML 编辑器**：左侧输入 HTML 代码（支持完整页面或片段）
2. **实时预览**：右侧自动渲染预览
3. **一键导出**：点击右上角按钮导出 PPTX

### 支持的 HTML 格式

**片段模式**（推荐）：

```html
<div class="slide" style="width: 960px; height: 540px; ...">
  <h1>标题</h1>
</div>
```

**完整页面模式**：

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .slide { width: 960px; height: 540px; }
    .title { font-size: 48px; }
  </style>
</head>
<body>
  <div class="slide">
    <h1 class="title">标题</h1>
  </div>
</body>
</html>
```

---

## 最佳实践总结

1. **使用固定尺寸**：容器使用 `1920x1080` 或 `960x540`（16:9）
2. **优先内联样式**：确保样式能被正确读取
3. **图片用完整 URL**：避免相对路径，确保 CORS 可访问
4. **简化渐变**：使用标准 `linear-gradient` 语法
5. **测试字体**：使用 Google Fonts 时添加 `crossorigin` 属性
6. **避免 transform**：不要在要导出的元素上使用 `scale()` 或 `translate()`
7. **检查控制台**：导出失败时查看浏览器控制台的错误信息

---

## API 参考

```javascript
exportToPptx(elementOrSelector, options)
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `elementOrSelector` | `string \| HTMLElement \| Array` | DOM 元素或选择器 |
| `options.fileName` | `string` | 文件名，默认 `"export.pptx"` |
| `options.autoEmbedFonts` | `boolean` | 自动嵌入字体，默认 `true` |
| `options.fonts` | `Array<{name, url}>` | 手动指定字体 |
| `options.skipDownload` | `boolean` | 不自动下载，返回 Blob |
| `options.listConfig` | `object` | 列表样式配置 |

### 返回值

`Promise<Blob>` - 生成的 PPTX 文件 Blob 对象
