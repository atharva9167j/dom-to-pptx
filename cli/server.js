#!/usr/bin/env node

/**
 * dom-to-pptx HTTP Server - 单节点高并发服务 + MCP 支持
 *
 * 启动: node server.js
 * 端口: 3000 (可通过 PORT 环境变量修改)
 *
 * API:
 *   POST /convert       - 转换 HTML 为 PPTX (JSON 格式)
 *   POST /upload        - 上传 HTML 文件并返回 PPTX 文件
 *   GET  /health        - 健康检查
 *   GET  /stats         - 服务状态
 *
 * MCP:
 *   POST /mcp           - MCP Streamable HTTP 端点
 *   GET  /mcp           - MCP SSE 端点 (用于服务器推送)
 *   DELETE /mcp         - MCP 会话终止
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { URL } = require('url');
const crypto = require('crypto');

// MCP SDK
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

// 预加载 dom-to-pptx bundle (避免每次从 CDN 加载)
const DOM_TO_PPTX_SCRIPT = fs.readFileSync(
  path.join(__dirname, 'dom-to-pptx.bundle.js'),
  'utf8'
);

// ============== 配置 ==============
const CONFIG = {
  port: parseInt(process.env.PORT) || 3000,
  // 浏览器池
  pool: {
    min: 2,                    // 最小浏览器数
    max: parseInt(process.env.POOL_MAX) || 5,  // 最大浏览器数
    idleTimeout: 60000,        // 空闲超时 (ms)
  },
  // 转换
  convert: {
    timeout: 60000,            // 单次转换超时 (ms)
    queueMax: 100,             // 最大排队数
  },
  viewport: {
    width: 1920,
    height: 1080,
  },
};

// ============== 浏览器池 ==============
class BrowserPool {
  constructor(options) {
    this.min = options.min;
    this.max = options.max;
    this.idleTimeout = options.idleTimeout;

    this.available = [];       // 可用的浏览器
    this.inUse = new Set();    // 使用中的浏览器
    this.pending = [];         // 等待获取浏览器的请求
    this.closed = false;

    // 统计
    this.stats = {
      created: 0,
      destroyed: 0,
      acquired: 0,
      released: 0,
      timeouts: 0,
    };
  }

  async init() {
    console.log(`🚀 初始化浏览器池 (min=${this.min}, max=${this.max})...`);
    const promises = [];
    for (let i = 0; i < this.min; i++) {
      promises.push(this._createBrowser());
    }
    const browsers = await Promise.all(promises);
    this.available.push(...browsers);
    console.log(`✅ 浏览器池就绪，当前 ${this.available.length} 个实例`);
  }

  async _createBrowser() {
    const browser = await chromium.launch({
      headless: true,
    });

    browser._poolCreatedAt = Date.now();
    browser._poolLastUsed = Date.now();
    this.stats.created++;

    return browser;
  }

  async acquire(timeout = 30000) {
    if (this.closed) {
      throw new Error('Pool is closed');
    }

    // 有可用的，直接返回
    if (this.available.length > 0) {
      const browser = this.available.pop();
      browser._poolLastUsed = Date.now();
      this.inUse.add(browser);
      this.stats.acquired++;
      return browser;
    }

    // 没达到上限，创建新的
    const total = this.available.length + this.inUse.size;
    if (total < this.max) {
      const browser = await this._createBrowser();
      this.inUse.add(browser);
      this.stats.acquired++;
      return browser;
    }

    // 达到上限，排队等待
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pending.findIndex(p => p.resolve === resolve);
        if (idx !== -1) {
          this.pending.splice(idx, 1);
        }
        this.stats.timeouts++;
        reject(new Error('Acquire browser timeout'));
      }, timeout);

      this.pending.push({ resolve, reject, timer });
    });
  }

  async release(browser) {
    if (!this.inUse.has(browser)) {
      return;
    }

    this.inUse.delete(browser);
    this.stats.released++;
    browser._poolLastUsed = Date.now();

    // 检查浏览器是否还健康
    let healthy = true;
    try {
      const contexts = browser.contexts();
      // 关闭多余 context，保留一个
      for (let i = 1; i < contexts.length; i++) {
        await contexts[i].close().catch(() => {});
      }
    } catch {
      healthy = false;
    }

    if (!healthy) {
      await this._destroyBrowser(browser);
      return;
    }

    // 有等待的请求，直接分配
    if (this.pending.length > 0) {
      const { resolve, timer } = this.pending.shift();
      clearTimeout(timer);
      browser._poolLastUsed = Date.now();
      this.inUse.add(browser);
      this.stats.acquired++;
      resolve(browser);
      return;
    }

    // 放回可用池
    this.available.push(browser);
  }

  async _destroyBrowser(browser) {
    try {
      await browser.close();
    } catch {}
    this.stats.destroyed++;
  }

  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      pending: this.pending.length,
      total: this.available.length + this.inUse.size,
      ...this.stats,
    };
  }

  async close() {
    this.closed = true;

    // 拒绝所有等待的请求
    for (const { reject, timer } of this.pending) {
      clearTimeout(timer);
      reject(new Error('Pool is closing'));
    }
    this.pending = [];

    // 关闭所有浏览器
    const all = [...this.available, ...this.inUse];
    await Promise.all(all.map(b => this._destroyBrowser(b)));
    this.available = [];
    this.inUse.clear();
  }
}

// ============== 转换器 ==============
class Converter {
  constructor(pool) {
    this.pool = pool;
    this.queue = 0;
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
    };
  }

  async convert(options) {
    const { html, url, selector = '.slide', viewport } = options;

    if (this.queue >= CONFIG.convert.queueMax) {
      throw new Error('Server is busy, try again later');
    }

    this.queue++;
    this.stats.total++;

    let browser;
    try {
      browser = await this.pool.acquire(CONFIG.convert.timeout);
      const result = await this._doConvert(browser, { html, url, selector, viewport });
      this.stats.success++;
      return result;
    } catch (err) {
      this.stats.failed++;
      throw err;
    } finally {
      this.queue--;
      if (browser) {
        await this.pool.release(browser);
      }
    }
  }

  async _doConvert(browser, { html, url, selector, viewport }) {
    const context = await browser.newContext({
      viewport: viewport || CONFIG.viewport,
    });

    const page = await context.newPage();

    try {
      // 设置超时
      page.setDefaultTimeout(CONFIG.convert.timeout);

      // 加载内容 (使用 domcontentloaded 更快)
      if (url) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else if (html) {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
      } else {
        throw new Error('Missing html or url parameter');
      }

      // 短暂等待渲染
      await page.waitForTimeout(100);

      // 注入本地 dom-to-pptx (无需网络请求)
      await page.evaluate((script) => {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = script;
        document.head.appendChild(scriptEl);
      }, DOM_TO_PPTX_SCRIPT);

      // 确认加载成功
      await page.waitForFunction(() => typeof window.domToPptx !== 'undefined', {
        timeout: 5000,
      });

      // 检查选择器
      const elementExists = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length > 0;
      }, selector);

      let finalSelector = selector;
      if (!elementExists) {
        const fallbacks = ['.slide', '#slide', '[class*="slide"]', 'body > div:first-child', 'body'];
        for (const fb of fallbacks) {
          const exists = await page.evaluate((sel) => document.querySelectorAll(sel).length > 0, fb);
          if (exists) {
            finalSelector = fb;
            break;
          }
        }
      }

      // 转换
      const pptxBase64 = await page.evaluate(async (sel) => {
        const elements = Array.from(document.querySelectorAll(sel));
        if (elements.length === 0) throw new Error('Element not found: ' + sel);
        const target = elements.length === 1 ? elements[0] : elements;
        const blob = await window.domToPptx.exportToPptx(target, { skipDownload: true });

        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }, finalSelector);

      return {
        success: true,
        data: pptxBase64,
        selector: finalSelector,
      };

    } finally {
      await context.close().catch(() => {});
    }
  }

  getStats() {
    return {
      queue: this.queue,
      ...this.stats,
    };
  }
}

// ============== MCP Server ==============
function createMcpServer(converter) {
  const server = new McpServer({
    name: 'dom-to-pptx',
    version: '1.0.0',
  });

  // 注册 convert_html_to_pptx 工具 (使用 zod schema)
  server.tool(
    'convert_html_to_pptx',
    '将 HTML 内容或 URL 转换为 PowerPoint (PPTX) 文件。返回 base64 编码的 PPTX 数据。',
    {
      html: z.string().optional().describe('HTML 内容字符串。与 url 参数二选一。'),
      url: z.string().optional().describe('要转换的网页 URL。与 html 参数二选一。'),
      selector: z.string().optional().default('.slide').describe('要转换为幻灯片的元素选择器，默认为 ".slide"'),
      viewportWidth: z.number().optional().describe('视口宽度，默认 1920'),
      viewportHeight: z.number().optional().describe('视口高度，默认 1080'),
    },
    async (args) => {
      const { html, url, selector = '.slide', viewportWidth, viewportHeight } = args;

      console.log('MCP tool called with args:', JSON.stringify(args).slice(0, 200));

      if (!html && !url) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: '必须提供 html 或 url 参数' }) }],
          isError: true,
        };
      }

      const viewport = (viewportWidth || viewportHeight) ? {
        width: viewportWidth || 1920,
        height: viewportHeight || 1080,
      } : undefined;

      try {
        const result = await converter.convert({ html, url, selector, viewport });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'PPTX 转换成功',
              selector: result.selector,
              data: result.data,
              dataLength: result.data.length,
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ============== HTTP 服务 ==============
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 解析 multipart/form-data 请求
 * @param {http.IncomingMessage} req
 * @returns {Promise<{fields: Object, files: Array<{name: string, filename: string, contentType: string, data: Buffer}>}>}
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!boundaryMatch) {
      reject(new Error('Missing boundary in content-type'));
      return;
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];
    let totalSize = 0;
    const maxSize = 50 * 1024 * 1024; // 50MB limit

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        reject(new Error('File too large (max 50MB)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = { fields: {}, files: [] };

        // 分割各部分
        const boundaryBuffer = Buffer.from('--' + boundary);
        const parts = [];
        let start = 0;
        let idx;

        while ((idx = buffer.indexOf(boundaryBuffer, start)) !== -1) {
          if (start > 0) {
            // 去除前面的 \r\n
            let partStart = start;
            let partEnd = idx - 2; // 去除末尾的 \r\n
            if (partEnd > partStart) {
              parts.push(buffer.subarray(partStart, partEnd));
            }
          }
          start = idx + boundaryBuffer.length;
          // 跳过可能的 \r\n
          if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) {
            start += 2;
          }
        }

        // 解析每个部分
        for (const part of parts) {
          // 找到头部和内容的分隔 (\r\n\r\n)
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;

          const headerStr = part.subarray(0, headerEnd).toString('utf8');
          const content = part.subarray(headerEnd + 4);

          // 解析头部
          const headers = {};
          for (const line of headerStr.split('\r\n')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
              const key = line.slice(0, colonIdx).trim().toLowerCase();
              const value = line.slice(colonIdx + 1).trim();
              headers[key] = value;
            }
          }

          const disposition = headers['content-disposition'] || '';
          const nameMatch = disposition.match(/name="([^"]+)"/);
          const filenameMatch = disposition.match(/filename="([^"]+)"/);

          if (!nameMatch) continue;

          const fieldName = nameMatch[1];

          if (filenameMatch) {
            // 这是一个文件
            result.files.push({
              name: fieldName,
              filename: filenameMatch[1],
              contentType: headers['content-type'] || 'application/octet-stream',
              data: content,
            });
          } else {
            // 这是一个普通字段
            result.fields[fieldName] = content.toString('utf8');
          }
        }

        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse multipart data: ' + err.message));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendBinary(res, buffer, filename) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buffer);
}

async function startServer() {
  // 初始化
  const pool = new BrowserPool(CONFIG.pool);
  await pool.init();

  const converter = new Converter(pool);
  const startTime = Date.now();

  // MCP 会话管理
  const mcpTransports = new Map(); // sessionId -> transport

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id',
      });
      res.end();
      return;
    }

    try {
      // ============== MCP 端点 ==============
      if (pathname === '/mcp') {
        // 添加 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

        if (req.method === 'POST') {
          // 检查是否有现有会话
          const sessionId = req.headers['mcp-session-id'];
          let transport = sessionId ? mcpTransports.get(sessionId) : null;

          if (!transport) {
            // 创建新的 MCP 会话
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
              onsessioninitialized: (newSessionId) => {
                mcpTransports.set(newSessionId, transport);
                console.log(`🔗 MCP 会话已创建: ${newSessionId}`);
              },
            });

            // 创建并连接 MCP server
            const mcpServer = createMcpServer(converter);
            await mcpServer.connect(transport);

            // 会话关闭时清理
            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && mcpTransports.has(sid)) {
                mcpTransports.delete(sid);
                console.log(`🔌 MCP 会话已关闭: ${sid}`);
              }
            };
          }

          // 处理请求
          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'GET') {
          // SSE 连接 (用于服务器推送)
          const sessionId = req.headers['mcp-session-id'];
          const transport = sessionId ? mcpTransports.get(sessionId) : null;

          if (!transport) {
            sendJson(res, 400, { error: 'Missing or invalid session ID. Send a POST request first.' });
            return;
          }

          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'DELETE') {
          // 终止会话
          const sessionId = req.headers['mcp-session-id'];
          const transport = sessionId ? mcpTransports.get(sessionId) : null;

          if (transport) {
            await transport.close();
            mcpTransports.delete(sessionId);
            console.log(`🗑️ MCP 会话已删除: ${sessionId}`);
          }

          res.writeHead(204);
          res.end();
          return;
        }

        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }

      // ============== 原有 API ==============
      // 健康检查
      if (pathname === '/health' && req.method === 'GET') {
        const poolStats = pool.getStats();
        const healthy = poolStats.available > 0 || poolStats.inUse < CONFIG.pool.max;
        sendJson(res, healthy ? 200 : 503, {
          status: healthy ? 'ok' : 'unhealthy',
          uptime: Math.floor((Date.now() - startTime) / 1000),
          mcp: {
            activeSessions: mcpTransports.size,
          },
        });
        return;
      }

      // 统计信息
      if (pathname === '/stats' && req.method === 'GET') {
        sendJson(res, 200, {
          uptime: Math.floor((Date.now() - startTime) / 1000),
          pool: pool.getStats(),
          converter: converter.getStats(),
          mcp: {
            activeSessions: mcpTransports.size,
          },
        });
        return;
      }

      // 转换 API
      if (pathname === '/convert' && req.method === 'POST') {
        const body = await parseBody(req);
        const format = url.searchParams.get('format') || 'base64';

        const result = await converter.convert({
          html: body.html,
          url: body.url,
          selector: body.selector,
          viewport: body.viewport,
        });

        if (format === 'binary') {
          const buffer = Buffer.from(result.data, 'base64');
          sendBinary(res, buffer, body.filename || 'output.pptx');
        } else {
          sendJson(res, 200, result);
        }
        return;
      }

      // 文件上传 API
      if (pathname === '/upload' && req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';

        if (!contentType.includes('multipart/form-data')) {
          sendJson(res, 400, { error: 'Content-Type must be multipart/form-data' });
          return;
        }

        const { fields, files } = await parseMultipart(req);

        // 查找上传的 HTML 文件
        const htmlFile = files.find(f => f.name === 'file' || f.name === 'html');
        if (!htmlFile) {
          sendJson(res, 400, { error: 'Missing file field. Use "file" or "html" as field name.' });
          return;
        }

        const htmlContent = htmlFile.data.toString('utf8');
        const selector = fields.selector || '.slide';
        const outputFilename = fields.filename ||
          htmlFile.filename.replace(/\.(html?|htm)$/i, '.pptx') ||
          'output.pptx';

        // 解析 viewport
        let viewport;
        if (fields.viewport) {
          try {
            viewport = JSON.parse(fields.viewport);
          } catch {
            // 忽略无效的 viewport
          }
        }

        const result = await converter.convert({
          html: htmlContent,
          selector,
          viewport,
        });

        // 上传接口直接返回文件
        const buffer = Buffer.from(result.data, 'base64');
        sendBinary(res, buffer, outputFilename);
        return;
      }

      // 404
      sendJson(res, 404, { error: 'Not found' });

    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      sendJson(res, 500, { error: err.message });
    }
  });

  // 优雅关闭
  const shutdown = async (signal) => {
    console.log(`\n📴 收到 ${signal}，正在关闭...`);

    // 关闭所有 MCP 会话
    for (const [sessionId, transport] of mcpTransports) {
      try {
        await transport.close();
        console.log(`🔌 MCP 会话已关闭: ${sessionId}`);
      } catch {}
    }
    mcpTransports.clear();

    server.close(() => {
      console.log('🔌 HTTP 服务已停止');
    });

    await pool.close();
    console.log('🌐 浏览器池已关闭');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(CONFIG.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║       dom-to-pptx Server 已启动                    ║
╠═══════════════════════════════════════════════════╣
║  地址: http://localhost:${CONFIG.port.toString().padEnd(28)}║
║  浏览器池: ${CONFIG.pool.min}-${CONFIG.pool.max} 个实例${' '.repeat(23)}║
╠═══════════════════════════════════════════════════╣
║  HTTP API:                                        ║
║    POST /convert  - 转换 HTML 为 PPTX (JSON)       ║
║    POST /upload   - 上传文件并返回 PPTX            ║
║    GET  /health   - 健康检查                       ║
║    GET  /stats    - 服务状态                       ║
╠═══════════════════════════════════════════════════╣
║  MCP (Streamable HTTP):                           ║
║    POST /mcp      - MCP 请求端点                   ║
║    GET  /mcp      - MCP SSE 端点                   ║
║    DELETE /mcp    - 终止 MCP 会话                  ║
╚═══════════════════════════════════════════════════╝
`);
  });
}

startServer().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});