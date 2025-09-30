#!/bin/bash

# Sylis Speech Service - espeak环境变量激活脚本
# 此脚本在conda环境激活时自动设置espeak环境变量

# 检测espeak安装路径
detect_espeak_paths() {
    local espeak_path=""
    local espeak_data_path=""

    # 检查常见的espeak安装位置
    if [ -f "/opt/homebrew/bin/espeak" ]; then
        espeak_path="/opt/homebrew/bin"
        # 动态获取espeak版本路径
        local espeak_version=$(ls /opt/homebrew/Cellar/espeak/ 2>/dev/null | head -1)
        if [ -n "$espeak_version" ]; then
            espeak_data_path="/opt/homebrew/Cellar/espeak/$espeak_version/share/espeak-data"
        else
            espeak_data_path="/opt/homebrew/Cellar/espeak/1.48.04_1/share/espeak-data"
        fi
    elif [ -f "/usr/local/bin/espeak" ]; then
        espeak_path="/usr/local/bin"
        espeak_data_path="/usr/local/share/espeak-data"
    elif [ -f "/usr/bin/espeak" ]; then
        espeak_path="/usr/bin"
        espeak_data_path="/usr/share/espeak-data"
    else
        echo "⚠️  未找到espeak安装，请确保espeak已正确安装"
        return 1
    fi

    # 验证路径
    if [ ! -f "$espeak_path/espeak" ]; then
        echo "❌ espeak可执行文件不存在: $espeak_path/espeak"
        return 1
    fi

    if [ ! -d "$espeak_data_path" ]; then
        echo "❌ espeak数据目录不存在: $espeak_data_path"
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
        echo "   espeak库路径: $espeak_lib_path"
    else
        echo "⚠️  未找到espeak共享库，phonemizer可能无法正常工作"
    fi

    echo "✅ espeak环境变量已设置"
    echo "   espeak路径: $espeak_path"
    echo "   espeak数据路径: $espeak_data_path"

    return 0
}

# 自动检测并设置espeak环境变量
detect_espeak_paths
