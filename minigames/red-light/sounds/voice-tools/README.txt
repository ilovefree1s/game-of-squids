How the doll's voice (doll_0.mp3 ... doll_9.mp3) was made
(only needed if you want to remake it; the game just plays the mp3 files)

1. A Korean text-to-speech voice spoke the syllables of 무궁화 꽃이 피었습니다 as a list with pauses:
   "무, 궁, 화, 꼬, 치, 피, 얻, 씀, 니, 다." (speed 0.9), which was cut at the pauses into s0.wav ... s9.wav.
   Voice: "ko_KO kss_low" from Mycroft mimic3-voices (its LICENSE file is CC0), run with sherpa-onnx 1.12.40:
   https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mimic3-ko_KO-kss_low.tar.bz2
2. sing.py (needs: pip install pyworld numpy) turns each syllable into a sung note on the game's melody,
   with the voice's resonances raised (python3 sing.py 1.25) so it sounds like a child, the vowel held
   (1 s; the last note 1.6 s), a small scoop into each note and a gentle wobble.
3. Converted to mp3 with ffmpeg. The game shortens each note to the song's tempo and adds the echo.
