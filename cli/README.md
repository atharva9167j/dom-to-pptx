# dom-to-pptx CLI

在 Linux/Mac 服务器上将 HTML 文件转换为 PowerPoint (PPTX) 的命令行工具。

## 原理

使用 Puppeteer（无头 Chrome）加载 HTML，然后调用 dom-to-pptx 库进行转换。

## 安装

```bash
cd cli
npm install
```

### Linux 服务器额外依赖

在 Ubuntu/Debian 上需要安装 Chrome 依赖：

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  wget
```

或使用 Docker（见下方）。

## 使用方法

### 基本用法

```bash
# 转换本地 HTML 文件
node html2pptx.js slide.html

# 指定输出文件名
node html2pptx.js slide.html output.pptx

# 转换网页 URL
node html2pptx.js https://example.com/slide.html

# 指定幻灯片选择器
node html2pptx.js slide.html -s "#my-slide"

# 指定视口尺寸
node html2pptx.js slide.html -w 1920 --height 1080
```

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `input` | 输入 HTML 文件或 URL | (必填) |
| `output` | 输出 PPTX 文件路径 | `<input>.pptx` |
| `-s, --selector` | 幻灯片元素选择器 | `.slide` |
| `-w, --width` | 视口宽度 | `1920` |
| `--height` | 视口高度 | `1080` |

## HTML 文件要求

1. 幻灯片容器需要有 `class="slide"` 或指定的选择器
2. 使用固定尺寸（推荐 1920x1080 或 960x540）
3. 图片使用完整 URL（不能用相对路径）

示例 HTML：

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .slide {
      width: 960px;
      height: 540px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      padding: 60px;
      font-family: Arial, sans-serif;
    }
    h1 { color: white; font-size: 48px; }
  </style>
</head>
<body>
  <div class="slide">
    <h1>Hello World</h1>
  </div>
</body>
</html>
```

## Docker 使用

如果不想安装 Chrome 依赖，可以使用 Docker：

```dockerfile
FROM node:18-slim

# 安装 Chrome 依赖
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json html2pptx.js ./
RUN npm install

ENTRYPOINT ["node", "html2pptx.js"]
```

构建和使用：

```bash
# 构建镜像
docker build -t html2pptx .

# 转换文件（挂载当前目录）
docker run --rm -v $(pwd):/data html2pptx /data/slide.html /data/output.pptx
```

## 批量转换

```bash
# 转换目录下所有 HTML 文件
for f in *.html; do
  node html2pptx.js "$f" "${f%.html}.pptx"
done
```

## 常见问题

### 1. 启动失败：缺少依赖

```
Error: Failed to launch the browser process
```

解决：安装 Chrome 依赖（见上方 Linux 安装说明）

### 2. 图片未显示

原因：图片使用了相对路径或无法访问

解决：使用完整的 https:// URL

### 3. 字体显示异常

原因：服务器上没有安装对应字体

解决：
- 使用 Web 字体（Google Fonts）
- 或在服务器上安装字体

### 4. 转换超时

原因：页面加载慢或网络问题

解决：增加超时时间（修改代码中的 timeout 参数）

## License

MIT
