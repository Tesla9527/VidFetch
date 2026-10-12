import test from 'node:test';
import assert from 'node:assert/strict';
import {Output,BufferTarget,Mp4OutputFormat,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacket,Input,BufferSource,MP4,EncodedPacketSink} from 'mediabunny';
import {remux,mergeDownloads} from '../src/remux.js';
async function fixture(type){
  const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat(),target});
  const source=type==='video'?new EncodedVideoPacketSource('vp9'):new EncodedAudioPacketSource('aac');
  if(type==='video')output.addVideoTrack(source);else output.addAudioTrack(source);
  await output.start();
  const config=type==='video'?{codec:'vp09.00.10.08',codedWidth:1920,codedHeight:1080}:{codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:2,description:new Uint8Array([18,16])};
  // Container fixtures test packet preservation, without claiming decoded playback.
  for(let i=0;i<3;i++)await source.add(new EncodedPacket(new Uint8Array([1,2,3,i]),'key',i*.1,.1),i===0?{decoderConfig:config}:undefined);
  source.close();await output.finalize();return new Uint8Array(target.buffer);
}
test('remux preserves video dimensions, audio and compressed packet bytes',async()=>{
  const video=await fixture('video');const audio=await fixture('audio');
  const buffer=await remux(video,audio);const input=new Input({source:new BufferSource(buffer),formats:[MP4]});
  try{
    const v=await input.getPrimaryVideoTrack();const a=await input.getPrimaryAudioTrack();
    assert.equal(v.displayWidth,1920);assert.equal(v.displayHeight,1080);assert.equal(await a.getCodec(),'aac');
    for(const track of [v,a]){let count=0;for await(const p of new EncodedPacketSink(track).packets()){assert.deepEqual([...p.data],[1,2,3,count]);count++;}assert.equal(count,3);}
  }finally{input.dispose();}
});
test('local merge rejects oversized downloads before reading their body',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('test',{headers:{'content-length':String(300*1024*1024)}});
  try{await assert.rejects(mergeDownloads('/video','/audio'),/256MB/);}finally{globalThis.fetch=original;}
});
test('merged download reports separate video, audio and merge stages with real lengths',async()=>{
  const video=await fixture('video'),audio=await fixture('audio');const original=globalThis.fetch;const reports=[];
  globalThis.fetch=async url=>{const bytes=url==='/video'?video:audio;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});};
  try{const blob=await mergeDownloads('/video','/audio',(text,info)=>reports.push(info));assert.ok(blob.size>0);assert.deepEqual(reports.map(x=>x.stage),['video','audio','merge']);assert.equal(reports[0].loaded,video.length);assert.equal(reports[0].total,video.length);assert.equal(reports[1].total,audio.length);}finally{globalThis.fetch=original;}
});
