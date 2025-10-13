"""
发音评估流水线 - 完整的语音评分系统

整合 MFA 对齐、音素评分、置信度计算等模块，提供端到端的发音评估服务。

流程：
1. 音频预处理（AudioProcessor）
2. 音素对齐（MFAAligner）- 使用 MFA (Kaldi GMM-HMM)
3. 音素评分（PyTorchPhonemeScorer）- PyTorch DNN + 交叉熵
4. 置信度计算（PhonemeConfidence）
5. 结果汇总和归一化

✅ 按照儿童英语评分系统方案实现：
- MFA 进行音素对齐（不训练，使用预训练模型）
- PyTorch DNN 进行评分（已训练，交叉熵损失）
- GOP 算法计算发音准确度
"""

import time
import logging
from typing import Optional, Dict
from dataclasses import dataclass

import numpy as np

from .audio_processor import AudioProcessor, create_audio_processor
from .mfa_aligner import MFAAligner, create_mfa_aligner, AlignmentResult
from .pytorch_phoneme_scorer import PyTorchPhonemeScorer, create_pytorch_phoneme_scorer, PhonemeScore
from .phoneme_confidence import (
    calculate_sentence_confidence,
    calculate_gop_statistics,
    SentenceConfidence
)
from .score_normalizer import ScoreNormalizer, create_score_normalizer
from .schemas import (
    PronunciationAssessment,
    PipelineResult,
    ProcessingStep,
    WordDetail,
    PhonemeDetail,
    create_assessment,
    create_word_detail,
    create_phoneme_detail
)

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """
    流水线配置

    ✅ 按照文章方案的配置参数
    """
    # 评分模型配置
    pytorch_model_path: Optional[str] = None  # PyTorch 模型路径（.pth）
    device: str = 'cpu'  # PyTorch 设备（'cpu' 或 'cuda'）

    # 音频处理配置
    enable_noise_reduction: bool = False
    target_sample_rate: int = 16000

    # MFA 对齐配置（基于 Kaldi）
    acoustic_model: str = "english_us_arpa"
    dictionary: str = "english_us_arpa"

    # 评分归一化配置
    normalization_method: str = "sigmoid"

    # 其他配置
    enable_phoneme_detail: bool = True
    enable_gop_statistics: bool = True


class PronunciationPipeline:
    """
    发音评估流水线

    完整的语音评分系统，从音频输入到评分输出。
    """

    def __init__(self, config: Optional[PipelineConfig] = None):
        """
        初始化流水线

        Args:
            config: 流水线配置
        """
        self.config = config or PipelineConfig()

        # 初始化各个组件
        self.audio_processor: Optional[AudioProcessor] = None
        self.aligner: Optional[MFAAligner] = None
        self.scorer: Optional[PyTorchPhonemeScorer] = None
        self.normalizer: Optional[ScoreNormalizer] = None

        self._initialized = False
        self.processing_steps: list = []

        logger.info("创建发音评估流水线")

    def initialize(self) -> bool:
        """
        初始化所有组件

        Returns:
            bool: 初始化是否成功
        """
        if self._initialized:
            return True

        try:
            # 1. 初始化音频处理器
            self.audio_processor = create_audio_processor(
                enable_noise_reduction=self.config.enable_noise_reduction
            )

            # 2. 初始化 MFA 对齐器
            self.aligner = create_mfa_aligner(
                acoustic_model=self.config.acoustic_model,
                dictionary=self.config.dictionary
            )
            if not self.aligner.initialize():
                logger.error("❌ MFA 对齐器初始化失败")
                return False

            # 3. 初始化 PyTorch 音素评分器
            self.scorer = create_pytorch_phoneme_scorer(
                model_path=self.config.pytorch_model_path,
                device=self.config.device
            )
            if not self.scorer.initialize():
                logger.error("❌ PyTorch 评分器初始化失败")
                return False

            # 4. 初始化评分归一化器
            self.normalizer = create_score_normalizer(
                method=self.config.normalization_method
            )

            self._initialized = True
            logger.info("✅ 发音评估流水线初始化完成")
            return True

        except Exception as e:
            logger.error(f"❌ 流水线初始化失败: {e}", exc_info=True)
            return False

    def assess_pronunciation(
        self,
        audio_path: str,
        reference_text: str,
        language: str = "en-US"
    ) -> PipelineResult:
        """
        评估发音

        Args:
            audio_path: 音频文件路径
            reference_text: 参考文本
            language: 语言代码

        Returns:
            PipelineResult: 评估结果
        """
        if not self._initialized:
            if not self.initialize():
                return PipelineResult(
                    success=False,
                    assessment=None,
                    error_message="流水线初始化失败"
                )

        self.processing_steps = []
        start_time = time.time()

        try:
            # Step 1: 音频预处理
            step_start = time.time()
            audio_data = self.audio_processor.load_audio(audio_path)
            audio_data = self.audio_processor.preprocess_audio(audio_data)
            self._record_step("audio_preprocessing", step_start, time.time(), True)

            # Step 2: 音素对齐
            step_start = time.time()
            alignment = self.aligner.align(audio_path, reference_text)

            if not alignment.success:
                return PipelineResult(
                    success=False,
                    assessment=None,
                    error_message=f"对齐失败: {alignment.error_message}"
                )

            self._record_step("phoneme_alignment", step_start, time.time(), True)

            # Step 3: 音素评分
            step_start = time.time()
            phoneme_scores = self.scorer.score_phonemes(
                audio_path,
                audio_data.sample_rate,
                alignment
            )

            if not phoneme_scores:
                return PipelineResult(
                    success=False,
                    assessment=None,
                    error_message="音素评分失败"
                )

            self._record_step("phoneme_scoring", step_start, time.time(), True)

            # Step 4: 置信度计算
            step_start = time.time()

            # 估算预期时长（每个音素约 100ms）
            expected_duration = len(alignment.phonemes) * 0.1

            sentence_confidence = calculate_sentence_confidence(
                phoneme_scores,
                expected_duration,
                alignment.total_duration
            )

            self._record_step("confidence_calculation", step_start, time.time(), True)

            # Step 5: 结果汇总
            step_start = time.time()
            assessment = self._build_assessment(
                alignment,
                phoneme_scores,
                sentence_confidence
            )
            self._record_step("result_aggregation", step_start, time.time(), True)

            # 计算总耗时
            total_time = time.time() - start_time
            step_times = {step.name: step.duration for step in self.processing_steps}

            logger.info(f"✅ 评估完成! 总耗时: {total_time:.2f}s, 总分: {assessment.overall_score:.1f}")

            return PipelineResult(
                success=True,
                assessment=assessment,
                processing_time=total_time,
                step_times=step_times
            )

        except Exception as e:
            logger.error(f"❌ 评估失败: {e}", exc_info=True)
            return PipelineResult(
                success=False,
                assessment=None,
                error_message=str(e),
                processing_time=time.time() - start_time
            )

    def _build_assessment(
        self,
        alignment: AlignmentResult,
        phoneme_scores: list,
        sentence_confidence: SentenceConfidence
    ) -> PronunciationAssessment:
        """
        构建评估结果

        Args:
            alignment: 对齐结果
            phoneme_scores: 音素评分列表
            sentence_confidence: 句子置信度

        Returns:
            PronunciationAssessment: 完整的评估结果
        """
        # 构建单词详细信息
        words = []

        for word_confidence in sentence_confidence.word_confidences:
            # 获取该单词的音素详细信息
            phonemes = []
            for ps in word_confidence.phoneme_scores:
                # 转换 nbest_phonemes
                from .schemas import NBestPhoneme
                nbest = None
                if hasattr(ps, 'nbest_phonemes') and ps.nbest_phonemes:
                    nbest = [NBestPhoneme(**item) for item in ps.nbest_phonemes]

                phoneme_detail = create_phoneme_detail(
                    phoneme=ps.phoneme,
                    score=ps.score,
                    confidence=ps.confidence,
                    start_time=ps.start_time,
                    end_time=ps.end_time,
                    gop_score=ps.gop_score,
                    target_prob=ps.target_prob,
                    confusion_prob=ps.confusion_prob,
                    error_type=getattr(ps, 'error_type', 'None'),
                    nbest_phonemes=nbest
                )
                phonemes.append(phoneme_detail)

            # 获取单词的时间范围
            if phonemes:
                start_time = phonemes[0].start_time
                end_time = phonemes[-1].end_time
            else:
                start_time = 0.0
                end_time = 0.0

            # 计算单词的 error_type（基于音素）
            word_error_type = "None"
            if phonemes:
                error_phonemes = [p for p in phonemes if p.error_type != "None"]
                if len(error_phonemes) > len(phonemes) / 2:  # 超过一半音素错误
                    word_error_type = "Mispronunciation"
                elif error_phonemes:
                    word_error_type = "None"  # 部分错误仍算正确

            word_detail = WordDetail(
                word=word_confidence.word,
                score=word_confidence.accuracy_score,
                confidence=word_confidence.confidence,
                start_time=start_time,
                end_time=end_time,
                duration=end_time - start_time,
                error_type=word_error_type,
                phonemes=phonemes
            )
            words.append(word_detail)

        # 计算 GOP 统计信息
        gop_stats = None
        if self.config.enable_gop_statistics:
            gop_stats = calculate_gop_statistics(phoneme_scores)

        # 识别错误音素（分数低于 60 的）
        error_phonemes = [
            ps.phoneme for ps in phoneme_scores if ps.score < 60
        ]

        # 创建评估结果
        assessment = create_assessment(
            overall_score=sentence_confidence.overall_score,
            accuracy_score=sentence_confidence.accuracy_score,
            fluency_score=sentence_confidence.fluency_score,
            completeness_score=sentence_confidence.completeness_score,
            duration=alignment.total_duration,
            words=words,
            gop_statistics=gop_stats,
            error_phonemes=list(set(error_phonemes)) if error_phonemes else None
        )

        return assessment

    def _record_step(
        self,
        name: str,
        start_time: float,
        end_time: float,
        success: bool,
        error_message: Optional[str] = None
    ):
        """记录处理步骤"""
        step = ProcessingStep(
            name=name,
            start_time=start_time,
            end_time=end_time,
            success=success,
            error_message=error_message
        )
        self.processing_steps.append(step)

    def is_ready(self, language: str = "en") -> bool:
        """
        检查流水线是否就绪

        Args:
            language: 语言代码

        Returns:
            bool: 是否就绪
        """
        return self._initialized

    def get_pipeline_info(self) -> Dict:
        """
        获取流水线信息

        Returns:
            Dict: 流水线配置和状态信息
        """
        return {
            "initialized": self._initialized,
            "config": {
                "acoustic_model": self.config.acoustic_model,
                "dictionary": self.config.dictionary,
                "pytorch_model_path": self.config.pytorch_model_path,
                "device": self.config.device,
                "normalization_method": self.config.normalization_method,
            },
            "components": {
                "audio_processor": self.audio_processor is not None,
                "aligner": self.aligner is not None,
                "scorer": self.scorer is not None,
                "normalizer": self.normalizer is not None,
            },
            "model_info": {
                "model_type": "PyTorch DNN",
                "model_path": self.config.pytorch_model_path,
            }
        }

    def save_intermediate_results(
        self,
        result: PipelineResult,
        output_dir: str
    ):
        """
        保存中间结果（用于调试）

        Args:
            result: 流水线结果
            output_dir: 输出目录
        """
        import os
        import json

        os.makedirs(output_dir, exist_ok=True)

        # 保存评估结果
        if result.assessment:
            result_path = os.path.join(output_dir, "assessment.json")
            with open(result_path, 'w', encoding='utf-8') as f:
                json.dump(result.assessment.to_dict(), f, indent=2, ensure_ascii=False)

        # 保存处理步骤时间
        if result.step_times:
            times_path = os.path.join(output_dir, "step_times.json")
            with open(times_path, 'w', encoding='utf-8') as f:
                json.dump(result.step_times, f, indent=2)

        logger.info(f"中间结果已保存到: {output_dir}")


def create_default_pipeline(
    pytorch_model_path: Optional[str] = None,
    device: str = 'cpu'
) -> PronunciationPipeline:
    """
    创建默认配置的流水线

    ✅ 使用 PyTorch DNN 模型进行音素评分

    Args:
        pytorch_model_path: PyTorch 模型路径（可选，默认使用 models/pytorch_phoneme_dnn/final_model.pth）
        device: 计算设备（'cpu' 或 'cuda'）

    Returns:
        PronunciationPipeline: 流水线实例

    示例:
        # 使用默认模型
        pipeline = create_default_pipeline()

        # 指定模型路径
        pipeline = create_default_pipeline(
            pytorch_model_path="models/pytorch_phoneme_dnn/final_model.pth"
        )
    """
    config = PipelineConfig(
        enable_noise_reduction=False,
        acoustic_model="english_us_arpa",
        dictionary="english_us_arpa",
        pytorch_model_path=pytorch_model_path,  # PyTorch 模型
        device=device,
        normalization_method="sigmoid",
        enable_phoneme_detail=True,
        enable_gop_statistics=True
    )

    return PronunciationPipeline(config=config)


def create_pronunciation_pipeline(
    config: Optional[PipelineConfig] = None
) -> PronunciationPipeline:
    """
    创建发音评估流水线的工厂函数

    Args:
        config: 流水线配置

    Returns:
        PronunciationPipeline: 流水线实例
    """
    return PronunciationPipeline(config=config)

