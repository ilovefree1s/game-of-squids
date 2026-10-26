import numpy as np, pyworld as pw, wave, sys
def read(n):
    w = wave.open(n); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768; return x, w.getframerate()
def write(n, x, fs):
    x = np.clip(x, -1, 1); w = wave.open(n, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(fs); w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()
MELODY = [0, 2, 4, 4, 2, 0, 2, 4, 2, -1]
BASE = 530.0           # pitch of the first note (Hz)
FORMANT = float(sys.argv[1]) if len(sys.argv) > 1 else 1.22   # >1 = smaller vocal tract (child)
FP = 5.0               # ms per analysis frame
out = []
for i in range(10):
    x, fs = read(f"s{i}.wav")
    # trim silence
    e = np.abs(x); idx = np.where(e > 0.02)[0]; x = x[max(0, idx[0] - 200): idx[-1] + 400]
    f0, t = pw.harvest(x, fs, f0_floor=80, f0_ceil=600, frame_period=FP)
    sp = pw.cheaptrick(x, f0, t, fs); ap = pw.d4c(x, f0, t, fs)
    n = len(f0); voiced = np.where(f0 > 0)[0]
    v0, v1 = (voiced[0], voiced[-1]) if len(voiced) else (n // 3, 2 * n // 3)
    # hold the vowel: keep the start (consonant) and the end (final consonant), stretch the middle of the vowel
    hold = 1.6 if i == 9 else 1.0          # seconds
    mid0, mid1 = v0 + max(2, (v1 - v0) // 4), v0 + max(3, 3 * (v1 - v0) // 4)
    head = list(range(0, mid0)); tail = list(range(mid1, n))
    need = int(hold * 1000 / FP) - len(head) - len(tail)
    middle = list(np.linspace(mid0, mid1, max(need, 1)).round().astype(int))
    idxs = np.array(head + middle + tail)
    sp2, ap2, vo = sp[idxs], ap[idxs], (f0[idxs] > 0)
    # sung pitch: a little scoop up into the note, then a gentle wobble
    m = len(idxs); tt = np.arange(m) * FP / 1000
    target = BASE * 2 ** (MELODY[i] / 12)
    scoop = 1.03 - 0.03 * np.clip(tt / 0.06, 0, 1)
    vib = 1 + 0.012 * np.sin(2 * np.pi * 5.6 * tt) * np.clip((tt - 0.15) / 0.2, 0, 1)
    if i == 9: vib *= 1 - 0.06 * np.clip((tt - 0.4) / 1.2, 0, 1)  # the last note sags down
    f02 = np.where(vo, target * scoop * vib, 0.0)
    # child: shift the vocal tract resonances up
    bins = sp2.shape[1]; freqs = np.arange(bins)
    src = np.clip(freqs / FORMANT, 0, bins - 1)
    sp3 = np.array([np.interp(src, freqs, row) for row in sp2])
    y = pw.synthesize(f02, np.ascontiguousarray(sp3), np.ascontiguousarray(ap2), fs, FP)
    y = y / (np.max(np.abs(y)) + 1e-9) * 0.9
    write(f"sung{i}.wav", y, fs)
    out.append((i, round(len(y) / fs, 2), round(target)))
print(out)
