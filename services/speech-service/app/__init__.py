"""
Sylis Speech Service - 语音评估服务

基于 Kaldi/MFA 的音素级语音评分系统
"""

__version__ = "2.0.0"
__author__ = "wqj"

from .audio_processor import AudioProcessor, create_audio_processor
from .mfa_aligner import MFAAligner, create_mfa_aligner, AlignmentResult
from .pytorch_phoneme_scorer import PyTorchPhonemeScorer, create_pytorch_phoneme_scorer
from .pronunciation_pipeline import (
    PronunciationPipeline,
    PipelineConfig,
    create_default_pipeline,
    create_pronunciation_pipeline
)

__all__ = [
    "AudioProcessor",
    "create_audio_processor",
    "MFAAligner",
    "create_mfa_aligner",
    "AlignmentResult",
    "PyTorchPhonemeScorer",
    "create_pytorch_phoneme_scorer",
    "PronunciationPipeline",
    "PipelineConfig",
    "create_default_pipeline",
    "create_pronunciation_pipeline",
]
