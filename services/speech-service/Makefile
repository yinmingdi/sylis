# Sylis Speech Service Makefile
.PHONY: help setup start dev test clean lint format status train test-model align-data

# 默认目标
help:
	@echo "🎤 Sylis Speech Service - 语音评估服务"
	@echo "========================================"
	@echo ""
	@echo "🚀 快速开始:"
	@echo "  setup      - 一键设置环境"
	@echo "  start      - 启动语音服务"
	@echo "  dev        - 开发模式（自动重载）"
	@echo ""
	@echo "🎓 模型训练:"
	@echo "  train      - 训练音素识别模型（20轮）"
	@echo "  align-data - 批量对齐数据集"
	@echo "  test-model - 测试训练好的模型"
	@echo ""
	@echo "🧪 测试和开发:"
	@echo "  test       - 运行测试"
	@echo "  lint       - 代码检查"
	@echo "  format     - 格式化代码"
	@echo ""
	@echo "🔧 维护:"
	@echo "  status     - 检查环境状态"
	@echo "  clean      - 清理临时文件"
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
	@echo "   make train      # 训练模型"
	@echo "   make start      # 启动服务"
	@echo "   make test-model # 测试模型"

# 训练音素识别模型
train:
	@echo "🎓 训练音素识别模型..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "📊 配置: 20轮，全量数据（~2500样本）"
	@echo "⏱️  预计时间: 30-60分钟"
	@echo ""
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	cd training && python train_phoneme_dnn.py

# 批量对齐数据集
align-data:
	@echo "📍 批量对齐数据集..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "对齐训练集和测试集..."
	@echo ""
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	cd training && python batch_align_dataset.py --split train && \
	python batch_align_dataset.py --split test

# 测试训练好的模型
test-model:
	@echo "🧪 测试音素识别模型..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@if [ ! -f "models/pytorch_phoneme_dnn/final_model.pth" ]; then \
		echo "❌ 模型未训练，请先运行: make train"; \
		exit 1; \
	fi
	@echo "测试音频: tests/hello.wav"
	@echo ""
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	python tests/test_pytorch_model.py tests/hello.wav 'hello'

# 启动服务
start:
	@echo "🎤 启动语音评估服务..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@if [ ! -f "models/pytorch_phoneme_dnn/final_model.pth" ]; then \
		echo "⚠️  警告：模型未训练，建议先运行: make train"; \
	fi
	@echo "🌐 服务地址: http://localhost:8080"
	@echo "📖 API文档: http://localhost:8080/docs"
	@echo "⏹️  按 Ctrl+C 停止服务"
	@echo ""
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	python -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# 开发模式（自动重载）
dev:
	@echo "🔄 启动开发模式..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	@echo "🌐 服务地址: http://localhost:8080"
	@echo "📖 API文档: http://localhost:8080/docs"
	@echo "🔄 文件修改时自动重载"
	@echo ""
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

# 运行测试
test:
	@echo "🧪 运行测试..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	python -m pytest tests/ -v --tb=short

# 代码检查
lint:
	@echo "🔍 运行代码检查..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	flake8 app/ training/ tests/ --max-line-length=120 --ignore=E203,W503,E501

# 格式化代码
format:
	@echo "🎨 格式化代码..."
	@if ! conda info --envs | grep -q "sylis-speech-service"; then \
		echo "❌ 环境未创建，请先运行: make setup"; \
		exit 1; \
	fi
	eval "$$(conda shell.bash hook)" && conda activate sylis-speech-service && \
	black app/ training/ tests/ --line-length=120 && \
	isort app/ training/ tests/ --profile black
	@echo "✅ 代码格式化完成"

# 检查环境状态
status:
	@echo "📊 环境状态检查..."
	@if conda info --envs | grep -q "sylis-speech-service"; then \
		echo "✅ Conda环境: sylis-speech-service"; \
		echo ""; \
		conda run -n sylis-speech-service python -c "import torch, librosa, fastapi; print('✅ 核心依赖正常')" 2>/dev/null || echo "❌ 部分依赖缺失"; \
		echo ""; \
		echo "📁 模型文件:"; \
		if [ -f "models/pytorch_phoneme_dnn/final_model.pth" ]; then \
			echo "  ✅ PyTorch 模型已训练"; \
		else \
			echo "  ❌ PyTorch 模型未训练（运行: make train）"; \
		fi; \
		echo ""; \
		echo "📊 对齐数据:"; \
		if [ -f "aligned_data/train_aligned.json" ]; then \
			echo "  ✅ 训练集已对齐"; \
		else \
			echo "  ⚠️  训练集未对齐（训练时会自动对齐）"; \
		fi; \
	else \
		echo "❌ Conda环境未创建"; \
		echo "💡 请运行: make setup"; \
	fi

# 清理临时文件
clean:
	@echo "🧹 清理临时文件..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@rm -rf .pytest_cache 2>/dev/null || true
	@rm -rf temp/ 2>/dev/null || true
	@echo "✅ 清理完成"

# 清理所有生成文件（包括模型和对齐数据）
clean-all: clean
	@echo "🧹 清理所有生成文件（模型、对齐数据）..."
	@echo "⚠️  这将删除训练好的模型和对齐数据！"
	@read -p "确认删除？(y/N): " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf models/ aligned_data/; \
		echo "✅ 已删除所有生成文件"; \
	else \
		echo "❌ 已取消"; \
	fi
