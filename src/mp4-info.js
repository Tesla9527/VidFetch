// Inspect MP4 sample descriptions without decoding or trusting URL labels.
export function inspectMp4(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const typeAt=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  let result;let boxes=0;let audio=false;
  const walk=(start,end,depth=0)=>{
    if(depth>8)return;
    for(let offset=start;offset+8<=end && ++boxes<4000;){
      let size=view.getUint32(offset);let header=8;
      const type=typeAt(offset+4);
      if(size===1){if(offset+16>end)return;size=Number(view.getBigUint64(offset+8));header=16;}
      if(size===0)size=end-offset;
      if(size<header || !Number.isSafeInteger(size))return;
      const stop=offset+size;
      if(stop>end)return;
      if(['moov','trak','mdia','minf','stbl'].includes(type))walk(offset+header,stop,depth+1);
      else if(type==='stsd')walk(offset+header+8,stop,depth+1);
      else if(['avc1','avc3','hvc1','hev1','av01'].includes(type) && size>=86){
        const width=view.getUint16(offset+32),height=view.getUint16(offset+34);
        if(width>0&&height>0&&width<=16384&&height<=16384)result={width,height,codec:type.startsWith('avc')?'avc':type==='av01'?'av1':'hevc'};
      } else if(type==='mp4a')audio=true;
      offset=stop;
    }
  };
  walk(0,bytes.length);
  return result&&audio?result:undefined;
}
