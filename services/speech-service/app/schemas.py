"""
数据模型和类型定义

定义 API 请求/响应的数据结构。
"""

from typing import List, Optional, Dict
from dataclasses import dataclass, asdict
from pydantic import BaseModel, Field


def to_camel(string: str) -> str:
    """将 snake_case 转换为 camelCase"""
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


# ============================================================================
# Pydantic 模型（用于 API）
# ============================================================================

class NBestPhoneme(BaseModel):
    """NBest 候选音素"""
    phoneme: str = Field(..., description="音素符号")
    score: float = Field(..., ge=0, le=100, description="分数（0-100）")

    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {
            float: lambda v: round(v, 1) if v is not None else None
        }


class PhonemeDetail(BaseModel):
    """音素详细信息"""
    phoneme: str = Field(..., description="音素符号（ARPAbet 格式）")
    score: float = Field(..., ge=0, le=100, description="音素得分（0-100）")
    confidence: float = Field(..., ge=0, le=1, description="置信度（0-1）")
    start_time: float = Field(..., ge=0, description="开始时间（秒）")
    end_time: float = Field(..., ge=0, description="结束时间（秒）")
    duration: float = Field(..., ge=0, description="持续时间（秒）")
    gop_score: Optional[float] = Field(None, description="GOP 原始分数")
    target_prob: Optional[float] = Field(None, description="目标音素概率")
    confusion_prob: Optional[float] = Field(None, description="混淆音素概率")
    error_type: Optional[str] = Field("None", description="错误类型：None/Mispronunciation/Omission")
    nbest_phonemes: Optional[List[NBestPhoneme]] = Field(None, description="Top-5 候选音素")

    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {
            float: lambda v: round(v, 1) if v is not None else None
        }
        json_schema_extra = {
            "example": {
                "phoneme": "HH",
                "score": 98.0,
                "confidence": 0.964,
                "startTime": 0.0,
                "endTime": 0.09,
                "duration": 0.09,
                "gopScore": 3.282,
                "targetProb": 0.8788,
                "confusionProb": 0.0330,
                "errorType": "None",
                "nbestPhonemes": [
                    {"phoneme": "HH", "score": 100.0},
                    {"phoneme": "AY", "score": 52.0},
                    {"phoneme": "P", "score": 35.0},
                    {"phoneme": "K", "score": 23.0},
                    {"phoneme": "AE", "score": 20.0}
                ]
            }
        }


class WordDetail(BaseModel):
    """单词详细信息"""
    word: str = Field(..., description="单词文本")
    score: float = Field(..., ge=0, le=100, description="单词得分（0-100）")
    confidence: float = Field(..., ge=0, le=1, description="置信度（0-1）")
    start_time: float = Field(..., ge=0, description="开始时间（秒）")
    end_time: float = Field(..., ge=0, description="结束时间（秒）")
    duration: float = Field(..., ge=0, description="持续时间（秒）")
    error_type: Optional[str] = Field("None", description="错误类型：None/Mispronunciation/Omission")
    phonemes: List[PhonemeDetail] = Field(..., description="音素列表")

    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {
            float: lambda v: round(v, 1) if v is not None else None
        }
        json_schema_extra = {
            "example": {
                "word": "hello",
                "score": 87.3,
                "confidence": 0.91,
                "startTime": 0.0,
                "endTime": 0.8,
                "duration": 0.8,
                "errorType": "None",
                "phonemes": []
            }
        }


class PronunciationAssessment(BaseModel):
    """发音评估结果"""
    overall_score: float = Field(..., ge=0, le=100, description="总体得分（0-100）")
    accuracy_score: float = Field(..., ge=0, le=100, description="准确性得分（0-100）")
    fluency_score: float = Field(..., ge=0, le=100, description="流利度得分（0-100）")
    completeness_score: float = Field(..., ge=0, le=100, description="完整性得分（0-100）")

    duration: float = Field(..., ge=0, description="音频时长（秒）")
    word_count: int = Field(..., ge=0, description="单词数量")
    phoneme_count: int = Field(..., ge=0, description="音素数量")

    words: List[WordDetail] = Field(..., description="单词级详细信息")

    # 可选的统计信息
    gop_statistics: Optional[Dict[str, float]] = Field(None, description="GOP 统计信息")
    error_phonemes: Optional[List[str]] = Field(None, description="错误音素列表")

    def to_dict(self) -> dict:
        """转换为字典（使用 camelCase）"""
        return self.model_dump(by_alias=True, mode='json')

    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {
            float: lambda v: round(v, 1) if v is not None else None
        }
        json_schema_extra = {
            "example": {
                "overallScore": 85.5,
                "accuracyScore": 87.2,
                "fluencyScore": 82.1,
                "completenessScore": 100.0,
                "duration": 2.5,
                "wordCount": 3,
                "phonemeCount": 12,
                "words": [],
                "gopStatistics": {
                    "meanGop": 1.2,
                    "stdGop": 0.8,
                    "minGop": -0.5,
                    "maxGop": 3.2
                },
                "errorPhonemes": ["TH", "V"]
            }
        }


class AssessmentRequest(BaseModel):
    """评估请求"""
    reference_text: str = Field(..., min_length=1, description="参考文本")
    language: str = Field("en-US", description="语言代码")
    enable_phoneme_detail: bool = Field(True, description="是否返回音素详细信息")

    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {
            float: lambda v: round(v, 1) if v is not None else None
        }
        json_schema_extra = {
            "example": {
                "referenceText": "Hello world",
                "language": "en-US",
                "enablePhonemeDetail": True
            }
        }


# ============================================================================
# 数据类（用于内部处理）
# ============================================================================

@dataclass
class PipelineResult:
    """流水线处理结果"""
    success: bool
    assessment: Optional[PronunciationAssessment]
    error_message: Optional[str] = None
    processing_time: float = 0.0
    step_times: Optional[Dict[str, float]] = None

    def to_dict(self) -> dict:
        """转换为字典"""
        result = {
            'success': self.success,
            'error_message': self.error_message,
            'processing_time': self.processing_time,
        }

        if self.assessment:
            result['assessment'] = self.assessment.to_dict()

        if self.step_times:
            result['step_times'] = self.step_times

        return result


@dataclass
class ProcessingStep:
    """处理步骤"""
    name: str
    start_time: float
    end_time: float
    success: bool
    error_message: Optional[str] = None

    @property
    def duration(self) -> float:
        """步骤耗时"""
        return self.end_time - self.start_time


# ============================================================================
# 辅助函数
# ============================================================================

def create_phoneme_detail(
    phoneme: str,
    score: float,
    confidence: float,
    start_time: float,
    end_time: float,
    **kwargs
) -> PhonemeDetail:
    """创建音素详细信息"""
    return PhonemeDetail(
        phoneme=phoneme,
        score=score,
        confidence=confidence,
        start_time=start_time,
        end_time=end_time,
        duration=end_time - start_time,
        **kwargs
    )


def create_word_detail(
    word: str,
    score: float,
    confidence: float,
    start_time: float,
    end_time: float,
    phonemes: List[PhonemeDetail]
) -> WordDetail:
    """创建单词详细信息"""
    return WordDetail(
        word=word,
        score=score,
        confidence=confidence,
        start_time=start_time,
        end_time=end_time,
        duration=end_time - start_time,
        phonemes=phonemes
    )


def create_assessment(
    overall_score: float,
    accuracy_score: float,
    fluency_score: float,
    completeness_score: float,
    duration: float,
    words: List[WordDetail],
    **kwargs
) -> PronunciationAssessment:
    """创建评估结果"""
    # 统计单词和音素数量
    word_count = len(words)
    phoneme_count = sum(len(w.phonemes) for w in words)

    return PronunciationAssessment(
        overall_score=overall_score,
        accuracy_score=accuracy_score,
        fluency_score=fluency_score,
        completeness_score=completeness_score,
        duration=duration,
        word_count=word_count,
        phoneme_count=phoneme_count,
        words=words,
        **kwargs
    )


def merge_phoneme_scores(
    phoneme_scores: List,
    alignment_phonemes: List
) -> List[PhonemeDetail]:
    """
    合并音素评分和对齐信息

    Args:
        phoneme_scores: 音素评分列表
        alignment_phonemes: 对齐音素列表

    Returns:
        List[PhonemeDetail]: 合并后的音素详细信息
    """
    phoneme_details = []

    for ps in phoneme_scores:
        # 转换 nbest_phonemes 为 NBestPhoneme 对象列表
        nbest = None
        if hasattr(ps, 'nbest_phonemes') and ps.nbest_phonemes:
            nbest = [NBestPhoneme(**item) for item in ps.nbest_phonemes]

        detail = create_phoneme_detail(
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
        phoneme_details.append(detail)

    return phoneme_details

