#!/bin/bash

# Sylis Speech Service - Conda环境设置脚本 (重构版本 2.0)
# 此脚本将创建conda环境并安装重构后流水线的所有必要依赖

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

    # 设置espeak环境变量
    setup_espeak_environment

    log_success "环境激活成功"
}

# 设置espeak环境变量
setup_espeak_environment() {
    log_info "配置espeak环境变量..."

    # 检测espeak安装路径
    local espeak_path=""
    local espeak_data_path=""

    # 检查常见的espeak安装位置
    if [ -f "/opt/homebrew/bin/espeak" ]; then
        espeak_path="/opt/homebrew/bin"
        espeak_data_path="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data"
        log_info "检测到Homebrew安装的espeak: $espeak_path"
    elif [ -f "/usr/local/bin/espeak" ]; then
        espeak_path="/usr/local/bin"
        espeak_data_path="/usr/local/share/espeak-data"
        log_info "检测到/usr/local安装的espeak: $espeak_path"
    elif [ -f "/usr/bin/espeak" ]; then
        espeak_path="/usr/bin"
        espeak_data_path="/usr/share/espeak-data"
        log_info "检测到系统安装的espeak: $espeak_path"
    else
        log_warning "未找到espeak安装，请确保espeak已正确安装"
        return 1
    fi

    # 验证espeak可执行文件
    if [ ! -f "$espeak_path/espeak" ]; then
        log_error "espeak可执行文件不存在: $espeak_path/espeak"
        return 1
    fi

    # 验证espeak数据目录
    if [ ! -d "$espeak_data_path" ]; then
        log_error "espeak数据目录不存在: $espeak_data_path"
        return 1
    fi

    # 设置环境变量
    export PATH="$espeak_path:$PATH"
    export ESPEAK_DATA_PATH="$espeak_data_path"

    # 设置phonemizer的espeak库路径
    local espeak_lib_path=""
    if [ -f "/opt/homebrew/lib/libespeak.dylib" ]; then
        espeak_lib_path="/opt/homebrew/lib/libespeak.dylib"
    elif [ -f "/usr/local/lib/libespeak.dylib" ]; then
        espeak_lib_path="/usr/local/lib/libespeak.dylib"
    elif [ -f "/usr/lib/libespeak.dylib" ]; then
        espeak_lib_path="/usr/lib/libespeak.dylib"
    fi

    if [ -n "$espeak_lib_path" ]; then
        export PHONEMIZER_ESPEAK_LIBRARY="$espeak_lib_path"
        log_info "espeak库路径: $espeak_lib_path"
    else
        log_warning "未找到espeak共享库，phonemizer可能无法正常工作"
    fi

    # 验证espeak是否可用
    if command -v espeak &> /dev/null; then
        log_success "espeak环境变量设置成功"
        log_info "espeak路径: $(which espeak)"
        log_info "espeak数据路径: $ESPEAK_DATA_PATH"

        # 测试espeak是否工作
        if espeak --version &> /dev/null; then
            log_success "espeak功能验证成功"
        else
            log_warning "espeak版本检查失败，但路径已设置"
        fi
    else
        log_error "espeak环境变量设置失败"
        return 1
    fi
}

# 验证安装
verify_installation() {
    local env_name="sylis-speech-service"
    log_info "验证安装..."

    # 激活环境
    source $(conda info --base)/etc/profile.d/conda.sh
    conda activate ${env_name}

    # 设置espeak环境变量
    setup_espeak_environment

    # 检查Python版本
    log_info "检查Python版本..."
    python3 --version

    log_info "检查关键包..."
    python3 -c "import torch; print(f'PyTorch: {torch.__version__}')"
    python3 -c "import librosa; print(f'Librosa: {librosa.__version__}')"
    python3 -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')"

    # 验证espeak和phonemizer
    log_info "验证espeak和phonemizer..."
    if command -v espeak &> /dev/null; then
        log_success "espeak可用: $(which espeak)"
        espeak --version 2>/dev/null || log_warning "espeak版本检查失败"
    else
        log_error "espeak不可用"
    fi

    # 测试phonemizer是否能找到espeak
    if python3 -c "from phonemizer.backend import EspeakBackend; print('phonemizer可以找到espeak')" 2>/dev/null; then
        log_success "phonemizer可以访问espeak"
    else
        log_warning "phonemizer无法访问espeak，可能需要重新安装phonemizer"
    fi

    log_success "基础环境验证完成"
}

# 下载重构后流水线所需的模型（必需）
setup_pipeline_models() {
    local env_name="sylis-speech-service"
    log_info "设置重构后流水线模型（这是必需的步骤）..."

    # 激活环境
    source $(conda info --base)/etc/profile.d/conda.sh
    conda activate ${env_name}

    # 下载必需的模型
    log_info "下载必需的模型..."

    # 创建临时Python脚本，只下载模型不验证流水线
    local temp_script=$(mktemp /tmp/setup_models_XXXXXX.py)
    cat > "$temp_script" << 'EOF'
import torch
import os

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"使用设备: {device}")

try:
    # 1. 下载WhisperX模型
    print("下载WhisperX模型...")
    import whisperx

    print("  - 下载Whisper转录模型 (small)...")
    transcribe_model = whisperx.load_model("small", device, compute_type="int8", language="en")
    print("  ✅ Whisper转录模型 (small) 下载成功")

    print("  - 下载wav2vec2对齐模型...")
    align_model, metadata = whisperx.load_align_model(
        model_name="facebook/wav2vec2-lv-60-espeak-cv-ft",
        language_code="en",
        device=device
    )
    print("  ✅ wav2vec2对齐模型下载成功")

    # 2. 下载transformers模型（用于特征提取）
    print("下载transformers模型...")
    from transformers import Wav2Vec2Model, Wav2Vec2Processor

    print("  - 下载wav2vec2-base-960h模型...")
    processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")
    model = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base-960h")
    print("  ✅ wav2vec2-base-960h模型下载成功")

    print("🎉 所有模型下载完成！")
    print("📊 已下载的模型:")
    print("  - WhisperX small (转录)")
    print("  - wav2vec2-xlsr-53-espeak-cv-ft (对齐)")
    print("  - wav2vec2-base-960h (特征提取)")
    print("  - 模型已缓存到本地，服务启动时将直接使用")

except ImportError as e:
    print(f"❌ 导入错误: {e}")
    print("请确保所有依赖已正确安装")
    exit(1)
except Exception as e:
    print(f"❌ 模型下载失败: {e}")
    exit(1)
EOF

    # 执行临时脚本
    if python3 "$temp_script"; then
        rm -f "$temp_script"
        log_success "模型下载成功"
    else
        rm -f "$temp_script"
        log_error "模型下载失败"
        log_info "可能的原因："
        log_info "  1. 网络连接问题（首次运行需要下载多个模型）"
        log_info "  2. 磁盘空间不足（需要至少8GB空间）"
        log_info "  3. PyTorch/transformers配置问题"
        log_info "解决方案："
        log_info "  1. 检查网络连接"
        log_info "  2. 确保有足够的磁盘空间"
        log_info "  3. 确认所有依赖正确安装"
        return 1
    fi

    log_success "模型设置完成！"
}

# 显示使用说明
show_usage() {
    local env_name="sylis-speech-service"
    echo
    log_success "🎉 安装完成！"
    echo
    log_info "使用方法:"
    echo "  1. 激活环境:"
    echo "     conda activate ${env_name}"
    echo
    echo "  2. 启动重构后的服务:"
    echo "     cd .. && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
    echo "     或: cd .. && make start"
    echo
    echo "  3. 测试API:"
    echo "     curl http://localhost:8000/health"
    echo "     curl http://localhost:8000/api/models/info"
    echo
    echo "  4. 运行测试:"
    echo "     cd .. && python3 app/example_usage.py"
    echo "     或: cd .. && make test"
    echo
    log_info "更多信息请查看 README.md"
}

# 主函数
main() {
    echo "🚀 Sylis Speech Service - Conda环境设置 (重构版本 2.0)"
    echo "========================================================="

    check_conda
    check_environment
    create_environment
    activate_environment
    verify_installation

    # 设置必需模型（必需步骤）
    log_info "开始下载必需模型（这是服务运行的必需步骤）..."
    if setup_pipeline_models; then
        log_success "模型设置完成"
    else
        log_error "模型设置失败，服务可能无法正常工作"
        log_info ""
        log_info "您可以稍后手动运行服务时让模型自动下载"
        log_info "  conda activate sylis-speech-service"
        log_info "  cd .. && python3 app/main.py"
        log_info ""
        log_warning "首次运行时需要网络连接下载模型文件"
    fi

    show_usage
}

# 运行主函数
main "$@"
