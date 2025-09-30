import os
import io
import uuid
import shutil
import tempfile
import sys
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse

# 添加当前目录到Python路径
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

from pronunciation_pipeline import (
    create_default_pipeline,
    PipelineConfig,
    create_pronunciation_pipeline
)

import logging
import warnings

# 过滤掉第三方库的弃用警告
warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")
warnings.filterwarnings("ignore", category=UserWarning, module="speechbrain")
warnings.filterwarnings("ignore", category=UserWarning, module="torchaudio")

# 设置日志级别为 INFO 以便看到调试信息
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = FastAPI(title="Sylis Speech Service (Refactored)", version="2.0.0")

# 全局流水线实例
_pipeline = None

def get_pipeline():
    """获取全局流水线实例"""
    global _pipeline
    if _pipeline is None:
        _pipeline = create_default_pipeline()
        # 预初始化流水线
        _pipeline.initialize()
    return _pipeline



@app.post("/api/pronunciation/assess")
async def pronunciation_assess(
    audio: UploadFile = File(..., description="WAV audio file, mono, 16k preferred"),
    text: str = Form(..., description="Reference text to align"),
    language: str = Form("en-US"),
    enable_phoneme: bool = Form(True),
    save_debug_info: bool = Form(False, description="Save debug information to temp directory")
) -> JSONResponse:
    """
    音素级发音评估API

    使用重构后的流水线架构，提供完整的音素级发音质量评估。
    """
    # 获取流水线实例
    pipeline = get_pipeline()

    # 检查流水线是否就绪
    if not pipeline.is_ready(language.split('-')[0]):
        raise HTTPException(
            status_code=503,
            detail="发音评估服务正在初始化，请稍后重试"
        )

    # 验证输入参数
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="参考文本不能为空")

    if not audio.filename:
        raise HTTPException(status_code=400, detail="音频文件名不能为空")

    # 检查文件格式（支持更多格式）
    supported_formats = (".wav", ".mp3", ".flac", ".m4a")
    if not audio.filename.lower().endswith(supported_formats):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式，支持的格式: {', '.join(supported_formats)}"
        )

    # 创建临时目录
    session_dir = tempfile.mkdtemp(prefix="sylis_pronunciation_")
    audio_path = os.path.join(session_dir, f"audio_{uuid.uuid4().hex[:8]}.wav")

    try:
        # 保存上传的音频文件
        contents = await audio.read()
        with open(audio_path, "wb") as f:
            f.write(contents)

        # 执行发音评估
        result = pipeline.assess_pronunciation(
            audio_path=audio_path,
            reference_text=text.strip(),
            language=language
        )

        # 检查评估是否成功
        if not result.success:
            raise HTTPException(
                status_code=500,
                detail=f"发音评估失败: {result.error_message}"
            )

        # 保存调试信息（如果需要）
        if save_debug_info:
            debug_dir = os.path.join(session_dir, "debug")
            pipeline.save_intermediate_results(result, debug_dir)
            logging.info(f"调试信息已保存到: {debug_dir}")

        # 构建响应
        assessment_dict = result.assessment.to_dict()

        # 添加处理信息
        assessment_dict["processing_info"] = {
            "total_time": result.processing_time,
            "step_times": result.step_times,
            "pipeline_version": "2.0.0"
        }

        # 添加模型信息
        pipeline_info = pipeline.get_pipeline_info()
        assessment_dict["model_info"] = {
            "engine": "Refactored Pipeline",
            "description": "使用重构后的音素级发音评估流水线",
            "components": pipeline_info.get("components", {}),
            "config": pipeline_info.get("config", {}),
            "status": "✅ 流水线运行正常"
        }

        return JSONResponse(content=assessment_dict)

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"发音评估异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"内部错误: {str(e)}")
    finally:
        # 清理临时文件
        try:
            if not save_debug_info:  # 如果不需要保存调试信息，则删除临时目录
                shutil.rmtree(session_dir, ignore_errors=True)
        except Exception as e:
            logging.warning(f"清理临时文件失败: {e}")


@app.get("/")
def root() -> dict:
    """根路径，返回服务基本信息"""
    return {
        "service": "sylis-speech-refactored",
        "version": "2.0.0",
        "description": "重构后的音素级发音评估服务",
        "status": "ok"
    }


@app.get("/health")
def health() -> dict:
    """健康检查端点"""
    try:
        pipeline = get_pipeline()

        if pipeline.is_ready():
            pipeline_info = pipeline.get_pipeline_info()
            return {
                "status": "healthy",
                "service": "pronunciation-pipeline",
                "version": "2.0.0",
                "pipeline_info": pipeline_info,
                "description": "发音评估流水线运行正常"
            }
        else:
            return {
                "status": "initializing",
                "service": "pronunciation-pipeline",
                "version": "2.0.0",
                "description": "发音评估流水线正在初始化"
            }

    except Exception as e:
        logging.error(f"健康检查失败: {e}", exc_info=True)
        return {
            "status": "error",
            "service": "pronunciation-pipeline",
            "version": "2.0.0",
            "error": str(e),
            "description": "发音评估流水线异常"
        }


@app.get("/api/models/info")
def get_models_info() -> dict:
    """获取模型详细信息"""
    try:
        pipeline = get_pipeline()
        pipeline_info = pipeline.get_pipeline_info()

        return {
            "pipeline_version": "2.0.0",
            "initialized": pipeline_info.get("initialized", False),
            "config": pipeline_info.get("config", {}),
            "components": pipeline_info.get("components", {}),
            "supported_languages": ["en", "en-US", "en-GB", "zh", "zh-CN"],
            "supported_formats": ["wav", "mp3", "flac", "m4a"],
            "features": [
                "音频预处理和格式转换",
                "WhisperX转录和对齐",
                "wav2vec2特征提取",
                "GOP和embedding评分",
                "0-100分数归一化",
                "详细诊断信息"
            ]
        }

    except Exception as e:
        logging.error(f"获取模型信息失败: {e}", exc_info=True)
        return {
            "error": str(e),
            "description": "无法获取模型信息"
        }


@app.post("/api/pipeline/initialize")
def initialize_pipeline(language: str = "en") -> dict:
    """手动初始化流水线"""
    try:
        pipeline = get_pipeline()

        if pipeline.initialize():
            if pipeline.is_ready(language):
                return {
                    "status": "success",
                    "message": f"流水线初始化成功，支持语言: {language}",
                    "pipeline_info": pipeline.get_pipeline_info()
                }
            else:
                return {
                    "status": "partial",
                    "message": f"流水线初始化完成，但语言 {language} 可能不完全支持",
                    "pipeline_info": pipeline.get_pipeline_info()
                }
        else:
            return {
                "status": "failed",
                "message": "流水线初始化失败"
            }

    except Exception as e:
        logging.error(f"流水线初始化失败: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"流水线初始化异常: {str(e)}"
        }
