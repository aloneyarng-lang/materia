import test from 'node:test';
import assert from 'node:assert/strict';
import {blinkAt} from '../dist/agent-motion.js';

test('Workshop blinking uses the original bounded bidirectional flow and brief transition',()=>{
  const peak=Math.PI/2/1.45,period=2*Math.PI/1.45;
  assert.equal(blinkAt(0),-1);
  assert.equal(blinkAt(peak),1);
  assert.equal(blinkAt(peak+.04),1);
  assert.ok(blinkAt(peak+.065)>-1&&blinkAt(peak+.065)<1);
  assert.equal(blinkAt(peak+.12),-1);
  for(let frame=0;frame<600;frame++){
    const t=frame/60,value=blinkAt(t);
    assert.ok(value>=-1&&value<=1);
    assert.ok(Math.abs(value-blinkAt(t+period))<1e-10);
  }
});
