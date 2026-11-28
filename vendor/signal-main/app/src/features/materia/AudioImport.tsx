import "./music-tools.css"
import { isSetTempoEvent, type NoteEvent } from "@signal-app/core"
import { useRef, useState } from "react"
import { usePianoRoll } from "../piano-roll/hooks/usePianoRoll"
import { useHistory } from "../../hooks/useHistory"
import { useStores } from "../../hooks/useStores"

export function AudioImport() {
  const { selectedTrackId } = usePianoRoll()
  const { songStore, player } = useStores()
  const { pushHistory } = useHistory()
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  async function load(file: File) {
    const song = songStore.song
    const track = song.getTrack(selectedTrackId)
    if (!track || track.isConductorTrack || track.isRhythmTrack) {
      setStatus("请先选择旋律轨道")
      return
    }
    const start = Math.round(player.position)
    setBusy(true)
    try {
      const { transcribe } = await import("./transcribe")
      setStatus("读取音频…")
      const notes = await transcribe(file, n => setStatus("转录 " + Math.round(n * 100) + "%"))
      if (songStore.song !== song || song.getTrack(selectedTrackId) !== track)
        throw Error("目标轨道已经变更，请重新导入")
      if (!notes.length) throw Error("未识别到音符")
      const tempos = song.conductorTrack?.events.filter(isSetTempoEvent) ?? []
      function tickAt(seconds: number) {
        let tick = start, tempo = 500000
        for (const e of tempos) {
          if (e.tick <= start) { tempo = e.microsecondsPerBeat; continue }
          const span = (e.tick - tick) * tempo / (song.timebase * 1000000)
          if (seconds < span) break
          seconds -= span
          tick = e.tick
          tempo = e.microsecondsPerBeat
        }
        return Math.round(tick + seconds * song.timebase * 1000000 / tempo)
      }
      const events = notes.map(n => {
        const tick = tickAt(n.startTimeSeconds)
        return { type:"channel" as const, subtype:"note" as const, tick,
          noteNumber:n.pitchMidi, velocity:Math.max(1, Math.min(127, Math.round(n.amplitude * 127))),
          duration:Math.max(1, tickAt(n.startTimeSeconds + n.durationSeconds) - tick) }
      })
      pushHistory()
      track.addEvents<NoteEvent>(events)
      song.updateEndOfSong()
      song.isSaved = false
      setStatus("已加入 " + notes.length + " 个音符")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "转录失败")
    } finally { setBusy(false) }
  }
  return <><button className="materia-command" disabled={busy} onClick={() => input.current?.click()}>导入音频（MP3/WAV）</button>
    <input hidden type="file" ref={input} accept=".mp3,.wav" onChange={e => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (file) void load(file)
    }}/><span className="materia-progress" role="status">{status}</span></>
}
