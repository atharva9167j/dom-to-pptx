# HTML 格式 PPT 规范与约束

本文档详细说明使用 dom-to-pptx 库时，HTML 需要遵循的规范和约束。

---

## 一、幻灯片容器结构

### 1.1 基本要求

```html
<div class="slide" style="
  width: 960px;       /* 固定宽度 */
  height: 540px;      /* 固定高度 */
  position: relative;
  overflow: hidden;
">
  <!-- 幻灯片内容 -->
</div>
```

### 1.2 尺寸规范

| 比例 | 推荐尺寸 | 说明 |
|------|---------|------|
| 16:9 | 1920×1080 | 高清，适合大屏演示 |
| 16:9 | 960×540 | 标准，平衡性能与清晰度 |
| 4:3 | 1024×768 | 传统比例 |

> **重要**: 必须使用固定像素尺寸，不能使用百分比或视口单位（vw/vh）

### 1.3 多幻灯片结构

```html
<body>
  <div class="slide">第一页</div>
  <div class="slide">第二页</div>
  <div class="slide">第三页</div>
</body>
```

---

## 二、图片资源约束

### 2.1 URL 要求

```html
<!-- ✅ 正确：完整 HTTPS URL -->
<img src="https://images.unsplash.com/photo-xxx" />

<!-- ❌ 错误：相对路径 -->
<img src="./images/photo.jpg" />

<!-- ❌ 错误：无协议 URL -->
<img src="//example.com/image.jpg" />
```

### 2.2 CORS 设置

```html
<!-- 必须添加 crossorigin 属性 -->
<img crossorigin="anonymous" src="https://example.com/image.jpg" />
```

### 2.3 背景图片

```css
/* ✅ 正确 */
.element {
  background-image: url('https://example.com/bg.jpg');
}

/* ❌ 错误 */
.element {
  background-image: url('./bg.jpg');
}
```

---

## 三、字体约束

### 3.1 Web 字体引入

```html
<!-- Google Fonts 需添加 crossorigin -->
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
  rel="stylesheet"
  crossorigin="anonymous"
/>
```

### 3.2 自定义字体

```css
@font-face {
  font-family: 'CustomFont';
  src: url('https://example.com/fonts/custom.woff2') format('woff2');
  /* 字体文件必须支持 CORS */
}
```

### 3.3 字体回退策略

```css
.text {
  /* 推荐：提供多个回退字体 */
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
```

---

## 四、CSS 样式支持

### 4.1 完全支持的样式

| 类别 | 属性 | 示例 |
|------|------|------|
| **背景色** | `background-color` | `#fff`, `rgba(0,0,0,0.5)`, `oklch(...)` |
| **渐变** | `linear-gradient` | `linear-gradient(135deg, #667eea, #764ba2)` |
| **边框** | `border` | `1px solid #ccc` |
| **圆角** | `border-radius` | `12px`, `50%`, `10px 20px 30px 40px` |
| **阴影** | `box-shadow` | `0 4px 20px rgba(0,0,0,0.15)` |
| **透明度** | `opacity` | `0.8` |
| **旋转** | `transform: rotate()` | `rotate(45deg)` |
| **模糊** | `filter: blur()` | `blur(10px)` |

### 4.2 文本样式

| 属性 | 支持 | 说明 |
|------|------|------|
| `color` | ✅ | 支持所有颜色格式 |
| `font-size` | ✅ | 自动转换为磅值 |
| `font-weight` | ✅ | ≥600 视为粗体 |
| `font-style` | ✅ | italic 支持 |
| `text-align` | ✅ | left/center/right |
| `line-height` | ✅ | 转换为行间距 |
| `text-decoration` | ✅ | underline 支持 |
| `text-transform` | ✅ | uppercase/lowercase |

### 4.3 不支持的样式

| 样式 | 状态 | 替代方案 |
|------|------|---------|
| `backdrop-filter: blur()` | ❌ | 使用半透明背景色 |
| `transform: scale()` | ❌ | 直接设置元素尺寸 |
| `transform: translate()` | ❌ | 使用 position 定位 |
| `transform: skew()` | ❌ | 无替代 |
| CSS 动画 | ❌ | 只捕获静态状态 |
| CSS 过渡 | ❌ | 只捕获静态状态 |
| `radial-gradient` | ⚠️ | 建议使用 linear-gradient |
| `conic-gradient` | ❌ | 使用 linear-gradient |
| `text-shadow` | ⚠️ | 有限支持 |
| `mix-blend-mode` | ❌ | 无替代 |

---

## 五、布局约束

### 5.1 推荐使用

```css
/* ✅ 绝对定位（最可靠） */
.element {
  position: absolute;
  top: 100px;
  left: 50px;
}

/* ✅ Flexbox（库会读取计算后位置） */
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* ✅ Grid（库会读取计算后位置） */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
```

### 5.2 注意事项

- 库不直接解析 Flexbox/Grid 定义
- 而是测量每个元素的**最终计算位置**
- 然后在 PPTX 中使用绝对定位还原

---

## 六、支持的 HTML 元素

### 6.1 完全支持

| 元素 | 转换方式 |
|------|---------|
| `div`, `section`, `article` | 矩形形状 |
| `span`, `p`, `h1-h6` | 文本框 |
| `img` | 图片对象 |
| `svg` | 转 PNG 后插入 |
| `canvas` | 截图后插入 |
| `table`, `tr`, `td`, `th` | 原生表格 |
| `ul`, `ol`, `li` | 原生列表 |
| `a`, `button` | 文本/形状 |

### 6.2 有限支持

| 元素 | 限制 |
|------|------|
| 嵌套列表 | 可能被扁平化 |
| `input`, `textarea` | 仅提取文本值 |
| `video`, `audio` | 不支持 |
| `iframe` | 不支持 |

---

## 七、完整示例模板

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
    rel="stylesheet"
    crossorigin="anonymous"
  />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    .slide {
      width: 960px;
      height: 540px;
      position: relative;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }

    /* 幻灯片 1：渐变背景 */
    .slide-1 {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 60px;
    }

    .slide-1 h1 {
      color: white;
      font-size: 48px;
      font-weight: 700;
    }

    .slide-1 p {
      color: rgba(255, 255, 255, 0.9);
      font-size: 24px;
      margin-top: 20px;
    }

    /* 卡片样式 */
    .card {
      position: absolute;
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
  </style>
</head>
<body>
  <!-- 幻灯片 1 -->
  <div class="slide slide-1">
    <h1>演示标题</h1>
    <p>这是一个符合规范的 HTML PPT 示例</p>

    <div class="card" style="bottom: 60px; left: 60px; width: 380px;">
      <h3 style="font-size: 20px; color: #333;">特性一</h3>
      <p style="font-size: 14px; color: #666; margin-top: 8px;">
        支持渐变背景、圆角、阴影等现代 CSS 特性
      </p>
    </div>

    <div class="card" style="bottom: 60px; right: 60px; width: 380px;">
      <h3 style="font-size: 20px; color: #333;">特性二</h3>
      <p style="font-size: 14px; color: #666; margin-top: 8px;">
        高保真还原，自动嵌入字体
      </p>
    </div>

    <img
      crossorigin="anonymous"
      src="https://images.unsplash.com/photo-1557683316-973673baf926?w=200"
      style="position: absolute; top: 60px; right: 60px; width: 120px; border-radius: 8px;"
    />
  </div>

  <!-- 幻灯片 2 -->
  <div class="slide" style="background: #f5f5f5; padding: 60px;">
    <h2 style="font-size: 36px; color: #333;">数据展示</h2>

    <table style="
      margin-top: 40px;
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    ">
      <tr style="background: #667eea; color: white;">
        <th style="padding: 16px; text-align: left;">项目</th>
        <th style="padding: 16px; text-align: left;">状态</th>
        <th style="padding: 16px; text-align: left;">进度</th>
      </tr>
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #eee;">任务 A</td>
        <td style="padding: 16px; border-bottom: 1px solid #eee;">进行中</td>
        <td style="padding: 16px; border-bottom: 1px solid #eee;">75%</td>
      </tr>
      <tr>
        <td style="padding: 16px;">任务 B</td>
        <td style="padding: 16px;">已完成</td>
        <td style="padding: 16px;">100%</td>
      </tr>
    </table>
  </div>
</body>
</html>
```

---

## 八、检查清单

在转换前，请确认：

- [ ] 幻灯片容器使用固定像素尺寸
- [ ] 所有图片使用完整 HTTPS URL
- [ ] 图片元素添加 `crossorigin="anonymous"`
- [ ] Web 字体链接添加 `crossorigin="anonymous"`
- [ ] 未使用不支持的 CSS 属性（动画、scale、translate 等）
- [ ] 未使用相对路径引用资源
- [ ] 幻灯片选择器与 CLI 参数匹配（默认 `.slide`）

---

## 九、常见问题

### Q: 为什么图片显示为空白？
A: 检查图片 URL 是否完整（https://）以及是否添加了 `crossorigin="anonymous"`

### Q: 为什么字体没有正确显示？
A: 确保字体 CSS 链接添加了 `crossorigin` 属性，且字体服务器支持 CORS

### Q: 为什么元素位置有偏差？
A: 避免使用 `transform: translate()`，改用 `position` + `top/left/right/bottom`

### Q: 为什么动画效果丢失？
A: 库只捕获静态状态，CSS 动画和过渡不会被转换
