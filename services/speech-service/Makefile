# Sylis Speech Service Makefile
.PHONY: help setup start dev test clean lint format status

# 默认目标
help:
	@echo "🎤 Sylis Speech Service - 语音评估服务"
	@echo "========================================"
	@echo ""
	@echo "🚀 快速开始:"
	@echo "  setup      - 一键设置环境和服务"
	@echo "  start      - 启动语音服务"
	@echo "  dev        - 开发模式（自动重载）"
	@echo "  debug      - 调试模式（详细日志）"
	@echo ""
	@echo "🧪 测试和开发:"
	@echo "  test       - 运行测试"
	@echo "  lint       - 代码检查"
	@echo "  format     - 格式化代码"
	@echo "  status     - 检查环境状态"
	@echo ""
	@echo "🔧 维护:"
	@echo "  clean      - 清理临时文件"
	@echo "  logs       - 查看服务日志"
	@echo ""

# 一键设置（推荐首次使用）
setup:
	@echo "🚀 一键设置 Sylis Speech Service..."
	@if ! command -v conda &> /dev/null; then \
		echo "❌ 请先安装 conda: https://docs.conda.io/en/latest/miniconda.html"; \
		exit 1; \
	fi
	@echo "📦 创建conda环境并安装依赖..."
	@cd scripts && ./setup.sh
	@echo ""
	@echo "✅ 设置完成！现在可以运行:"
	@echo "   make start  # 启动服务"
	@echo "   make dev    # 开发模式"

# 启动服务
start:
	@echo "🎤 启动语音评估服务..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🌐 服务地址: http://localhost:8080"
	@echo "📖 API文档: http://localhost:8080/docs"
	@echo "⏹️  按 Ctrl+C 停止服务"
	@echo ""
	@echo "🔧 设置espeak环境变量并启动服务..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	export ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" && \
	export PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" && \
	uvicorn app.main:app --host 0.0.0.0 --port 8080

# 开发模式（带输出）
dev:
	@echo "🔄 启动开发模式（显示完整输出）..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🌐 服务地址: http://localhost:8080"
	@echo "📖 API文档: http://localhost:8080/docs"
	@echo "🔄 文件修改时自动重载"
	@echo "⏹️  按 Ctrl+C 停止服务"
	@echo ""
	@echo "🔧 直接启动uvicorn（绕过conda输出问题）..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && PYTHONUNBUFFERED=1 uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload


# 调试模式
debug:
	@echo "🐛 启动调试模式（详细日志）..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🌐 服务地址: http://localhost:8080"
	@echo "📖 API文档: http://localhost:8080/docs"
	@echo "🐛 调试模式：显示详细日志"
	@echo "⏹️  按 Ctrl+C 停止服务"
	@echo ""
	@echo "🔧 设置espeak环境变量并启动调试服务..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	export ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" && \
	export PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" && \
	uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload --log-level debug --access-log

# 运行测试
test:
	@echo "🧪 运行测试..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🔧 设置espeak环境变量并运行测试..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	export ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" && \
	export PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" && \
	python3 -m pytest tests/ -v --tb=short

# 代码检查
lint:
	@echo "🔍 运行代码检查..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🔧 设置espeak环境变量并运行代码检查..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	export ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" && \
	export PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" && \
	flake8 app/ tests/ scripts/ --max-line-length=88 --ignore=E203,W503

# 格式化代码
format:
	@echo "🎨 格式化代码..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🔧 设置espeak环境变量并格式化代码..."
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	export ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" && \
	export PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" && \
	black app/ tests/ scripts/ --line-length=88 && \
	isort app/ tests/ scripts/ --profile black
	@echo "✅ 代码格式化完成"

# 检查环境状态
status:
	@echo "📊 环境状态检查..."
	@if conda info --envs | grep -q "sylis-speech-service"; then \
		echo "✅ Conda环境: sylis-speech-service"; \
		echo ""; \
		echo "🔍 依赖检查:"; \
		ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" conda run -n sylis-speech-service python3 -c "import torch, librosa, fastapi, montreal_forced_aligner; print('✅ 核心依赖: PyTorch, Librosa, FastAPI, MFA')" 2>/dev/null || echo "❌ 部分依赖缺失"; \
		echo ""; \
		echo "📁 项目文件:"; \
		ls -la app/ | head -5; \
		echo "   ..."; \
		ls -la models/ | head -3; \
		echo "   ..."; \
	else \
		echo "❌ Conda环境未创建"; \
		echo "💡 请运行: make setup"; \
	fi

# 查看服务日志
logs:
	@echo "📋 查看服务日志..."
	@if [ -f "server.log" ]; then \
		tail -f server.log; \
	else \
		echo "📝 暂无日志文件，启动服务后会自动生成"; \
	fi

# 清理临时文件
clean:
	@echo "🧹 清理临时文件..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name "*.pyo" -delete 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@rm -rf .pytest_cache 2>/dev/null || true
	@rm -rf .coverage 2>/dev/null || true
	@rm -rf htmlcov 2>/dev/null || true
	@rm -rf temp/ 2>/dev/null || true
	@rm -f server.log 2>/dev/null || true
	@echo "✅ 清理完成"

# 健康检查
health:
	@echo "🏥 服务健康检查..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建"; \
		exit 1; \
	fi
	@ESPEAK_DATA_PATH="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data" PHONEMIZER_ESPEAK_LIBRARY="/opt/homebrew/lib/libespeak.dylib" conda run -n sylis-speech-service python3 -c "import app.main; print('✅ 服务模块加载正常')" 2>/dev/null || echo "❌ 服务模块加载失败"

# 显示项目信息
info:
	@echo "🎤 Sylis Speech Service"
	@echo "======================"
	@echo "📝 项目描述: 基于MFA的智能语音评估服务"
	@echo "🐍 Python版本: 3.8"
	@echo "📦 依赖管理: Conda"
	@echo "🌐 Web框架: FastAPI"
	@echo "🎯 核心功能: 语音对齐、发音评估、音素分析"
	@echo ""
	@echo "📁 项目结构:"
	@echo "  app/           - 主应用代码"
	@echo "  models/        - 模型文件"
	@echo "  tests/         - 测试代码"
	@echo "  scripts/       - 管理脚本"
	@echo ""
	@echo "🚀 快速开始: make setup"
