import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadFilename} from '../public/filename.js';
import worker from '../src/worker.js';
test('complete downloads and merged downloads share title and quality naming',()=>{
  const data={title:'香港名字的由来，和一块木头有关｜尼康Z5IIC'};
  const stream={kind:'combined',extension:'mp4',label:'1080P 高清 · 含声音'};
  assert.equal(downloadFilename(data,stream),'香港名字的由来，和一块木头有关｜尼康Z5IIC_1080P.mp4');
  assert.equal(downloadFilename(data,{...stream,kind:'video'},{complete:true}),downloadFilename(data,stream));
});
test('multipart names include current part and distinguish raw audio/video',()=>{
  const data={platform:'bilibili',title:'教程',page:2,pages:[{page:1,title:'基础'},{page:2,title:'进阶'}]};
  assert.equal(downloadFilename(data,{kind:'video',label:'1080P 高清',extension:'mp4'},{complete:true}),'教程_P2_进阶_1080P.mp4');
  assert.equal(downloadFilename(data,{kind:'audio',extension:'m4a'}),'教程_P2_进阶_音频.m4a');
});
test('filenames remove forbidden characters and cap UTF8 bytes without losing quality',()=>{
  const name=downloadFilename({title:'标题/:*?"<>|\r\n'.repeat(50)},{kind:'combined',label:'1080P 高清',extension:'mp4'});
  assert.ok(new TextEncoder().encode(name).length<=220);
  assert.equal(/[<>:"/\\|?*\r\n]/.test(name),false);
  assert.ok(name.endsWith('_1080P.mp4'));
});
test('signed proxy filename is returned as UTF8 and cannot be changed by the client',async()=>{
  const secret='filename-test-secret',url='https://cdn.bilivideo.com/video.mp4',exp=String(Math.floor(Date.now()/1000)+600),filename='视频标题_1080P.mp4';
  const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode([url,exp,'bilibili','mp4',filename].join('\n')));
  const sig=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  const query=new URLSearchParams({url,exp,platform:'bilibili',ext:'mp4',filename,sig});
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('sample');};
  try{
    const response=await worker.fetch(new Request('https://example.com/api/download?'+query),{DOWNLOAD_SECRET:secret});
    assert.equal(response.status,200);assert.ok(response.headers.get('content-disposition').includes("filename*=UTF-8''"+encodeURIComponent(filename)));
    query.set('filename','修改后的名称.mp4');
    const tampered=await worker.fetch(new Request('https://example.com/api/download?'+query),{DOWNLOAD_SECRET:secret});
    assert.equal(tampered.status,403);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
