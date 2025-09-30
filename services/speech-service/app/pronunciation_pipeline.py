"""
发音评估流水线 - 整合所有步骤的完整流程

按照音素级发音评分流程，整合以下步骤：
1. 音频处理 (AudioProcessor)
2. WhisperX对齐 (WhisperXAligner)
3. 特征提取 (FeatureExtractor)
4. 音素评分 (PhonemeScorer)
5. 分数归一化 (ScoreNormalizer)
"""

import logging
import time
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import os

from audio_processor import AudioProcessor, AudioData, create_audio_processor
from whisperx_aligner import WhisperXAligner, AlignmentResult, create_whisperx_aligner
from feature_extractor import FeatureExtractor, FeatureExtractionResult, create_feature_extractor
from phoneme_scorer import PhonemeScorer, ScoringResult, create_phoneme_scorer
from score_normalizer import ScoreNormalizer, PronunciationAssessment, create_score_normalizer

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """流水线配置"""
    # 音频处理配置
    enable_noise_reduction: bool = False

    # WhisperX配置
    whisper_model_size: str = "large"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_batch_size: int = 16

    # 特征提取配置
    feature_model_name: str = "facebook/wav2vec2-base-960h"
    feature_device: str = "cpu"
    feature_cache_dir: Optional[str] = None

    # 评分配置
    reference_data_path: Optional[str] = None
    gop_weight: float = 0.6
    embedding_weight: float = 0.4
    use_duration_normalization: bool = True

    # 归一化配置
    normalization_method: str = "min_max"
    include_diagnostics: bool = True
    include_visualization_data: bool = True


@dataclass
class PipelineResult:
    """流水线执行结果"""
    assessment: PronunciationAssessment  # 最终评估结果
    processing_time: float               # 总处理时间
    step_times: Dict[str, float]         # 各步骤耗时
    intermediate_results: Dict[str, Any] # 中间结果（调试用）
    success: bool                        # 是否成功
    error_message: Optional[str] = None  # 错误信息


class PronunciationPipeline:
    """
    发音评估流水线类

    整合完整的音素级发音评分流程，提供简单易用的接口。
    """

    def __init__(self, config: Optional[PipelineConfig] = None):
        """
        初始化发音评估流水线

        Args:
            config: 流水线配置，如果为None则使用默认配置
        """
        self.config = config or PipelineConfig()

        # 组件实例（延迟初始化）
        self._audio_processor = None
        self._whisperx_aligner = None
        self._feature_extractor = None
        self._phoneme_scorer = None
        self._score_normalizer = None

        # 初始化状态
        self._initialized = False


    def initialize(self) -> bool:
        """
        初始化所有组件

        Returns:
            bool: 初始化是否成功
        """
        try:
            if self._initialized:
                return True

            start_time = time.time()

            # 1. 初始化音频处理器
            self._audio_processor = create_audio_processor(
                enable_noise_reduction=self.config.enable_noise_reduction
            )

            # 2. 初始化WhisperX对齐器
            self._whisperx_aligner = create_whisperx_aligner(
                model_size=self.config.whisper_model_size,
                device=self.config.whisper_device,
                compute_type=self.config.whisper_compute_type,
                batch_size=self.config.whisper_batch_size
            )

            # 3. 初始化特征提取器
            self._feature_extractor = create_feature_extractor(
                model_name=self.config.feature_model_name,
                device=self.config.feature_device,
                cache_dir=self.config.feature_cache_dir
            )

            # 4. 初始化音素评分器
            self._phoneme_scorer = create_phoneme_scorer(
                reference_data_path=self.config.reference_data_path,
                gop_weight=self.config.gop_weight,
                embedding_weight=self.config.embedding_weight,
                use_duration_normalization=self.config.use_duration_normalization
            )

            # 5. 初始化分数归一化器
            self._score_normalizer = create_score_normalizer(
                normalization_method=self.config.normalization_method,
                include_diagnostics=self.config.include_diagnostics,
                include_visualization_data=self.config.include_visualization_data
            )

            init_time = time.time() - start_time
            self._initialized = True

            return True

        except Exception as e:
            logger.error(f"❌ 流水线初始化失败: {e}")
            return False

    def assess_pronunciation(self,
                           audio_path: str,
                           reference_text: str,
                           language: str = "en-US") -> PipelineResult:
        """
        执行完整的发音评估

        Args:
            audio_path: 音频文件路径
            reference_text: 参考文本
            language: 语言代码

        Returns:
            PipelineResult: 评估结果
        """
        start_time = time.time()
        step_times = {}
        intermediate_results = {}

        try:
            # 确保流水线已初始化
            if not self._initialized:
                if not self.initialize():
                    return PipelineResult(
                        assessment=None,
                        processing_time=0.0,
                        step_times={},
                        intermediate_results={},
                        success=False,
                        error_message="流水线初始化失败"
                    )


            # Step 1: 音频处理
            step_start = time.time()

            audio_data = self._audio_processor.load_audio(audio_path)
            # 执行音频预处理：重采样、单声道转换、噪声抑制等
            processed_audio = self._audio_processor.preprocess_audio(audio_data)

            step_times["audio_processing"] = time.time() - step_start
            intermediate_results["audio_data"] = {
                "original_duration": audio_data.duration,
                "processed_duration": processed_audio.duration,
                "original_sample_rate": audio_data.sample_rate,
                "processed_sample_rate": processed_audio.sample_rate,
                "original_channels": audio_data.channels,
                "processed_channels": processed_audio.channels,
                "preprocessing_enabled": True,
                "noise_reduction_enabled": self.config.enable_noise_reduction
            }

            # Step 2: WhisperX对齐
            step_start = time.time()

            alignment_result = self._whisperx_aligner.align_audio(
                processed_audio, reference_text, language
            )

            step_times["whisperx_alignment"] = time.time() - step_start
            intermediate_results["alignment"] = {
                "word_count": alignment_result.word_count,
                "total_phonemes": alignment_result.total_phonemes,
                "transcript": alignment_result.transcript,
                "phoneme_transcript": alignment_result.phoneme_transcript
            }


            # Step 3: 特征提取
            step_start = time.time()

            feature_result = self._feature_extractor.extract_features(
                processed_audio, alignment_result
            )

            step_times["feature_extraction"] = time.time() - step_start
            intermediate_results["features"] = {
                "total_frames": feature_result.total_frames,
                "frame_rate": feature_result.frame_rate,
                "model_name": feature_result.model_name
            }

            # Step 4: 音素评分
            step_start = time.time()

            scoring_result = self._phoneme_scorer.score_phonemes(feature_result)

            step_times["phoneme_scoring"] = time.time() - step_start
            intermediate_results["scoring"] = {
                "overall_score": scoring_result.overall_score,
                "gop_stats": scoring_result.gop_stats,
                "embedding_stats": scoring_result.embedding_stats
            }

            # Step 5: 分数归一化
            step_start = time.time()

            assessment = self._score_normalizer.normalize_scores(scoring_result)

            step_times["score_normalization"] = time.time() - step_start

            # 计算总处理时间
            total_time = time.time() - start_time


            return PipelineResult(
                assessment=assessment,
                processing_time=total_time,
                step_times=step_times,
                intermediate_results=intermediate_results,
                success=True
            )

        except Exception as e:
            total_time = time.time() - start_time
            error_msg = f"发音评估失败: {e}"
            logger.error(f"❌ {error_msg}")

            return PipelineResult(
                assessment=None,
                processing_time=total_time,
                step_times=step_times,
                intermediate_results=intermediate_results,
                success=False,
                error_message=error_msg
            )

    def is_ready(self, language: str = "en") -> bool:
        """
        检查流水线是否就绪

        Args:
            language: 要检查的语言

        Returns:
            bool: 是否就绪
        """
        try:
            if not self._initialized:
                return False

            # 检查各组件是否就绪
            checks = [
                self._whisperx_aligner.is_ready(language),
                self._feature_extractor.is_ready()
            ]

            return all(checks)

        except Exception as e:
            logger.error(f"❌ 就绪检查失败: {e}")
            return False

    def get_pipeline_info(self) -> Dict[str, Any]:
        """获取流水线信息"""
        info = {
            "initialized": self._initialized,
            "config": {
                "whisper_model": self.config.whisper_model_size,
                "feature_model": self.config.feature_model_name,
                "device": self.config.whisper_device,
                "normalization_method": self.config.normalization_method
            }
        }

        if self._initialized:
            try:
                info["components"] = {
                    "whisperx": self._whisperx_aligner.get_model_info(),
                    "feature_extractor": self._feature_extractor.get_model_info()
                }
            except Exception as e:
                logger.warning(f"⚠️ 获取组件信息失败: {e}")

        return info

    def save_intermediate_results(self,
                                result: PipelineResult,
                                output_dir: str) -> None:
        """
        保存中间结果到文件

        Args:
            result: 流水线结果
            output_dir: 输出目录
        """
        try:
            os.makedirs(output_dir, exist_ok=True)

            # 保存最终评估结果
            assessment_path = os.path.join(output_dir, "assessment.json")
            with open(assessment_path, 'w', encoding='utf-8') as f:
                f.write(result.assessment.to_json())

            # 保存处理信息
            processing_info = {
                "processing_time": result.processing_time,
                "step_times": result.step_times,
                "intermediate_results": result.intermediate_results,
                "success": result.success,
                "error_message": result.error_message
            }

            info_path = os.path.join(output_dir, "processing_info.json")
            with open(info_path, 'w', encoding='utf-8') as f:
                import json
                json.dump(processing_info, f, indent=2, ensure_ascii=False)


        except Exception as e:
            logger.error(f"❌ 保存中间结果失败: {e}")


def create_pronunciation_pipeline(config: Optional[PipelineConfig] = None) -> PronunciationPipeline:
    """
    创建发音评估流水线实例的工厂函数

    Args:
        config: 流水线配置

    Returns:
        PronunciationPipeline: 流水线实例
    """
    return PronunciationPipeline(config=config)


def create_default_pipeline() -> PronunciationPipeline:
    """
    创建默认配置的发音评估流水线

    Returns:
        PronunciationPipeline: 默认配置的流水线实例
    """
    config = PipelineConfig(
        # 使用CPU友好的配置
        whisper_model_size="large",
        whisper_device="cpu",
        whisper_compute_type="int8",
        feature_model_name="wav2vec2-base",
        feature_device="cpu",
        # 启用完整的诊断和可视化
        include_diagnostics=True,
        include_visualization_data=True
    )

    return create_pronunciation_pipeline(config)
