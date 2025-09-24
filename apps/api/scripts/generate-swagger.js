const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const fs = require('fs');
const path = require('path');

async function generateSwaggerSpec() {
  try {
    // 动态导入 AppModule
    const { AppModule } = await import('../dist/src/app.module.js');

    const app = await NestFactory.create(AppModule, {
      logger: false, // 关闭日志以避免输出干扰
    });

    const config = new DocumentBuilder()
      .setTitle('Sylis API')
      .setDescription('Sylis 英语学习平台 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // 确保输出目录存在
    const outputDir = path.join(__dirname, '../dist/swagger');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存 JSON 规范
    fs.writeFileSync(
      path.join(outputDir, 'swagger-spec.json'),
      JSON.stringify(document, null, 2),
    );

    // 生成简单的 HTML 页面来显示 Swagger UI
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sylis API 文档</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: './swagger-spec.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
  `.trim();

    fs.writeFileSync(path.join(outputDir, 'index.html'), htmlContent);

    await app.close();
    console.log('Swagger 文档已生成到 dist/swagger/');
  } catch (error) {
    console.error('Swagger 生成失败:', error.message);

    // 即使应用启动失败，也生成一个基本的 Swagger 页面
    const outputDir = path.join(__dirname, '../dist/swagger');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 生成基本的 HTML 页面
    const basicHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sylis API 文档</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
    .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .info { color: #1976d2; background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>🚧 Sylis API 文档</h1>
  <div class="error">
    <h3>文档生成过程中遇到问题</h3>
    <p>API 文档暂时无法生成，这通常是由于缺少运行时依赖（如数据库连接）导致的。</p>
  </div>
  <div class="info">
    <h3>开发环境访问</h3>
    <p>请在开发环境中访问: <a href="http://localhost:3000/swagger">http://localhost:3000/swagger</a></p>
  </div>
</body>
</html>
    `.trim();

    fs.writeFileSync(path.join(outputDir, 'index.html'), basicHtml);
    console.log('已生成备用 Swagger 页面');

    // 不抛出错误，让构建继续
    process.exit(0);
  }
}

generateSwaggerSpec().catch((error) => {
  console.error('Critical error:', error);
  process.exit(1);
});
