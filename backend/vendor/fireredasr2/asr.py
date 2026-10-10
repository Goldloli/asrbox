# Copyright 2026 Xiaohongshu. (Author: Kaituo Xu)
# Vendored from https://github.com/FireRedTeam/FireRedASR2S (Apache-2.0) at commit
# 4e7d9aaf4482a47cec1724807026b9b151926eb5. Local change: the LLM and external
# language-model variants are removed; this module carries the AED path only.

import logging
import os
import re
import time
import traceback
from dataclasses import dataclass

import torch

from .data.asr_feat import ASRFeatExtractor
from .models.fireredasr_aed import FireRedAsrAed
from .models.param import count_model_parameters
from .tokenizer.aed_tokenizer import ChineseCharEnglishSpmTokenizer

logger = logging.getLogger(__name__)


@dataclass
class FireRedAsr2Config:
    use_gpu: bool = True
    use_half: bool = False
    beam_size: int = 3
    nbest: int = 1
    decode_max_len: int = 0
    softmax_smoothing: float = 1.25
    aed_length_penalty: float = 0.6
    eos_penalty: float = 1.0
    return_timestamp: bool = False
    def __post_init__(self):
        pass


class FireRedAsr2:
    @classmethod
    def from_pretrained(cls, asr_type, model_dir, config=FireRedAsr2Config()):
        assert asr_type in ["aed"]

        cmvn_path = os.path.join(model_dir, "cmvn.ark")
        feat_extractor = ASRFeatExtractor(cmvn_path)

        model_path = os.path.join(model_dir, "model.pth.tar")
        dict_path =os.path.join(model_dir, "dict.txt")
        spm_model = os.path.join(model_dir, "train_bpe1000.model")
        model = load_fireredasr_aed_model(model_path)
        tokenizer = ChineseCharEnglishSpmTokenizer(dict_path, spm_model)
        count_model_parameters(model)
        model.eval()
        return cls(asr_type, feat_extractor, model, tokenizer, config)

    def __init__(self, asr_type, feat_extractor, model, tokenizer, config):
        self.asr_type = asr_type
        self.feat_extractor = feat_extractor
        self.model = model
        self.tokenizer = tokenizer
        self.config = config
        logger.info(self.config)
        if self.config.use_gpu:
            if self.config.use_half:
                if torch.cuda.is_bf16_supported():
                    self.model.bfloat16()
                else:
                    self.model.half()
            self.model.cuda()
        else:
            self.model.cpu()

    @torch.no_grad()
    def transcribe(self, batch_uttid, batch_wav_path):
        batch_uttid_origin = batch_uttid
        try:
            feats, lengths, durs, batch_wav_path, batch_uttid = \
                self.feat_extractor(batch_wav_path, batch_uttid)
            if feats is None:
                return [{"uttid": uttid, "text":""} for uttid in batch_uttid_origin]
        except:
            traceback.print_exc()
            return [{"uttid": uttid, "text":""} for uttid in batch_uttid_origin]
        total_dur = sum(durs)
        if self.config.use_gpu:
            feats, lengths = feats.cuda(), lengths.cuda()
            if self.config.use_half:
                if torch.cuda.is_bf16_supported():
                    feats = feats.bfloat16()
                else:
                    feats = feats.half()

        if self.asr_type == "aed":
            start_time = time.time()

            try:
                hyps = self.model.transcribe(
                    feats, lengths,
                    self.config.beam_size,
                    self.config.nbest,
                    self.config.decode_max_len,
                    self.config.softmax_smoothing,
                    self.config.aed_length_penalty,
                    self.config.eos_penalty,
                    self.config.return_timestamp,
                    None,
                    0.0
                )
            except Exception as e:
                traceback.print_exc()
                hyps = []

            elapsed = time.time() - start_time
            rtf= elapsed / total_dur if total_dur > 0 else 0

            results = []
            for uttid, wav, hyp, dur in zip(batch_uttid, batch_wav_path, hyps, durs):
                hyp = hyp[0]  # only return 1-best
                hyp_ids = [int(id) for id in hyp["yseq"].cpu()]
                text = self.tokenizer.detokenize(hyp_ids)
                text = re.sub(r"(<blank>)|(<sil>)", "", text)
                results.append({"uttid": uttid, "text": text.lower(),
                    "confidence": round(hyp["confidence"].cpu().item(), 3),
                    "dur_s": round(dur, 3), "rtf": f"{rtf:.4f}"})
                if type(wav) == str:
                    results[-1]["wav"] = wav
                if self.config.return_timestamp:
                    results[-1]["timestamp"] = self._get_and_fix_timestamp(hyp, hyp_ids, dur)
            return results

    def _get_and_fix_timestamp(self, hyp, hyp_ids, dur):
        r3 = lambda x: round(x, 3)
        if "timestamp" not in hyp or hyp["timestamp"] is None:
            timestamp = []
            avg_dur = dur / len(hyp_ids) if len(hyp_ids) > 0 else 0
            last_end = dur
            for i, hyp_id in enumerate(hyp_ids):
                token = self.tokenizer.detokenize([hyp_id], "", False)
                start = min(max(0, i*avg_dur), last_end)
                end = min((i+1)*avg_dur, dur)
                last_end = end
                timestamp.append([token.lower(), r3(start), r3(end)])
        else:
            starts, ends = hyp["timestamp"]
            timestamp = []
            last_end = dur
            SHIFT = 0.06  # shift 60ms
            for hyp_id, start, end in zip(hyp_ids, starts, ends):
                token = self.tokenizer.detokenize([hyp_id], "", False)
                start = min(max(0, start - SHIFT), last_end)
                end = min(max(0, end - SHIFT), dur)
                last_end = end
                timestamp.append([token.lower(), r3(start), r3(end)])
        # Fix case: start == dur and end == dur
        for i in range(len(timestamp)):
            idx = -(i+1)
            _, start, end = timestamp[idx]
            if abs(dur - start) < 0.001:
                logger.info(f"start before {timestamp[idx]}")
                timestamp[idx][1] = dur - (i+1)*0.001
                logger.info(f"start after {timestamp[idx]}")
            if i != 0 and abs(dur - end) < 0.001:
                logger.info(f"end before {timestamp[idx]}")
                timestamp[idx][2] = dur - i*0.001
                logger.info(f"end after {timestamp[idx]}")
        timestamp = self.tokenizer.merge_spm_timestamp(timestamp)
        return timestamp


def load_fireredasr_aed_model(model_path):
    package = torch.load(model_path, map_location=lambda storage, loc: storage, weights_only=False)
    model = FireRedAsrAed.from_args(package["args"])
    model.load_state_dict(package["model_state_dict"], strict=False)
    return model
