#!/usr/bin/env node

/**
 * dom-to-pptx CLI - 在服务器上将 HTML 转换为 PPTX
 *
 * 使用方法:
 *   node html2pptx.js input.html output.pptx
 *   node html2pptx.js input.html                    # 输出到 input.pptx
 *   node html2pptx.js https://example.com/page.html # 支持 URL
 *
 * 依赖安装:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
dom-to-pptx CLI - HTML 转 PowerPoint 命令行工具

使用方法:
  node html2pptx.js <input> [output]

参数:
  input     输入的 HTML 文件路径或 URL
  output    输出的 PPTX 文件路径（可选，默认与输入同名）

选项:
  --selector, -s    指定幻灯片元素选择器（默认: .slide）
                    选择器匹配多个元素时，将导出为多页
  --width, -w       视口宽度（默认: 1920）
  --height, -h      视口高度（默认: 1080）
  --help            显示帮助信息

示例:
  node html2pptx.js slide.html
  node html2pptx.js slide.html output.pptx
  node html2pptx.js slide.html -s "#my-slide"
  node html2pptx.js https://example.com/slide.html
`);
  process.exit(0);
}

// 解析参数
let input = null;
let output = null;
let selector = '.slide';
let viewportWidth = 1920;
let viewportHeight = 1080;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--selector' || arg === '-s') {
    selector = args[++i];
  } else if (arg === '--width' || arg === '-w') {
    viewportWidth = parseInt(args[++i]);
  } else if (arg === '--height') {
    viewportHeight = parseInt(args[++i]);
  } else if (!input) {
    input = arg;
  } else if (!output) {
    output = arg;
  }
}

if (!input) {
  console.error('错误: 请指定输入文件');
  process.exit(1);
}

// 确定输出文件名
if (!output) {
  const inputBase = path.basename(input).replace(/\.(html?|url)$/i, '');
  output = inputBase + '.pptx';
}

// 判断是 URL 还是文件路径
const isUrl = /^https?:\/\//i.test(input);

async function convert() {
  console.log(`📄 输入: ${input}`);
  console.log(`📦 输出: ${output}`);
  console.log(`🎯 选择器: ${selector}`);
  console.log('');

  let browser;

  try {
    // 启动浏览器
    console.log('🚀 启动浏览器...');
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    const page = await context.newPage();

    // 加载页面
    console.log('📖 加载页面...');
    if (isUrl) {
      await page.goto(input, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
      // 本地文件
      const htmlPath = path.resolve(input);
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`文件不存在: ${htmlPath}`);
      }
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    }

    // 等待页面完全加载
    await page.waitForTimeout(1000);

    // 注入 dom-to-pptx 库
    console.log('💉 注入 dom-to-pptx...');
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/dom-to-pptx@latest/dist/dom-to-pptx.bundle.js',
    });

    // 等待库加载
    await page.waitForFunction(() => typeof window.domToPptx !== 'undefined', {
      timeout: 10000,
    });

    // 检查选择器是否存在（至少一个元素）
    const initialCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, selector);

    if (initialCount === 0) {
      // 尝试常见的选择器
      const fallbackSelectors = ['.slide', '#slide', '[class*="slide"]', 'body > div:first-child'];
      let found = false;

      for (const fallback of fallbackSelectors) {
        const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, fallback);
        if (count > 0) {
          console.log(`⚠️  未找到 "${selector}"，使用 "${fallback}"`);
          selector = fallback;
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error(`未找到幻灯片元素，尝试的选择器: ${selector}`);
      }
    }

    const slideCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, selector);

    console.log(`🧩 幻灯片数量: ${slideCount}`);

    // 执行导出
    console.log('⚙️  正在转换...');
    const pptxBase64 = await page.evaluate(async (sel) => {
      const elements = Array.from(document.querySelectorAll(sel));
      if (elements.length === 0) {
        throw new Error('Element not found');
      }

      const target = elements.length === 1 ? elements[0] : elements;
      const blob = await window.domToPptx.exportToPptx(target, {
        skipDownload: true,
      });

      // 转换为 Base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, selector);

    // 保存文件
    console.log('💾 保存文件...');
    const buffer = Buffer.from(pptxBase64, 'base64');
    fs.writeFileSync(output, buffer);

    console.log('');
    console.log(`✅ 转换完成: ${output}`);
    console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB`);

    await context.close();

  } catch (error) {
    console.error('');
    console.error('❌ 转换失败:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

convert();