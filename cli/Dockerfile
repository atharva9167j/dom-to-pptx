# dom-to-pptx 服务 Dockerfile
#
# 构建: docker build -t dom-to-pptx .
# 运行: docker run -p 3000:3000 dom-to-pptx
# 调优: docker run -p 3000:3000 -e POOL_MAX=10 dom-to-pptx

FROM node:20-slim

# 换用阿里云镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# 安装 Chromium 及中文字体
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户（安全）
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser /app \
    && chown -R pptruser:pptruser /home/pptruser /app

WORKDIR /app

# Puppeteer 使用系统 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 安装依赖
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# 复制源码和内置的 dom-to-pptx bundle
COPY server.js html2pptx.js dom-to-pptx.bundle.js ./

# 切换用户
USER pptruser

# 运行配置
ENV NODE_ENV=production \
    PORT=3000 \
    POOL_MAX=5

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
