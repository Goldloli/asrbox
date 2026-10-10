# Copyright 2026 Xiaohongshu. (Author: Kaituo Xu)
# Vendored from https://github.com/FireRedTeam/FireRedASR2S (Apache-2.0) at commit
# 4e7d9aaf4482a47cec1724807026b9b151926eb5. Local change: kaldi_native_fbank (no
# Windows wheels on PyPI) is replaced by the Kaldi-compatible fbank in torchaudio,
# numerically equivalent on identical inputs. The waveform is kept at int16
# magnitude, matching kaldiio.load_mat on 16-bit PCM so the shipped global CMVN
# stays calibrated (a [-1, 1] scale shifts every log-mel bin by a constant that
# the training-time CMVN does not expect and the model then hears silence).

import math
import os

import kaldiio
import numpy as np
import torch
import torchaudio

KALDI_WAV_SCALE = 32768.0


class ASRFeatExtractor:
    def __init__(self, kaldi_cmvn_file):
        self.cmvn = CMVN(kaldi_cmvn_file) if kaldi_cmvn_file != "" else None
        self.fbank = KaldifeatFbank(num_mel_bins=80, frame_length=25,
            frame_shift=10, dither=0.0)

    def __call__(self, wav_paths, wav_uttids):
        feats = []
        durs = []
        return_wav_paths = []
        return_wav_uttids = []

        wav_datas = []
        if isinstance(wav_paths[0], str):
            for wav_path in wav_paths:
                sample_rate, wav_np = kaldiio.load_mat(wav_path)
                wav_datas.append([sample_rate, wav_np])
        else:
            wav_datas = wav_paths

        for (sample_rate, wav_np), path, uttid in zip(wav_datas, wav_paths, wav_uttids):
            dur = wav_np.shape[0] / sample_rate
            fbank = self.fbank((sample_rate, wav_np))
            if fbank.shape[0] < 1:
                continue
            if self.cmvn is not None:
                fbank = self.cmvn(fbank)
            fbank = torch.from_numpy(fbank).float()
            feats.append(fbank)
            durs.append(dur)
            return_wav_paths.append(path)
            return_wav_uttids.append(uttid)
        if len(feats) > 0:
            lengths = torch.tensor([feat.size(0) for feat in feats]).long()
            feats_pad = self.pad_feat(feats, 0.0)
        else:
            lengths, feats_pad = None, None
        return feats_pad, lengths, durs, return_wav_paths, return_wav_uttids

    def pad_feat(self, xs, pad_value):
        # type: (List[Tensor], int) -> Tensor
        n_batch = len(xs)
        max_len = max([xs[i].size(0) for i in range(n_batch)])
        pad = torch.ones(n_batch, max_len, *xs[0].size()[1:]).to(xs[0].device).to(xs[0].dtype).fill_(pad_value)
        for i in range(n_batch):
            pad[i, :xs[i].size(0)] = xs[i]
        return pad


class CMVN:
    def __init__(self, kaldi_cmvn_file):
        self.dim, self.means, self.inverse_std_variences = \
            self.read_kaldi_cmvn(kaldi_cmvn_file)

    def __call__(self, x, is_train=False):
        assert x.shape[-1] == self.dim, "CMVN dim mismatch"
        out = x - self.means
        out = out * self.inverse_std_variences
        return out

    def read_kaldi_cmvn(self, kaldi_cmvn_file):
        assert os.path.exists(kaldi_cmvn_file)
        stats = kaldiio.load_mat(kaldi_cmvn_file)
        assert stats.shape[0] == 2
        dim = stats.shape[-1] - 1
        count = stats[0, dim]
        assert count >= 1
        floor = 1e-20
        means = []
        inverse_std_variences = []
        for d in range(dim):
            mean = stats[0, d] / count
            means.append(mean.item())
            varience = (stats[1, d] / count) - mean*mean
            if varience < floor:
                varience = floor
            istd = 1.0 / math.sqrt(varience)
            inverse_std_variences.append(istd)
        return dim, np.array(means), np.array(inverse_std_variences)


class KaldifeatFbank:
    def __init__(self, num_mel_bins=80, frame_length=25, frame_shift=10,
                 dither=1.0):
        self.num_mel_bins = num_mel_bins
        self.frame_length = float(frame_length)
        self.frame_shift = float(frame_shift)
        self.dither = dither

    def __call__(self, wav, is_train=False):
        if type(wav) is str:
            sample_rate, wav_np = kaldiio.load_mat(wav)
        elif type(wav) in [tuple, list] and len(wav) == 2:
            sample_rate, wav_np = wav
        assert len(wav_np.shape) == 1

        # kaldi-native-fbank consumes kaldiio-scale samples (int16 magnitude for
        # 16-bit PCM); feeding a [-1, 1] float wave instead shifts every log-mel
        # bin below the training-time CMVN calibration and the model hears silence.
        scaled = torch.from_numpy(np.asarray(wav_np, dtype=np.float32) * KALDI_WAV_SCALE).unsqueeze(0)
        feat = torchaudio.compliance.kaldi.fbank(
            scaled,
            num_mel_bins=self.num_mel_bins,
            frame_length=self.frame_length,
            frame_shift=self.frame_shift,
            dither=self.dither if is_train else 0.0,
            sample_frequency=float(sample_rate),
            snip_edges=True,
        )
        return feat.numpy()
