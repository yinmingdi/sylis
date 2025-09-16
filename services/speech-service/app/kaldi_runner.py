import subprocess
import os
import uuid

KALDI_ROOT = "/opt/kaldi/egs/wsj/s5"
MODEL_DIR = f"{KALDI_ROOT}/exp/tri3b"
GRAPH_DIR = f"{MODEL_DIR}/graph"
LANG_DIR = f"{KALDI_ROOT}/data/lang"
DATA_DIR = f"{KALDI_ROOT}/data/test"

def run_cmd(cmd, cwd=None):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True, cwd=cwd)

def prepare_data(wav_path: str, transcript: str | None = None):
    utt_id = os.path.splitext(os.path.basename(wav_path))[0]
    os.makedirs(DATA_DIR, exist_ok=True)

    with open(f"{DATA_DIR}/wav.scp", "w") as f:
        f.write(f"{utt_id} {wav_path}\n")

    with open(f"{DATA_DIR}/utt2spk", "w") as f:
        f.write(f"{utt_id} {utt_id}\n")

    with open(f"{DATA_DIR}/spk2utt", "w") as f:
        f.write(f"{utt_id} {utt_id}\n")

    if transcript:
        with open(f"{DATA_DIR}/text", "w") as f:
            f.write(f"{utt_id} {transcript.lower()}\n")

    run_cmd(f"utils/utt2spk_to_spk2utt.pl {DATA_DIR}/utt2spk > {DATA_DIR}/spk2utt", cwd=KALDI_ROOT)

def run_kaldi_transcription(wav_path: str):
    prepare_data(wav_path)

    run_cmd(f"steps/make_mfcc.sh --nj 1 --cmd run.pl {DATA_DIR} exp/make_mfcc mfcc", cwd=KALDI_ROOT)
    run_cmd(f"steps/compute_cmvn_stats.sh {DATA_DIR} exp/make_mfcc mfcc", cwd=KALDI_ROOT)
    run_cmd(f"utils/fix_data_dir.sh {DATA_DIR}", cwd=KALDI_ROOT)

    run_cmd(f"steps/decode.sh --nj 1 --cmd run.pl {GRAPH_DIR} {DATA_DIR} {MODEL_DIR}/decode_test", cwd=KALDI_ROOT)

    ctm_path = f"{MODEL_DIR}/decode_test/scoring_kaldi/penalty_0.0/ctm"
    result = []
    with open(ctm_path, "r") as f:
        for line in f:
            _, _, start, duration, word = line.strip().split()
            result.append({
                "word": word,
                "start": float(start),
                "duration": float(duration)
            })
    return result

def run_kaldi_gop(wav_path: str, transcript: str):
    prepare_data(wav_path, transcript)

    run_cmd(f"steps/make_mfcc.sh --nj 1 --cmd run.pl {DATA_DIR} exp/make_mfcc mfcc", cwd=KALDI_ROOT)
    run_cmd(f"steps/compute_cmvn_stats.sh {DATA_DIR} exp/make_mfcc mfcc", cwd=KALDI_ROOT)
    run_cmd(f"utils/fix_data_dir.sh {DATA_DIR}", cwd=KALDI_ROOT)

    # Align to generate ali.*
    run_cmd(f"steps/align_si.sh --nj 1 --cmd run.pl {DATA_DIR} {LANG_DIR} {MODEL_DIR} {MODEL_DIR}/ali", cwd=KALDI_ROOT)

    # Compute GOP scores
    gop_dir = f"{MODEL_DIR}/gop"
    os.makedirs(gop_dir, exist_ok=True)
    run_cmd(f"steps/score_kaldi_gop.sh {DATA_DIR} {LANG_DIR} {MODEL_DIR} {gop_dir}", cwd=KALDI_ROOT)

    # Parse GOP result (placeholder)
    gop_txt = f"{gop_dir}/gop.txt"
    result = []
    with open(gop_txt) as f:
        for line in f:
            if line.startswith("["): continue
            tokens = line.strip().split()
            if len(tokens) >= 4:
                result.append({
                    "phoneme": tokens[1],
                    "start": float(tokens[0]),
                    "duration": 0.1,
                    "gop": float(tokens[3])
                })
    return result
