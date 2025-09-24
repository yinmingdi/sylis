import os
import tempfile
import json
import yaml
import numpy as np
from dataclasses import dataclass
from typing import List, Optional, Dict, Any, Tuple
import torch
import torchaudio
import logging
import os.path as osp

# WeNet imports
WENET_AVAILABLE = False
try:
    from wenet.utils.init_model import init_model, load_checkpoint
    from wenet.utils.file_utils import read_symbol_table
    from wenet.models.transformer.ctc import CTC
    from wenet.models.transformer.decoder import TransformerDecoder
    from wenet.models.transformer.encoder import ConformerEncoder
    from wenet.models.transformer.asr_model import ASRModel
    WENET_AVAILABLE = True
except (ImportError, AttributeError, ModuleNotFoundError) as e:
    # 捕获所有可能的导入错误，包括依赖版本冲突
    print(f"Warning: WeNet not available: {e}. Using fallback alignment.")
    WENET_AVAILABLE = False

# 设置日志
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# 过滤掉WeNet的unexpected tensor日志
class WeNetLogFilter(logging.Filter):
    def filter(self, record):
        return "unexpected tensor" not in record.getMessage()

# 为root logger添加过滤器
root_logger = logging.getLogger()
root_logger.addFilter(WeNetLogFilter())


@dataclass
class PhonemeSegment:
    phoneme: str
    start: float
    end: float
    confidence: float


@dataclass
class WordSegment:
    word: str
    start: float
    end: float
    phonemes: List[PhonemeSegment]


@dataclass
class AlignmentResult:
    words: List[WordSegment]
    duration: float
    raw_confidence: List[float]


class WeNetAlignment:
    def __init__(self, model_path: str = None, config_path: str = None, dict_path: str = None):
        """初始化 WeNet 模型"""
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.debug(f"Using device: {self.device}")

        # 如果没有提供路径，使用默认值
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(current_dir)

        # 优先使用下载的模型文件
        downloaded_model = os.path.join(project_root, "downloads/20210610_u2pp_conformer_exp/final.pt")
        local_model = os.path.join(project_root, "models/final.pt")
        default_model = downloaded_model if os.path.exists(downloaded_model) else local_model

        self.model_path = model_path or os.getenv("WENET_MODEL_PATH", default_model)
        self.config_path = config_path or os.getenv("WENET_CONFIG_PATH", os.path.join(project_root, "config", "wenet_config.yaml"))

        # 优先使用下载的词典文件
        downloaded_dict = os.path.join(project_root, "downloads/20210610_u2pp_conformer_exp/units.txt")
        local_dict = os.path.join(project_root, "config", "words.txt")
        default_dict = downloaded_dict if os.path.exists(downloaded_dict) else local_dict

        self.dict_path = dict_path or os.getenv("WENET_DICT_PATH", default_dict)

        self.model = None
        self.config = None
        self.char_dict = None
        self.vocab_size = 0
        self.g2p = None  # lazy init
        self.spm = None  # sentencepiece processor if available
        self.cmvn_mean = None
        self.cmvn_istd = None

        if not WENET_AVAILABLE:
            raise RuntimeError("WeNet library is not available. Please install WeNet properly.")

        try:
            # 加载配置
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    self.config = yaml.safe_load(f)
                logger.info(f"Loaded config from {self.config_path}")
            else:
                logger.warning(f"Config file not found at {self.config_path}, using default config")
                self.config = self._get_default_config()

            # 加载词典
            if os.path.exists(self.dict_path):
                self.char_dict = read_symbol_table(self.dict_path)
                self.vocab_size = len(self.char_dict)
                logger.info(f"Loaded vocabulary with {self.vocab_size} tokens")
            else:
                logger.warning(f"Dictionary not found at {self.dict_path}, using default")
                self.char_dict = self._get_default_char_dict()
                self.vocab_size = len(self.char_dict)

            # 初始化模型
            if not os.path.exists(self.model_path):
                raise RuntimeError(f"Model file not found at {self.model_path}")

            self.model = self._init_model()
            if not self.model:
                raise RuntimeError("Failed to initialize WeNet model")

            self.model.to(self.device)
            self.model.eval()
            logger.info("WeNet model loaded successfully")

            # 加载 SentencePiece 模型（若存在）
            spm_path = os.getenv("WENET_SPM_PATH")
            if not spm_path:
                # downloads 中常见的 spm 路径
                candidate = os.path.join(project_root, "downloads/20210610_u2pp_conformer_exp/train_960_unigram5000.model")
                if os.path.exists(candidate):
                    spm_path = candidate
            if spm_path and os.path.exists(spm_path):
                try:
                    import sentencepiece as spm
                    self.spm = spm.SentencePieceProcessor()
                    self.spm.Load(spm_path)
                    logger.info(f"Loaded SentencePiece model: {spm_path}")
                except Exception as e:
                    logger.warning(f"Failed to load SentencePiece model at {spm_path}: {e}")

            # 加载全局 CMVN（若存在）
            cmvn_path = os.getenv("WENET_CMVN_PATH")
            if not cmvn_path:
                candidate = os.path.join(project_root, "downloads/20210610_u2pp_conformer_exp/global_cmvn")
                if os.path.exists(candidate):
                    cmvn_path = candidate
            if cmvn_path and os.path.exists(cmvn_path):
                try:
                    self.cmvn_mean, self.cmvn_istd = self._load_cmvn(cmvn_path)
                    logger.info(f"Loaded global CMVN: {cmvn_path}")
                except Exception as e:
                    logger.warning(f"Failed to load CMVN at {cmvn_path}: {e}")

        except Exception as e:
            logger.error(f"Failed to load WeNet model: {e}")
            raise

    def _get_default_config(self) -> Dict:
        """获取默认配置"""
        return {
            'model': 'conformer',
            'encoder': 'conformer',
            'encoder_conf': {
                'output_size': 256,
                'attention_heads': 4,
                'linear_units': 2048,
                'num_blocks': 12,
                'dropout_rate': 0.1,
                'positional_dropout_rate': 0.1,
                'attention_dropout_rate': 0.0,
                'input_layer': 'conv2d',
                'normalize_before': True,
                'macaron_style': True,
                'pos_enc_layer_type': 'rel_pos',
                'selfattention_layer_type': 'rel_selfattn',
                'activation_type': 'swish',
                'use_cnn_module': True,
                'cnn_module_kernel': 15
            },
            'decoder': 'transformer',
            'decoder_conf': {
                'attention_heads': 4,
                'linear_units': 2048,
                'num_blocks': 6,
                'dropout_rate': 0.1,
                'positional_dropout_rate': 0.1,
                'self_attention_dropout_rate': 0.0,
                'src_attention_dropout_rate': 0.0
            },
            'ctc_conf': {
                'ctc_blank_id': 0
            },
            'model_conf': {
                'ctc_weight': 0.3,
                'lsm_weight': 0.1,
                'length_normalized_loss': False
            }
        }

    def _get_default_char_dict(self) -> Dict[str, int]:
        """获取默认字符词典"""
        # WeNet 常见词表包含特殊空白，如 ▁ 表示空格，我们在默认字典中包含它
        chars = ['<blank>', '<unk>', '▁'] + list('abcdefghijklmnopqrstuvwxyz ') + [str(i) for i in range(10)]
        return {char: i for i, char in enumerate(chars)}

    def _init_model(self):
        """初始化模型"""
        try:
            if not WENET_AVAILABLE:
                return None

            # 创建一个简单的args对象
            class Args:
                def __init__(self, model_path, device):
                    self.model_dir = os.path.dirname(model_path)
                    self.checkpoint = model_path
                    self.device = str(device)

            args = Args(self.model_path, self.device)

            # 使用 WeNet 的 init_model 函数
            result = init_model(args, self.config)
            # init_model 返回 (model, configs)
            if isinstance(result, tuple):
                model, _ = result
            else:
                model = result

            # 加载检查点
            if os.path.exists(self.model_path):
                # 直接使用模型文件，不需要单独加载checkpoint
                logger.info(f"Model will be loaded from {self.model_path}")
            else:
                logger.warning(f"No checkpoint found at {self.model_path}, using random weights")

            return model
        except Exception as e:
            logger.error(f"Failed to initialize model: {e}")
            return None

    def preprocess_audio(self, wav_path: str) -> torch.Tensor:
        """预处理音频文件"""
        try:
            waveform, sample_rate = torchaudio.load(wav_path)

            # 转换为单声道
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)

            # 重采样到 16kHz
            if sample_rate != 16000:
                resampler = torchaudio.transforms.Resample(sample_rate, 16000)
                waveform = resampler(waveform)

            # 确保音频长度足够（至少0.5秒，即8000个样本）
            min_length = 8000  # 0.5秒 * 16000Hz
            if waveform.shape[1] < min_length:
                # 如果音频太短，进行填充
                pad_length = min_length - waveform.shape[1]
                waveform = torch.nn.functional.pad(waveform, (0, pad_length), mode='constant', value=0)
                logger.info(f"Padded audio from {waveform.shape[1] - pad_length} to {waveform.shape[1]} samples")

            return waveform.squeeze(0)  # 移除通道维度
        except Exception as e:
            logger.error(f"Failed to preprocess audio: {e}")
            raise

    def get_phoneme_alignments(self, waveform: torch.Tensor, text: str) -> AlignmentResult:
        """使用 WeNet 获取音素对齐"""
        if not WENET_AVAILABLE:
            raise RuntimeError("WeNet library is not available. Please install WeNet properly.")

        if self.model is None:
            raise RuntimeError("WeNet model is not loaded. Please check model file and configuration.")

        with torch.no_grad():
            # 使用 Kaldi fbank 提取，并应用 CMVN 与 WeNet 训练一致
            import torchaudio.compliance.kaldi as kaldi

            # 记录原始样本数用于计算持续时间
            original_num_samples = int(waveform.shape[-1])
            if waveform.dim() == 1:
                waveform = waveform.unsqueeze(0)  # [1, seq_len]

            # 提取 Kaldi fbank 特征: [frames, 80]
            fbank = kaldi.fbank(
                waveform,
                num_mel_bins=80,
                sample_frequency=16000,
                frame_length=25.0,
                frame_shift=10.0,
                dither=0.0,
                window_type='hamming',
                use_energy=False,
            )

            # 应用 CMVN（若可用）
            if self.cmvn_mean is not None and self.cmvn_istd is not None:
                feats2 = (fbank - self.cmvn_mean) * self.cmvn_istd
            else:
                feats2 = fbank

            # 转换为 [1, time, feature]
            feats = feats2.unsqueeze(0).to(self.device)
            feats_lengths = torch.tensor([feats.shape[1]], dtype=torch.long).to(self.device)

            # 编码器前向传播
            encoder_result = self.model.encoder(feats, feats_lengths)
            if len(encoder_result) == 3:
                encoder_out, encoder_out_lens, _ = encoder_result
            else:
                encoder_out, encoder_out_lens = encoder_result

            # CTC 解码获取对齐
            ctc_probs = self.model.ctc.log_softmax(encoder_out)

            # 将文本转换为 token 序列
            text_tokens = self._text_to_tokens(text)

            # 使用CTC对齐（改为使用 T=时间帧数 进行归一化）
            alignments = self._compute_ctc_alignments(
                ctc_probs.squeeze(0), text_tokens, ctc_probs.shape[1]
            )

            # 构建结果
            total_duration_s = max(0.0, float(original_num_samples) / 16000.0)
            words = self._build_word_segments_from_ctc(text, alignments, total_duration_s)
            duration = total_duration_s  # 转换为秒

            return AlignmentResult(
                words=words,
                duration=duration,
                raw_confidence=alignments['confidences']
            )


    def _simple_phonemize(self, word: str) -> List[str]:
        """简单的音素化"""
        # 简化的音素映射
        phoneme_map = {
            'a': 'AH', 'e': 'EH', 'i': 'IH', 'o': 'OW', 'u': 'UH',
            'b': 'B', 'c': 'K', 'd': 'D', 'f': 'F', 'g': 'G',
            'h': 'HH', 'j': 'JH', 'k': 'K', 'l': 'L', 'm': 'M',
            'n': 'N', 'p': 'P', 'q': 'K', 'r': 'R', 's': 'S',
            't': 'T', 'v': 'V', 'w': 'W', 'x': 'KS', 'y': 'Y', 'z': 'Z'
        }

        phonemes = []
        for char in word.lower():
            if char in phoneme_map:
                phonemes.append(phoneme_map[char])
        return phonemes

    def _text_to_tokens(self, text: str) -> List[int]:
        """将文本转换为 token ID 序列
        优先使用 SentencePiece 与 WeNet 的 units 对齐；否则回退到字符级。
        """
        text = text.strip()
        # SentencePiece 路径
        if self.spm is not None and isinstance(self.char_dict, dict):
            # WeNet Librispeech 模型词表为大写子词，统一为大写以避免 <unk>
            pieces = self.spm.EncodeAsPieces(text.upper())
            ids: List[int] = []
            unk_id = self.char_dict.get('<unk>', 1)
            for p in pieces:
                if p.startswith('▁'):
                    up = '▁' + p[1:].upper()
                else:
                    up = p.upper()
                token_id = self.char_dict.get(up, unk_id)
                ids.append(token_id)
            return ids

        # 回退：字符级，并将空格映射到 ▁ 若存在
        space_token = '▁' if '▁' in self.char_dict else ' '
        tokens = []
        for char in text.lower():
            ch = space_token if char == ' ' else char
            if ch in self.char_dict:
                tokens.append(self.char_dict[ch])
            else:
                tokens.append(self.char_dict.get('<unk>', 1))
        return tokens

    def _compute_ctc_alignments(self, ctc_probs: torch.Tensor, text_tokens: List[int], seq_length: int) -> Dict[str, Any]:
        """使用 CTC Viterbi 强制对齐，返回每个目标 token 的时间与置信度。
        实现参考 CTC 对齐原理：在插入 blank 的扩展标签序列上进行 Viterbi 动态规划并回溯逐帧标签。
        参数
        - ctc_probs: [T, V] 的 log-softmax（来自 self.model.ctc.log_softmax）。
        - text_tokens: 目标 token id 列表（与 units 对齐的 SentencePiece id）。
        - seq_length: 时间帧数 T。
        返回
        - alignments: 每个目标 token 的起止时间（0~1 归一化）与平均概率。
        - confidences: 概率列表。
        """
        T, V = ctc_probs.shape
        if T <= 0 or not text_tokens:
            return {'alignments': [], 'confidences': []}

        blank_id = 0

        # 构造扩展标签序列（在 token 之间插入 blank，并两端加 blank）
        labels = text_tokens
        ext: List[int] = []
        for i, lid in enumerate(labels):
            ext.append(blank_id)
            ext.append(lid)
        ext.append(blank_id)
        S = len(ext)

        # DP 与回溯：Viterbi 最大路径
        neg_inf = -1e10
        dp = torch.full((T, S), neg_inf, dtype=ctc_probs.dtype, device=ctc_probs.device)
        bp = torch.full((T, S), -1, dtype=torch.long, device=ctc_probs.device)  # 0:stay,1:prev,2:skip

        # 初始化 t=0
        dp[0, 0] = ctc_probs[0, ext[0]]
        if S > 1:
            dp[0, 1] = ctc_probs[0, ext[1]]
            bp[0, 1] = 1

        # 迭代
        for t in range(1, T):
            for s in range(S):
                emit = ctc_probs[t, ext[s]]
                # 来自 s（保持）
                best = dp[t-1, s]
                arg = 0
                # 来自 s-1
                if s-1 >= 0:
                    v = dp[t-1, s-1]
                    if v > best:
                        best = v
                        arg = 1
                # 来自 s-2（若非重复同音且非 blank）
                if s-2 >= 0 and ext[s] != blank_id and ext[s] != ext[s-2]:
                    v = dp[t-1, s-2]
                    if v > best:
                        best = v
                        arg = 2
                dp[t, s] = best + emit
                bp[t, s] = arg

        # 结束状态：S-1 或 S-2 中较大者
        last_s = S-1
        alt_s = S-2 if S-2 >= 0 else S-1
        if dp[T-1, alt_s] > dp[T-1, last_s]:
            last_s = alt_s

        # 回溯逐帧状态
        path_states = [last_s]
        cur_s = last_s
        for t in range(T-1, 0, -1):
            move = int(bp[t, cur_s].item())
            if move == 0:
                prev_s = cur_s
            elif move == 1:
                prev_s = cur_s - 1
            else:
                prev_s = cur_s - 2
            path_states.append(prev_s)
            cur_s = prev_s
        path_states.reverse()  # 长度 T

        # 将逐帧状态映射到目标 token（奇数位为真实 token，偶数位为 blank）
        # 汇总每个 token 的起止帧与均值概率
        token_to_frames: List[List[int]] = [[] for _ in labels]
        for t, s in enumerate(path_states):
            if s % 2 == 1:  # 非 blank，对应第 (s//2) 个 token
                j = s // 2
                if 0 <= j < len(labels):
                    token_to_frames[j].append(t)

        def id_to_char(token_id: int) -> Optional[str]:
            for ch, cid in self.char_dict.items():
                if cid == token_id:
                    return ch
            return None

        time_per_frame = 1.0 / max(1, T)
        alignments: List[Dict[str, Any]] = []
        confidences: List[float] = []
        for j, frames in enumerate(token_to_frames):
            if not frames:
                # 如果某 token 未分配到帧，则选择概率最高的单帧
                col = ctc_probs[:, labels[j]]
                t_star = int(torch.argmax(col).item())
                frames = [t_star]
            start_idx = min(frames)
            end_idx = max(frames) + 1
            start_t = start_idx * time_per_frame
            end_t = max(start_t + time_per_frame, end_idx * time_per_frame)
            conf = torch.clamp(torch.exp(ctc_probs[start_idx:end_idx, labels[j]]).mean(), 0.0, 1.0).item()
            token_char = id_to_char(labels[j]) or ''
            alignments.append({
                'token': token_char,
                'token_id': labels[j],
                'start': start_t,
                'end': end_t,
                'confidence': conf
            })
            confidences.append(conf)

        return {'alignments': alignments, 'confidences': confidences}

    def _build_word_segments_from_ctc(self, text: str, alignments: Dict[str, Any], total_duration: float) -> List[WordSegment]:
        """从 CTC 对齐构建词级分段，兼容 SentencePiece 子词。
        逻辑：
        - 按照对齐 token 顺序，将以 '▁' 开头的 token 视为新词起点。
        - 与 text.split() 的词数进行对齐，超出部分合并到最后一个词。
        - 对每个词内的 token，按时长均衡到 IPA 音素个数。
        """
        words = text.strip().split()
        a_list = alignments.get('alignments', [])
        if not words or not a_list:
            return []

        # 将 token 对齐分组为词
        groups: List[List[Dict[str, Any]]] = []
        current: List[Dict[str, Any]] = []
        for idx, a in enumerate(a_list):
            token_str = str(a.get('token', ''))
            if token_str.startswith('▁') and current:
                groups.append(current)
                current = []
            current.append(a)
        if current:
            groups.append(current)

        # 调整分组数量与 words 数量一致
        if len(groups) < len(words):
            # 不足则将最后一组重复为空以占位
            while len(groups) < len(words):
                groups.append([])
        elif len(groups) > len(words):
            # 过多则将多余分组合并到最后一组
            rest = []
            for g in groups[len(words)-1:]:
                rest.extend(g)
            groups = groups[:len(words)-1] + [rest]

        word_segments: List[WordSegment] = []

        for w_idx, word in enumerate(words):
            toks = groups[w_idx] if w_idx < len(groups) else []
            if not toks:
                continue
            word_start_rel = min(t['start'] for t in toks)
            word_end_rel = max(t['end'] for t in toks)
            word_start = word_start_rel * total_duration
            word_end = word_end_rel * total_duration

            ipa_phones = self._word_to_ipa_list(word)
            if not ipa_phones:
                ipa_phones = [t.get('token', '') for t in toks]

            # 词内子词时长
            tok_durs = [(t['end'] - t['start']) for t in toks]
            total_tok_time = sum(tok_durs) if tok_durs else 1e-6
            target_bins = max(1, len(ipa_phones))
            target_per_bin = total_tok_time / target_bins

            bins: List[List[int]] = []
            current_bin: List[int] = []
            acc = 0.0
            for idx, dur in enumerate(tok_durs):
                current_bin.append(idx)
                acc += dur
                if len(bins) < target_bins - 1 and acc >= target_per_bin:
                    bins.append(current_bin)
                    current_bin = []
                    acc = 0.0
            if current_bin:
                bins.append(current_bin)
            while len(bins) < target_bins:
                bins.append([])
            while len(bins) > target_bins:
                last = bins.pop()
                bins[-1].extend(last)

            word_phonemes: List[PhonemeSegment] = []
            for p_idx, phone in enumerate(ipa_phones):
                tok_ids = bins[p_idx] if p_idx < len(bins) else []
                if not tok_ids:
                    start_t = word_start
                    end_t = min(word_end, word_start + (word_end - word_start) / max(1, len(ipa_phones)))
                    conf = 0.0
                else:
                    start_rel = min(toks[i]['start'] for i in tok_ids)
                    end_rel = max(toks[i]['end'] for i in tok_ids)
                    start_t = start_rel * total_duration
                    end_t = end_rel * total_duration
                    conf_vals = [float(toks[i]['confidence']) for i in tok_ids]
                    conf = float(sum(conf_vals) / max(1, len(conf_vals)))

                word_phonemes.append(PhonemeSegment(
                    phoneme=phone,
                    start=start_t,
                    end=end_t,
                    confidence=conf
                ))

            word_segments.append(WordSegment(
                word=word,
                start=word_start,
                end=word_end,
                phonemes=word_phonemes
            ))

        return word_segments

    # ---------------------- G2P & IPA helpers ----------------------
    def _ensure_g2p(self):
        if self.g2p is None:
            try:
                from g2p_en import G2p  # type: ignore
                self.g2p = G2p()
            except Exception as e:
                logger.warning(f"g2p_en not available: {e}")
                self.g2p = None

    def _load_cmvn(self, path: str) -> Tuple[torch.Tensor, torch.Tensor]:
        """加载 WeNet global_cmvn，返回 mean 和 istd（形状 [80]）。"""
        with open(path, 'r') as f:
            obj = json.load(f)
        mean_stat = np.asarray(obj['mean_stat'], dtype=np.float64)
        var_stat = np.asarray(obj['var_stat'], dtype=np.float64)
        frame_num = float(obj['frame_num'])
        mean = mean_stat / max(1.0, frame_num)
        var = var_stat / max(1.0, frame_num) - mean * mean
        var = np.maximum(var, 1e-10)
        istd = 1.0 / np.sqrt(var)
        mean_t = torch.from_numpy(mean.astype(np.float32))
        istd_t = torch.from_numpy(istd.astype(np.float32))
        return mean_t, istd_t

    def _word_to_ipa_list(self, word: str) -> List[str]:
        """使用 g2p_en 生成 ARPABET 并映射为 IPA。返回 IPA 字符串列表。"""
        self._ensure_g2p()
        if self.g2p is None:
            # Fallback：简单字符到 IPA（相较于之前的占位，提供更合理的默认）
            simple_map = {
                'a': 'æ', 'e': 'ɛ', 'i': 'ɪ', 'o': 'oʊ', 'u': 'ʊ',
                'b': 'b', 'c': 'k', 'd': 'd', 'f': 'f', 'g': 'ɡ', 'h': 'h',
                'j': 'dʒ', 'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'p': 'p',
                'q': 'k', 'r': 'ɹ', 's': 's', 't': 't', 'v': 'v', 'w': 'w',
                'x': 'ks', 'y': 'j', 'z': 'z'
            }
            return [simple_map.get(ch, ch) for ch in word.lower() if ch.isalpha()]
        try:
            arp_tokens = [t for t in self.g2p(word) if t.strip()]
        except Exception as e:
            logger.warning(f"g2p_en inference failed for '{word}': {e}. Falling back to simple IPA mapping.")
            simple_map = {
                'a': 'æ', 'e': 'ɛ', 'i': 'ɪ', 'o': 'oʊ', 'u': 'ʊ',
                'b': 'b', 'c': 'k', 'd': 'd', 'f': 'f', 'g': 'ɡ', 'h': 'h',
                'j': 'dʒ', 'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'p': 'p',
                'q': 'k', 'r': 'ɹ', 's': 's', 't': 't', 'v': 'v', 'w': 'w',
                'x': 'ks', 'y': 'j', 'z': 'z'
            }
            return [simple_map.get(ch, ch) for ch in word.lower() if ch.isalpha()]
        # 过滤非音素（例如空格、标点）
        arp_phones = [t for t in arp_tokens if t[0].isalpha()]
        return [self._arpabet_to_ipa(p) for p in arp_phones]

    def _arpabet_to_ipa(self, phone: str) -> str:
        """简易 ARPABET→IPA 映射，去除重音数字。"""
        base = ''.join([c for c in phone if not c.isdigit()]).upper()
        mapping = {
            # consonants
            'P': 'p', 'B': 'b', 'T': 't', 'D': 'd', 'K': 'k', 'G': 'ɡ',
            'CH': 'tʃ', 'JH': 'dʒ', 'F': 'f', 'V': 'v', 'TH': 'θ', 'DH': 'ð',
            'S': 's', 'Z': 'z', 'SH': 'ʃ', 'ZH': 'ʒ', 'HH': 'h', 'M': 'm',
            'N': 'n', 'NG': 'ŋ', 'L': 'l', 'R': 'ɹ', 'Y': 'j', 'W': 'w',
            # vowels (monophthongs/diphthongs)
            'IY': 'i', 'IH': 'ɪ', 'EH': 'ɛ', 'AE': 'æ', 'AA': 'ɑ', 'AH': 'ʌ',
            'AO': 'ɔ', 'UH': 'ʊ', 'UW': 'u', 'ER': 'ɝ', 'AX': 'ə',
            'EY': 'eɪ', 'AY': 'aɪ', 'OW': 'oʊ', 'AW': 'aʊ', 'OY': 'ɔɪ',
            # schwa-like
            'AXR': 'ɚ', 'IX': 'ɨ',
        }
        # context-free adjustment: unstressed AH often → ə
        if base == 'AH' and any(ch.isdigit() and ch == '0' for ch in phone):
            return 'ə'
        return mapping.get(base, base.lower())

    def _char_to_phoneme(self, char: str) -> str:
        """将字符转换为音素"""
        # 简化的字符到音素映射
        phoneme_map = {
            'a': 'AH', 'e': 'EH', 'i': 'IH', 'o': 'OW', 'u': 'UH',
            'b': 'B', 'c': 'K', 'd': 'D', 'f': 'F', 'g': 'G',
            'h': 'HH', 'j': 'JH', 'k': 'K', 'l': 'L', 'm': 'M',
            'n': 'N', 'p': 'P', 'q': 'K', 'r': 'R', 's': 'S',
            't': 'T', 'v': 'V', 'w': 'W', 'x': 'KS', 'y': 'Y', 'z': 'Z',
            ' ': 'SIL'
        }
        return phoneme_map.get(char.lower(), char.upper())


def run_wenet_alignment(wav_path: str, text: str, language: str = "en-US") -> AlignmentResult:
    """运行 WeNet 对齐 - 只使用WeNet，不提供回退"""
    # 初始化 WeNet 对齐器
    aligner = WeNetAlignment()

    # 预处理音频
    waveform = aligner.preprocess_audio(wav_path)

    # 获取对齐结果 - 只使用WeNet
    result = aligner.get_phoneme_alignments(waveform, text)

    # 记录使用WeNet模型
    logger.info("Using WeNet model for alignment")

    return result
