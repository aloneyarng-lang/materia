import { isNoteEvent, type Track, type NoteEvent } from "@signal-app/core"
import { useRef, useState } from "react"
import { usePianoRoll } from "../piano-roll/hooks/usePianoRoll"
import { useHistory } from "../../hooks/useHistory"
import { usePlayer } from "../../hooks/usePlayer"
import { useSong } from "../../hooks/useSong"
import { guessKey, pitchNames, presets, remapPitch } from "./music-remap.js"

type Snapshot = Map<NoteEvent["id"], { base:number, last:number }>
export function ScalePanel() {
  const { selectedTrackId } = usePianoRoll()
  const { playOrPause, isPlaying } = usePlayer()
  const { tracks, setSaved } = useSong()
  const track = tracks.find(t => t.id === selectedTrackId)
  const { pushHistory } = useHistory()
  const snapshots = useRef(new WeakMap<Track, Snapshot>())
  const panel = useRef<HTMLDialogElement>(null)
  const [root,setRoot] = useState(0)
  const [scale,setScale] = useState("原音阶")
  const [tweaks,setTweaks] = useState(Array<number>(12).fill(0))
  const [status,setStatus] = useState("")
  function snapshot(track:Track) {
    const notes = track.events.filter(isNoteEvent)
    const saved = snapshots.current.get(track) ?? new Map() as Snapshot
    for (const n of notes) {
      if (saved.get(n.id)?.last !== n.noteNumber)
        saved.set(n.id,{base:n.noteNumber,last:n.noteNumber})
    }
    snapshots.current.set(track,saved)
    return {saved,notes}
  }
  function apply(r:number,s:string,offsets:number[],original=false) {
    if (!track || track.isRhythmTrack || track.isConductorTrack) return
    const {saved,notes} = snapshot(track)
    const changes = notes.flatMap(n => {
      const entry = saved.get(n.id)!
      const pitch = original ? entry.base : remapPitch(entry.base,r,presets[s],offsets)
      if (pitch === n.noteNumber) return []
      return [{id:n.id,noteNumber:pitch}]
    })
    if(changes.length){
      pushHistory()
      track.updateEvents(changes)
      for(const c of changes)saved.get(c.id)!.last=c.noteNumber
      setSaved(false)
    }
    setStatus(original?"当前为原音":"当前为映射版")
  }
  return <><button className="materia-command" disabled={!track || track.isRhythmTrack || track.isConductorTrack}
    onClick={()=>panel.current?.showModal()}>音阶重映射</button>
    <dialog className="materia-scale" ref={panel}><h2>音阶重映射</h2><label>主音 <select value={root} onChange={e=>{
      const r=Number(e.target.value);setRoot(r);apply(r,scale,tweaks)
    }}>{pitchNames.map((n,i)=><option key={n} value={i}>{n}</option>)}</select></label>
    <button onClick={()=>{
      if(!track)return
      const {saved,notes}=snapshot(track)
      const key=guessKey(notes.map(n=>({pitch:saved.get(n.id)!.base,beats:n.duration})))
      if(!key){setStatus("音符不足，无法确定主音");return}
      setRoot(key.root);apply(key.root,scale,tweaks)
      setStatus(pitchNames[key.root]+(key.mode?" 小调":" 大调"))
    }}>自动猜调</button>
    <label>预设 <select value={scale} onChange={e=>{setScale(e.target.value);apply(root,e.target.value,tweaks)}}>
      {Object.keys(presets).map(n=><option key={n}>{n}</option>)}</select></label>
    <details><summary>逐音微调</summary>{pitchNames.map((n,i)=><label key={n}>{n}
      <select value={tweaks[i]} onChange={e=>{const next=tweaks.slice();next[i]=Number(e.target.value);setTweaks(next);apply(root,scale,next)}}>
      {[-1,0,1].map(v=><option key={v} value={v}>{v>0?"+1":v}</option>)}</select></label>)}</details>
    <button onClick={()=>apply(root,scale,tweaks,true)}>原音</button><button onClick={()=>apply(root,scale,tweaks)}>映射版</button>
    <button onClick={playOrPause}>{isPlaying?"暂停":"试听"}</button><span className="materia-progress" role="status">{status}</span><button onClick={()=>panel.current?.close()}>完成</button></dialog></>
}
