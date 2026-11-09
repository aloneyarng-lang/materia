"""Run Materia's GPT-SoVITS voice over a private stdin/stdout channel."""

import base64
import io
import json
from pathlib import Path
import sys
import traceback
import wave
from collections import OrderedDict


protocol = sys.stdout
sys.stdout = sys.stderr


def send(**message):
    print("MATERIA_VOICE " + json.dumps(message), file=protocol, flush=True)


def main():
    settings_path = Path(sys.argv[1])
    settings = json.loads(settings_path.read_text(encoding="utf-8-sig"))
    selected_language = sys.argv[2] if len(sys.argv) > 2 else "ja"
    settings = {**settings, **settings.get("voices", {}).get(selected_language, {})}
    root = settings_path.parent
    sys.argv = sys.argv[:1]
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.path.extend([str(Path.cwd()), str(Path.cwd() / "GPT_SoVITS")])
    import torch
    torch.set_num_threads(2)
    from GPT_SoVITS.TTS_infer_pack.TTS import TTS, TTS_Config

    class ResidentTTS(TTS):
        cleanup_calls = 0

        def empty_cache(self):
            self.cleanup_calls += 1
            if self.cleanup_calls >= 32 or torch.cuda.memory_reserved() > 3 * 1024**3:
                self.cleanup_calls = 0
                super().empty_cache()

    weights = {
        "t2s_weights_path": str((root / settings["gpt"]).resolve(strict=True)),
        "vits_weights_path": str((root / settings["sovits"]).resolve(strict=True)),
    }
    config = {
        **TTS_Config.default_configs[settings.get("version", "v2Pro")],
        **weights,
        "device": "cuda",
        "is_half": settings.get("isHalf", True),
    }
    reference = str((root / settings["reference"]).resolve(strict=True))
    voice = ResidentTTS(TTS_Config({"custom": config}))
    if settings.get("cudaGraph", False):
        from agent_voice_graph import CachedSemanticTransformer
        voice.t2s_model.model.t2s_transformer = CachedSemanticTransformer(voice.t2s_model.model.t2s_transformer)
    empty_prompt = {key: ([] if isinstance(value, list) else None) for key, value in voice.prompt_cache.items()}
    reference_cache = OrderedDict()

    def synthesize(text, language, profile=None):
        effective = {**settings, **(profile or {})}
        reference = str((root / effective["reference"]).resolve(strict=True))
        prompt_key = (reference, effective["transcript"], effective.get("promptLanguage", "ja"))
        if prompt_key in reference_cache:
            voice.prompt_cache = reference_cache.pop(prompt_key)
        else:
            voice.prompt_cache = {key: ([] if isinstance(value, list) else None) for key, value in empty_prompt.items()}
            voice.set_ref_audio(reference)
        samples = voice.run({
            "text": text, "text_lang": language, "ref_audio_path": reference,
            "prompt_text": effective["transcript"], "prompt_lang": effective.get("promptLanguage", "ja"),
            "text_split_method": effective.get("textSplitMethod", "cut0"), "batch_size": 1, "parallel_infer": effective.get("parallelInfer", False),
            **{key: value for key, value in effective.get("sampling", {}).items()
               if key in {"top_k", "top_p", "temperature", "repetition_penalty"}},
        })
        with torch.inference_mode():
            try:
                rate, pcm = next(samples)
            finally:
                samples.close()
        reference_cache[prompt_key] = voice.prompt_cache
        if len(reference_cache) > 8:
            reference_cache.popitem(last=False)
        if rate < 24000 or not pcm.any():
            raise RuntimeError("GPT-SoVITS did not return speech")
        if effective.get("limitGeneratedSilence", False):
            import numpy as np
            # Remove only abnormally long near-digital-silence runs, not voiced samples.
            frame = max(1, rate // 50)
            spans, quiet_start = [], None
            for start in range(0, len(pcm), frame):
                quiet = np.max(np.abs(pcm[start:start + frame].astype(np.int32))) < 32
                if quiet and quiet_start is None:
                    quiet_start = start
                if not quiet and quiet_start is not None:
                    if start - quiet_start > rate * 0.8:
                        spans.append((quiet_start + int(rate * 0.28), start))
                    quiet_start = None
            if quiet_start is not None and len(pcm) - quiet_start > rate * 0.8:
                spans.append((quiet_start + int(rate * 0.28), len(pcm)))
            if spans:
                pieces, last = [], 0
                for begin, end in spans:
                    pieces.append(pcm[last:begin])
                    last = end
                pieces.append(pcm[last:])
                pcm = np.concatenate(pieces)
        return rate, pcm

    warmups = {"zh": "语音准备完毕。", "ja": "音声の準備ができました。", "en": "The voice is ready.", "auto": "语音准备完毕。"}
    synthesize(warmups.get(selected_language, warmups["ja"]), selected_language)
    graph = voice.t2s_model.model.t2s_transformer
    send(ready=True, graphValidated=getattr(graph, "validated", None),
         graphMaxError=getattr(graph, "max_error", None))

    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("prepare", False):
                synthesize(warmups.get(request["language"], warmups["ja"]), request["language"], request.get("profile"))
                send(prepared=True)
                continue
            rate, pcm = synthesize(request["text"], request["language"], request.get("profile"))
            with io.BytesIO() as buffer:
                with wave.open(buffer, "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(rate)
                    output.writeframes(pcm.astype("<i2", copy=False).tobytes())
                send(wav=base64.b64encode(buffer.getvalue()).decode("ascii"))
        except Exception:
            TTS.empty_cache(voice)
            voice.cleanup_calls = 0
            traceback.print_exc()
            send(error=True)


if __name__ == "__main__":
    main()
