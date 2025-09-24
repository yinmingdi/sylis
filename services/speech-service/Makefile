# Sylis Speech Service Makefile
.PHONY: help install start test clean setup download health dev

# Default target
help:
	@echo "Sylis Speech Service 管理命令"
	@echo ""
	@echo "可用命令:"
	@echo "  install    - 安装依赖"
	@echo "  setup      - 快速设置服务"
	@echo "  download   - 下载模型文件"
	@echo "  start      - 启动服务"
	@echo "  dev        - 启动开发服务（自动重载）"
	@echo "  test       - 运行测试"
	@echo "  health     - 健康检查"
	@echo "  clean      - 清理临时文件"
	@echo "  lint       - 代码检查"
	@echo "  format     - 格式化代码"

# Install dependencies
install:
	pip3 install -e .

# Quick setup
setup:
	python3 scripts/quick_setup.py

# Download models
download:
	python3 scripts/download_models.py

# Start service
start:
	python3 scripts/manage.py start

# Start development service with auto-reload
dev:
	python3 scripts/manage.py start --reload

# Run tests
test:
	python3 scripts/manage.py test

# Health check
health:
	python3 scripts/manage.py health

# Clean temporary files
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache 2>/dev/null || true
	rm -rf .coverage 2>/dev/null || true
	rm -rf htmlcov 2>/dev/null || true
	rm -rf temp/ 2>/dev/null || true

# Code linting
lint:
	@echo "运行代码检查..."
	@which flake8 >/dev/null 2>&1 || (echo "flake8 未安装，跳过检查" && exit 0)
	flake8 app/ tests/ scripts/ --max-line-length=88 --ignore=E203,W503

# Code formatting
format:
	@echo "格式化代码..."
	@which black >/dev/null 2>&1 || (echo "black 未安装，跳过格式化" && exit 0)
	black app/ tests/ scripts/ --line-length=88
	@which isort >/dev/null 2>&1 || (echo "isort 未安装，跳过导入排序" && exit 0)
	isort app/ tests/ scripts/ --profile black

# Development install with dev dependencies
dev-install:
	pip3 install -e .[dev] 2>/dev/null || pip3 install pytest pytest-asyncio pytest-cov black isort flake8

# Docker commands
docker-build:
	docker build -t sylis-speech-service .

docker-run:
	docker run -p 8080:8080 sylis-speech-service

# Show project structure
tree:
	@echo "项目结构:"
	@tree -I "__pycache__|*.pyc|*.pyo|.git|.pytest_cache|*.egg-info" . || ls -la
