# 环境配置

本文档详细说明了 Sylis 项目的环境变量配置方法。

## 配置文件位置

```
sylis/
├── apps/
│   ├── api/.env              # 后端服务配置
│   └── web/.env              # 前端应用配置
└── services/
    └── speech-service/       # 语音服务配置 (可选)
        └── config/env.example
```

## 后端环境变量

创建 `apps/api/.env` 文件：

```bash
# ===============================================
# 应用基础配置
# ===============================================
APP_NAME="Sylis"
PORT=3000
NODE_ENV="development"

# ===============================================
# 数据库配置
# ===============================================
# PostgreSQL 数据库连接字符串
DATABASE_URL="postgresql://postgres:12345678@localhost:5432/sylis"

# 数据库连接池配置
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_TIMEOUT=30000

# ===============================================
# Redis 缓存配置
# ===============================================
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""
REDIS_DB=0
REDIS_CONNECT_TIMEOUT=5000
REDIS_COMMAND_TIMEOUT=3000

# ===============================================
# JWT 认证配置
# ===============================================
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="30d"
JWT_REFRESH_SECRET="your-refresh-token-secret"
JWT_REFRESH_EXPIRES_IN="90d"

# ===============================================
# 邮件服务配置
# ===============================================
MAILER_HOST="smtp.gmail.com"
MAILER_PORT=587
MAILER_SECURE=false
MAILER_USER="your-email@gmail.com"
MAILER_PASS="your-app-password"
MAILER_FROM="Sylis Team <noreply@sylis.app>"

# ===============================================
# 文件上传配置
# ===============================================
UPLOAD_DEST="./uploads"
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES="audio/wav,audio/mp3,audio/mpeg"

# ===============================================
# 语音服务配置
# ===============================================
SPEECH_SERVICE_URL="http://localhost:8080"
SPEECH_SERVICE_TIMEOUT=30000

# ===============================================
# 安全配置
# ===============================================
CORS_ORIGIN="http://localhost:5173"
API_RATE_LIMIT=100          # 每分钟请求限制
API_RATE_WINDOW=60000       # 限流窗口 (毫秒)

# ===============================================
# 日志配置
# ===============================================
LOG_LEVEL="debug"           # error, warn, info, debug
LOG_FILE_ENABLED=true
LOG_FILE_PATH="./logs"
LOG_MAX_FILES=10
LOG_MAX_SIZE="20m"

# ===============================================
# 监控和性能
# ===============================================
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_TIMEOUT=5000
```

## 前端环境变量

创建 `apps/web/.env` 文件：

```bash
# ===============================================
# API 服务配置
# ===============================================
VITE_APP_API_URL="http://localhost:3000"
VITE_APP_API_TIMEOUT=10000

# ===============================================
# AI 服务配置 - OpenAI
# ===============================================
VITE_APP_AI_PROVIDER="openai"
VITE_APP_AI_KEY="sk-xxxxxxxxxxxxxxxxxx"
VITE_APP_AI_URL="https://api.openai.com/v1"
VITE_APP_AI_MODEL="gpt-3.5-turbo"
VITE_APP_AI_MAX_TOKENS=2000
VITE_APP_AI_TEMPERATURE=0.7

# ===============================================
# 语音服务配置
# ===============================================
VITE_APP_SPEECH_URL="http://localhost:8080"
VITE_APP_SPEECH_TIMEOUT=30000
VITE_APP_AUDIO_FORMAT="wav"
VITE_APP_SAMPLE_RATE=16000

# ===============================================
# 应用功能开关
# ===============================================
VITE_APP_ENABLE_OFFLINE=true
VITE_APP_ENABLE_ANALYTICS=false
VITE_APP_ENABLE_PWA=true
VITE_APP_DEBUG_MODE=true

# ===============================================
# UI 配置
# ===============================================
VITE_APP_DEFAULT_THEME="light"        # light, dark, auto
VITE_APP_DEFAULT_LANGUAGE="zh-CN"     # zh-CN, en-US
VITE_APP_ENABLE_ANIMATIONS=true

# ===============================================
# 缓存配置
# ===============================================
VITE_APP_CACHE_VERSION="1.0.0"
VITE_APP_CACHE_DURATION=86400000      # 24小时 (毫秒)
VITE_APP_OFFLINE_CACHE_SIZE=50        # MB

# ===============================================
# 开发配置
# ===============================================
VITE_APP_MOCK_API=false
VITE_APP_SHOW_DEVTOOLS=true
VITE_APP_LOG_LEVEL="debug"
```

## AI 服务兼容配置

Sylis 支持多种 AI 服务提供商，您可以根据需要选择：

### OpenAI

```bash
VITE_APP_AI_PROVIDER="openai"
VITE_APP_AI_URL="https://api.openai.com/v1"
VITE_APP_AI_KEY="sk-xxxxxxxxxxxxxxxxxx"
VITE_APP_AI_MODEL="gpt-3.5-turbo"
```

### DeepSeek

```bash
VITE_APP_AI_PROVIDER="deepseek"
VITE_APP_AI_URL="https://api.deepseek.com/v1"
VITE_APP_AI_KEY="sk-xxxxxxxxxxxxxxxxxx"
VITE_APP_AI_MODEL="deepseek-chat"
```

### Moonshot (月之暗面)

```bash
VITE_APP_AI_PROVIDER="moonshot"
VITE_APP_AI_URL="https://api.moonshot.cn/v1"
VITE_APP_AI_KEY="sk-xxxxxxxxxxxxxxxxxx"
VITE_APP_AI_MODEL="moonshot-v1-8k"
```

### 本地 Ollama

```bash
VITE_APP_AI_PROVIDER="ollama"
VITE_APP_AI_URL="http://localhost:11434/v1"
VITE_APP_AI_KEY="not-required"
VITE_APP_AI_MODEL="llama2"
```

### Azure OpenAI

```bash
VITE_APP_AI_PROVIDER="azure"
VITE_APP_AI_URL="https://your-resource.openai.azure.com"
VITE_APP_AI_KEY="your-azure-api-key"
VITE_APP_AI_MODEL="gpt-35-turbo"
VITE_APP_AI_DEPLOYMENT="your-deployment-name"
```

## 语音服务配置

语音服务通常无需额外配置，但如果需要自定义，可以创建 `services/speech-service/config/.env`:

```bash
# ===============================================
# 语音服务配置
# ===============================================
HOST="0.0.0.0"
PORT=8080
DEBUG=true

# ===============================================
# WeNet 模型配置
# ===============================================
MODEL_PATH="./models"
ACOUSTIC_MODEL="wenet_model.pkl"
LANGUAGE_MODEL="language_model.arpa"
DICTIONARY_PATH="./config/words.txt"

# ===============================================
# 音频处理配置
# ===============================================
SAMPLE_RATE=16000
AUDIO_FORMAT="wav"
MAX_AUDIO_LENGTH=30      # 秒
MIN_AUDIO_LENGTH=0.5     # 秒

# ===============================================
# 语音识别配置
# ===============================================
RECOGNITION_THRESHOLD=0.5
CONFIDENCE_THRESHOLD=0.7
ENABLE_DETAILED_FEEDBACK=true

# ===============================================
# 性能配置
# ===============================================
MAX_CONCURRENT_REQUESTS=5
REQUEST_TIMEOUT=30       # 秒
WORKER_PROCESSES=2
```

## 🐳 Docker 环境配置

如果使用 Docker 部署，可以通过 `docker-compose.yml` 配置环境变量：

```yaml
version: "3.8"

services:
  api:
    build: ./apps/api
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/sylis
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  web:
    build: ./apps/web
    environment:
      - VITE_APP_API_URL=http://api:3000
      - VITE_APP_AI_KEY=${AI_API_KEY}

  speech:
    build: ./services/speech-service
    environment:
      - HOST=0.0.0.0
      - PORT=8080

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=sylis
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
```

## 生产环境安全配置

### 必须修改的配置项

```bash
# 后端 (.env)
JWT_SECRET="生成一个强随机字符串"
JWT_REFRESH_SECRET="另一个强随机字符串"
DATABASE_URL="生产环境数据库连接"
REDIS_PASSWORD="Redis密码"
NODE_ENV="production"

# 前端 (.env)
VITE_APP_API_URL="https://api.yourdomain.com"
VITE_APP_DEBUG_MODE=false
VITE_APP_MOCK_API=false
```

### 生成安全密钥

```bash
# 生成 JWT 密钥
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 或使用 openssl
openssl rand -hex 64
```

## 环境特定配置

### 开发环境

```bash
# apps/api/.env.development
NODE_ENV="development"
LOG_LEVEL="debug"
CORS_ORIGIN="http://localhost:5173"
API_RATE_LIMIT=1000

# apps/web/.env.development
VITE_APP_DEBUG_MODE=true
VITE_APP_MOCK_API=false
VITE_APP_LOG_LEVEL="debug"
```

### 测试环境

```bash
# apps/api/.env.test
NODE_ENV="test"
DATABASE_URL="postgresql://postgres:password@localhost:5432/sylis_test"
LOG_LEVEL="warn"
DISABLE_AUTH=true

# apps/web/.env.test
VITE_APP_API_URL="http://localhost:3001"
VITE_APP_MOCK_API=true
VITE_APP_DEBUG_MODE=false
```

### 生产环境

```bash
# apps/api/.env.production
NODE_ENV="production"
DATABASE_URL="your-production-database-url"
LOG_LEVEL="error"
API_RATE_LIMIT=100
CORS_ORIGIN="https://yourdomain.com"

# apps/web/.env.production
VITE_APP_API_URL="https://api.yourdomain.com"
VITE_APP_DEBUG_MODE=false
VITE_APP_ENABLE_ANALYTICS=true
```

## 🔧 配置验证

### 验证后端配置

```bash
# 检查数据库连接
pnpm --filter ./apps/api run db:check

# 检查 Redis 连接
pnpm --filter ./apps/api run redis:check

# 验证所有配置
pnpm --filter ./apps/api run config:validate
```

### 验证前端配置

```bash
# 检查 API 连接
curl $VITE_APP_API_URL/health

# 检查语音服务
curl $VITE_APP_SPEECH_URL/health

# 验证构建配置
pnpm --filter ./apps/web run build:check
```

## 配置模板

### 快速开发配置

```bash
# 复制开发环境模板
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 使用默认配置启动
pnpm start
```

### 自定义配置向导

```bash
# 运行配置向导
pnpm config:setup

# 或手动配置
pnpm config:wizard
```

## 常见配置问题

### 数据库连接问题

```bash
# 检查数据库是否运行
docker ps | grep postgres

# 测试连接
psql $DATABASE_URL -c "SELECT 1;"
```

### Redis 连接问题

```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 测试连接
redis-cli -u $REDIS_URL ping
```

### AI 服务配置问题

```bash
# 测试 API 密钥
curl -H "Authorization: Bearer $VITE_APP_AI_KEY" \
     $VITE_APP_AI_URL/models
```

### 跨域问题

```bash
# 确保后端 CORS 配置正确
CORS_ORIGIN="http://localhost:5173,https://yourdomain.com"
```

---

配置完成后，请运行 `pnpm health` 验证所有服务是否正常工作。如有问题，请查看 [故障排除指南](./troubleshooting.md)。
