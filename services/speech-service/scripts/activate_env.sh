#!/bin/bash

# Sylis Speech Service - 环境激活脚本
# 此脚本激活conda环境并设置espeak环境变量

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 环境名称
ENV_NAME="sylis-speech-service"

# 检查conda是否可用
if ! command -v conda &> /dev/null; then
    echo "❌ Conda未安装或不在PATH中"
    echo "请先安装Miniconda或Anaconda"
    exit 1
fi

# 检查环境是否存在
if ! conda env list | grep -q "^${ENV_NAME} "; then
    echo "❌ 环境 '${ENV_NAME}' 不存在"
    echo "请先运行: cd scripts && ./setup.sh"
    exit 1
fi

log_info "激活conda环境: ${ENV_NAME}"

# 激活conda环境
source $(conda info --base)/etc/profile.d/conda.sh
conda activate ${ENV_NAME}

# 设置espeak环境变量
log_info "设置espeak环境变量..."
source $(dirname "$0")/activate_espeak.sh

log_success "环境激活完成！"
echo
log_info "现在可以使用以下命令："
echo "  python3 app/main.py          # 启动服务"
echo "  python3 -m pytest tests/     # 运行测试"
echo "  make start                    # 使用Makefile启动"
echo "  make test                     # 使用Makefile测试"
echo

# 保持shell激活状态
exec "$SHELL"
