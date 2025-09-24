from typing import List, Optional
from pydantic import BaseModel


class PhonemeItem(BaseModel):
    phoneme: str
    start: float
    end: float
    confidence: float


class WordItem(BaseModel):
    word: str
    start: float
    end: float
    accuracyScore: float
    phonemes: List[PhonemeItem] = []


class AssessmentResponse(BaseModel):
    overallScore: float
    accuracyScore: float
    fluencyScore: float
    completenessScore: float
    duration: float
    words: List[WordItem]


