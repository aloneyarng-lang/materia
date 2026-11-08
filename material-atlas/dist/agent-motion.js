// Original Workshop shake effect: sine -> bounds .994/.997 -> bidirectional flow.
// Keep its short transition rather than stretching partial eyelid warps.
export function blinkAt(seconds) {
  const signal=Math.sin(seconds*1.45)*.498+.5;
  const activation=Math.max(0,Math.min(1,(signal-.994)/.003));
  return activation*2-1;
}
