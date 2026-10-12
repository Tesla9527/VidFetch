import test from 'node:test';
import assert from 'node:assert/strict';
import {Output,BufferTarget,Mp4OutputFormat,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacket} from 'mediabunny';
import {inspectMp4} from '../src/mp4-info.js';
import {parseVideo} from '../src/worker.js';

async function fixture(withAudio=true){
  const target=new BufferTarget();const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const video=new EncodedVideoPacketSource('avc');output.addVideoTrack(video);
  const audio=withAudio?new EncodedAudioPacketSource('aac'):undefined;if(audio)output.addAudioTrack(audio);
  await output.start();
  await video.add(new EncodedPacket(new Uint8Array([0,0,0,2,101,0]),'key',0,.1),{decoderConfig:{codec:'avc1.42001e',codedWidth:1920,codedHeight:1080,description:new Uint8Array([1,66,0,30,255,225,0,4,103,66,0,30,1,0,2,104,0])}});video.close();
  if(audio){await audio.add(new EncodedPacket(new Uint8Array([1,2]),'key',0,.1),{decoderConfig:{codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:2,description:new Uint8Array([18,16])}});audio.close();}
  await output.finalize();return new Uint8Array(target.buffer);
}
test('MP4 inspection reads dimensions and codec from real container sample descriptions',async()=>{
  const bytes=await fixture();assert.deepEqual(inspectMp4(bytes),{width:1920,height:1080,codec:'avc'});
  assert.equal(inspectMp4(bytes.subarray(0,32)),undefined);
  assert.equal(inspectMp4(await fixture(false)),undefined);
  assert.equal(inspectMp4(new TextEncoder().encode('1080p avc1 mp4a bogus')),undefined);
});
test('Douyin HD candidate uses verified media dimensions instead of requested ratio',async()=>{
  const bytes=await fixture();const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(raw,init)=>{
    const u=new URL(raw);calls.push(u);
    assert.equal(init.headers.has('Cookie'),false);
    if(u.pathname.endsWith('/feed/'))return Response.json({status_code:0,aweme_list:[{aweme_id:'123',video:{play_addr_h264:{uri:'v0123456789',height:576,url_list:['https://v.douyinvod.com/576.mp4']}}}]});
    assert.equal(u.searchParams.get('ratio'),'1080p');assert.equal(u.searchParams.get('video_id'),'v0123456789');
    return new Response(bytes,{status:206,headers:{'content-range':`bytes 0-${bytes.length-1}/17705152`,'content-type':'video/mp4'}});
  };
  try{const data=await parseVideo('https://www.douyin.com/video/123');assert.equal(calls.length,2);assert.equal(data.streams[0].height,1080);assert.equal(data.streams[0].codec,'avc');assert.equal(data.streams[0].size,17705152);assert.equal(data.streams[0].width,1920);}finally{globalThis.fetch=original;}
});
