import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch"

let pitch: BasicPitch | undefined
export async function transcribe(file: File, progress: (n: number) => void) {
  const decoder = new OfflineAudioContext(1, 1, 22050)
  const decoded = await decoder.decodeAudioData(await file.arrayBuffer())
  const offline = new OfflineAudioContext(1, decoded.length, decoded.sampleRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const mono = await offline.startRendering()
  pitch ??= new BasicPitch(new URL("./basic-pitch/model.json", document.baseURI).href)
  const frames: number[][] = [], onsets: number[][] = []
  try {
    await pitch.evaluateModel(mono.getChannelData(0), (f, o) => {
      frames.push(...f)
      onsets.push(...o)
    }, progress)
    return noteFramesToTime(outputToNotesPoly(frames, onsets, 0.25, 0.25, 5))
  } catch (error) {
    pitch = undefined
    throw error
  }
}
