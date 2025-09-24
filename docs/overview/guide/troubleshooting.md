# 故障排除指南

本文档帮助您解决 Sylis 项目开发和部署过程中可能遇到的常见问题。

## Docker 相关问题

### Docker 服务未启动

**问题症状**：

```bash
Error: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**解决方案**：

```bash
# macOS
brew install --cask docker
open /Applications/Docker.app

# Ubuntu/Debian
sudo systemctl start docker
sudo systemctl enable docker

# Windows
# 启动 Docker Desktop 应用程序

# 验证 Docker 是否运行
docker --version
docker ps
```

### 端口被占用

**问题症状**：

```bash
Error: bind: address already in use
Port 5432 is already in use
```

**解决方案**：

```bash
# 查找占用端口的进程
lsof -ti:5432 | xargs kill -9  # PostgreSQL
lsof -ti:6379 | xargs kill -9  # Redis
lsof -ti:3000 | xargs kill -9  # API Server
lsof -ti:5173 | xargs kill -9  # Web Server
lsof -ti:8080 | xargs kill -9  # Speech Service

# 或停止所有 Docker 容器
docker-compose down

# Windows 用户
netstat -ano | findstr :5432
taskkill /PID <PID> /F
```

### Docker 容器启动失败

**问题症状**：

```bash
Container sylis-postgres-1 exited with code 1
```

**解决方案**：

```bash
# 查看容器日志
docker-compose logs postgres
docker-compose logs redis

# 重新构建并启动
docker-compose down -v
docker-compose up -d --build

# 清理 Docker 缓存
docker system prune -a
docker volume prune
```

## 数据库问题

### 数据库连接失败

**问题症状**：

```bash
Error: connect ECONNREFUSED 127.0.0.1:5432
P1001: Can't reach database server at localhost:5432
```

**解决方案**：

```bash
# 1. 检查 Docker 容器状态
docker ps | grep postgres

# 2. 检查环境变量
echo $DATABASE_URL

# 3. 测试数据库连接
psql $DATABASE_URL -c "SELECT 1;"

# 4. 重启数据库服务
cd apps/api
docker-compose restart postgres

# 5. 重置数据库 (谨慎使用)
docker-compose down -v
docker-compose up -d postgres
pnpm prisma:dev
pnpm prisma:seed
```

### Prisma 迁移失败

**问题症状**：

```bash
Error: Migration failed to apply cleanly to the shadow database
```

**解决方案**：

```bash
# 1. 重置迁移历史
pnpm --filter ./apps/api run prisma:reset

# 2. 生成新的迁移
pnpm --filter ./apps/api run prisma:migrate dev

# 3. 如果是开发环境，可以删除迁移文件重新开始
rm -rf apps/api/prisma/migrations/*
pnpm --filter ./apps/api run prisma:migrate dev --name init

# 4. 强制重置 (会删除所有数据)
pnpm --filter ./apps/api run prisma:migrate reset --force
```

### Prisma 客户端版本不匹配

**问题症状**：

```bash
Error: Prisma Client version mismatch
```

**解决方案**：

```bash
# 重新生成 Prisma 客户端
pnpm --filter ./apps/api run prisma:generate

# 清理并重新安装
rm -rf node_modules/.prisma
pnpm install

# 如果仍有问题，升级 Prisma
pnpm update @prisma/client prisma --latest
```

## 依赖问题

### pnpm 安装失败

**问题症状**：

```bash
ERR_PNPM_PEER_DEP_ISSUES
EACCES: permission denied
```

**解决方案**：

```bash
# 1. 清理缓存
pnpm clean:cache
rm -rf node_modules package-lock.json

# 2. 修复权限问题 (macOS/Linux)
sudo chown -R $(whoami) ~/.pnpm
sudo chown -R $(whoami) ~/.npm

# 3. 重新安装
pnpm install

# 4. 如果是权限问题 (Windows)
# 以管理员身份运行 PowerShell
npm install -g pnpm --force

# 5. 忽略 peer dependencies 警告
pnpm install --no-strict-peer-dependencies
```

### Node.js 版本不兼容

**问题症状**：

```bash
Error: The engine "node" is incompatible with this module
```

**解决方案**：

```bash
# 1. 检查当前 Node.js 版本
node --version

# 2. 安装正确版本 (需要 >= 22.0.0)
# 使用 nvm (推荐)
nvm install 22
nvm use 22

# 使用 n (macOS/Linux)
sudo npm install -g n
sudo n 22

# 3. 验证版本
node --version
npm --version
```

### TypeScript 编译错误

**问题症状**：

```bash
Type 'string' is not assignable to type 'number'
Cannot find module or its corresponding type declarations
```

**解决方案**：

```bash
# 1. 清理编译缓存
rm -rf apps/web/.vite
rm -rf apps/api/dist
rm -rf apps/*/tsconfig.tsbuildinfo

# 2. 重新生成类型文件
pnpm --filter ./packages/shared run build
pnpm --filter ./apps/api run prisma:generate

# 3. 检查类型错误
pnpm typecheck

# 4. 更新 TypeScript
pnpm update typescript --latest
```

## 开发服务器问题

### 前端服务启动失败

**问题症状**：

```bash
Error: Failed to resolve import
VITE_APP_API_URL is not defined
```

**解决方案**：

```bash
# 1. 检查环境变量
cat apps/web/.env
echo $VITE_APP_API_URL

# 2. 创建环境变量文件
cp apps/web/.env.example apps/web/.env

# 3. 清理缓存重启
rm -rf apps/web/.vite
rm -rf apps/web/node_modules/.vite
pnpm dev:web

# 4. 检查端口冲突
lsof -ti:5173 | xargs kill -9
```

### 热重载不工作

**问题症状**：文件修改后页面不自动刷新

**解决方案**：

```bash
# 1. 检查文件监听限制 (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 2. 重启开发服务器
pnpm dev:web

# 3. 检查文件路径是否正确
# 确保没有符号链接或路径问题

# 4. 清理缓存
rm -rf apps/web/.vite
```

### API 代理失败

**问题症状**：

```bash
[vite] http proxy error: ECONNREFUSED 127.0.0.1:3000
```

**解决方案**：

```bash
# 1. 确保后端服务正在运行
pnpm dev:api

# 2. 检查代理配置
cat apps/web/vite.config.ts

# 3. 检查环境变量
echo $VITE_APP_API_URL

# 4. 测试 API 连接
curl http://localhost:3000/health
```

## 语音服务问题

### Python 环境问题

**问题症状**：

```bash
ModuleNotFoundError: No module named 'librosa'
Python version 3.7 is not supported
```

**解决方案**：

```bash
# 1. 检查 Python 版本
python3 --version  # 需要 >= 3.8

# 2. 创建虚拟环境 (推荐)
cd services/speech-service
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows

# 3. 安装依赖
pip3 install -e .

# 4. 使用 pnpm 脚本 (推荐)
pnpm speech:install
```

### 语音服务启动失败

**问题症状**：

```bash
Error: Address already in use (port 8080)
ModuleNotFoundError: No module named 'kaldi'
```

**解决方案**：

```bash
# 1. 检查端口占用
lsof -ti:8080 | xargs kill -9

# 2. 检查依赖安装
cd services/speech-service
pip3 list | grep librosa

# 3. 重新安装语音服务
pnpm speech:install

# 4. 手动启动服务
cd services/speech-service
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# 5. 检查服务状态
curl http://localhost:8080/health
```

### 音频处理错误

**问题症状**：

```bash
Error: Unsupported audio format
librosa.util.exceptions.ParameterError
```

**解决方案**：

```bash
# 1. 检查音频文件格式
file your-audio-file.wav

# 2. 转换音频格式
ffmpeg -i input.mp3 -ar 16000 -ac 1 output.wav

# 3. 检查 librosa 安装
python3 -c "import librosa; print('OK')"

# 4. 重新安装音频处理库
pip3 install librosa soundfile --upgrade
```

## 网络和部署问题

### CORS 错误

**问题症状**：

```bash
Access to fetch at 'http://localhost:3000' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**解决方案**：

```bash
# 1. 检查后端 CORS 配置
cat apps/api/.env | grep CORS_ORIGIN

# 2. 更新环境变量
echo 'CORS_ORIGIN="http://localhost:5173"' >> apps/api/.env

# 3. 重启后端服务
pnpm dev:api

# 4. 检查生产环境配置
CORS_ORIGIN="https://yourdomain.com"
```

### 环境变量未加载

**问题症状**：

```bash
API_URL is undefined
process.env.DATABASE_URL is undefined
```

**解决方案**：

```bash
# 1. 检查 .env 文件是否存在
ls -la apps/api/.env
ls -la apps/web/.env

# 2. 检查环境变量格式
cat apps/api/.env | head -5

# 3. 重新加载环境变量
source apps/api/.env  # Linux/macOS
# 或重启开发服务器

# 4. 验证环境变量加载
node -e "console.log(process.env.DATABASE_URL)"
```

### SSL/TLS 证书问题

**问题症状**：

```bash
certificate verify failed: unable to get local issuer certificate
```

**解决方案**：

```bash
# 1. 更新证书 (macOS)
brew install ca-certificates

# 2. 设置 Node.js 环境变量
export NODE_TLS_REJECT_UNAUTHORIZED=0  # 仅开发环境

# 3. 配置代理 (如果使用企业网络)
npm config set proxy http://proxy-server:port
npm config set https-proxy http://proxy-server:port

# 4. 使用自定义证书
export NODE_EXTRA_CA_CERTS=path/to/certificate.pem
```

## 测试问题

### 测试环境配置

**问题症状**：

```bash
Jest encountered an unexpected token
Cannot resolve module 'app/components'
```

**解决方案**：

```bash
# 1. 检查 Jest 配置
cat jest.config.js

# 2. 清理测试缓存
pnpm test --clearCache

# 3. 安装测试依赖
pnpm install --dev @testing-library/react @testing-library/jest-dom

# 4. 检查 TypeScript 配置
cat tsconfig.json
```

### 测试数据库问题

**问题症状**：

```bash
Error: Test database connection failed
```

**解决方案**：

```bash
# 1. 创建测试数据库
createdb sylis_test

# 2. 设置测试环境变量
export NODE_ENV=test
export DATABASE_URL="postgresql://postgres:password@localhost:5432/sylis_test"

# 3. 运行测试迁移
pnpm --filter ./apps/api run prisma:migrate deploy

# 4. 运行测试
pnpm test
```

## 移动端问题

### iOS Safari 兼容性

**问题症状**：音频录制不工作、样式异常

**解决方案**：

```typescript
// 1. 检查浏览器支持
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  console.error("getUserMedia not supported");
}

// 2. 添加 iOS Safari 特殊处理
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
if (isIOS) {
  // iOS 特殊处理逻辑
}

// 3. 添加音频上下文处理
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
```

### Android 兼容性

**问题症状**：某些 Android 设备上功能异常

**解决方案**：

```css
/* 添加 Android 特殊样式 */
@media screen and (-webkit-min-device-pixel-ratio: 0) {
  .android-fix {
    /* Android 特殊处理 */
  }
}
```

## 🔍 调试技巧

### 开启调试模式

```bash
# 前端调试
VITE_APP_DEBUG_MODE=true pnpm dev:web

# 后端调试
LOG_LEVEL=debug pnpm dev:api

# 数据库查询调试
DATABASE_LOGGING=true pnpm dev:api
```

### 查看详细日志

```bash
# 查看 Docker 容器日志
docker-compose logs -f postgres
docker-compose logs -f redis

# 查看应用日志
tail -f apps/api/logs/app.log
tail -f apps/web/logs/access.log
```

### 性能分析

```bash
# 前端性能分析
VITE_APP_PROFILE=true pnpm dev:web

# 后端性能分析
ENABLE_PROFILER=true pnpm dev:api

# 数据库性能分析
ENABLE_QUERY_LOGGING=true pnpm dev:api
```

## 📞 获取帮助

如果以上解决方案都无法解决您的问题，请：

1. **查看 GitHub Issues** - 搜索相关问题
2. **创建新 Issue** - 详细描述问题和重现步骤
3. **加入讨论** - [GitHub Discussions](https://github.com/your-org/sylis/discussions)
4. **联系维护者** - support@sylis.app

### 报告 Bug 时请提供

- 详细的错误信息和堆栈跟踪
- 重现问题的步骤
- 系统环境信息 (OS, 浏览器, Node.js 版本等)
- 相关的配置文件内容
- 日志文件内容

---

希望这个故障排除指南能帮助您快速解决问题。如果您发现新的问题和解决方案，欢迎贡献到这个文档中！
