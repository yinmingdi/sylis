#!/bin/bash

# Sylis Speech Service - Conda环境设置脚本
# 创建conda环境并安装所有必要依赖（PyTorch + MFA）

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查conda是否安装
check_conda() {
    if ! command -v conda &> /dev/null; then
        log_error "Conda未安装。请先安装Miniconda或Anaconda。"
        log_info "下载地址: https://docs.conda.io/en/latest/miniconda.html"
        exit 1
    fi
    log_success "Conda已安装: $(conda --version)"
}

# 检查环境是否已存在
check_environment() {
    local env_name="sylis-speech-service"
    if conda env list | grep -q "^${env_name} "; then
        log_warning "环境 '${env_name}' 已存在"
        read -p "是否要重新创建环境? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "删除现有环境..."
            conda env remove -n ${env_name} -y
        else
            log_info "使用现有环境"
            return 0
        fi
    fi
}

# 创建conda环境
create_environment() {
    local env_name="sylis-speech-service"
    log_info "创建conda环境: ${env_name}"

    # 使用environment.yml创建环境
    conda env create -f environment.yml

    if [ $? -eq 0 ]; then
        log_success "环境创建成功"
    else
        log_error "环境创建失败"
        exit 1
    fi
}

# 激活环境
activate_environment() {
    local env_name="sylis-speech-service"
    log_info "激活环境..."

    # 激活环境
    source $(conda info --base)/etc/profile.d/conda.sh
    conda activate ${env_name}

    log_success "环境激活成功"
}

# 验证安装
verify_installation() {
    local env_name="sylis-speech-service"
    log_info "验证安装..."

    # 激活环境
    source $(conda info --base)/etc/profile.d/conda.sh
    conda activate ${env_name}

    # 检查Python版本
    log_info "检查Python版本..."
    python --version

    # 检查关键包
    log_info "检查关键依赖..."
    python -c "import torch; print(f'  ✅ PyTorch: {torch.__version__}')" || log_error "PyTorch 未安装"
    python -c "import librosa; print(f'  ✅ Librosa: {librosa.__version__}')" || log_error "Librosa 未安装"
    python -c "import fastapi; print(f'  ✅ FastAPI: {fastapi.__version__}')" || log_error "FastAPI 未安装"

    # 检查 MFA（可选）
    if python -c "import montreal_forced_aligner" 2>/dev/null; then
        log_success "  ✅ MFA 已安装"
    else
        log_warning "  ⚠️  MFA 未安装（可选，仅训练时需要）"
    fi

    log_success "环境验证完成"
}

# 显示使用说明
show_usage() {
    local env_name="sylis-speech-service"
    echo
    log_success "🎉 环境设置完成！"
    echo
    log_info "后续步骤:"
    echo
    echo "  1. 训练模型（首次使用必需）:"
    echo "     cd .. && make train"
    echo
    echo "  2. 测试模型:"
    echo "     cd .. && make test-model"
    echo
    echo "  3. 启动服务:"
    echo "     cd .. && make start"
    echo
    echo "  4. 查看状态:"
    echo "     cd .. && make status"
    echo
    log_info "更多信息请查看 README.md"
}

# 主函数
main() {
    echo "🚀 Sylis Speech Service - Conda环境设置"
    echo "========================================================="

    check_conda
    check_environment
    create_environment
    activate_environment
    verify_installation

    show_usage
}

# 运行主函数
main "$@"
