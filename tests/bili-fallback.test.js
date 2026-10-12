import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {signWbi,mixinKey,embeddedJson} from '../src/bili-wbi.js';
import {parseVideo} from '../src/worker.js';
const info={bvid:'BV123',aid:123,title:'Test',pages:[{page:1,cid:1,duration:10}]};
test('WBI signing sorts and cleans query values and matches independent MD5',()=>{
  const key='ea1db124af3c7062474693fa704f4ff8';
  const query='bar=514&baz=1919810&foo=114&wts=1702204169';
  const digest=createHash('md5').update(query+key).digest('hex');
  assert.equal(signWbi({foo:'114!*',baz:'1919810',bar:'514'},key,1702204169),query+'&w_rid='+digest);
  assert.throws(()=>mixinKey({}),/未返回/);
});
test('embedded page JSON handles braces and quotes inside strings without evaluating script',()=>{
  const value={videoData:{title:'字串 } \\"',bvid:'BV123'}};
  assert.deepEqual(embeddedJson('window.__INITIAL_STATE__='+JSON.stringify(value)+';dangerousCall();','window.__INITIAL_STATE__='),value);
});
test('Bilibili metadata 412 falls back to matching public page with desktop client headers',async()=>{
  const original=globalThis.fetch;const paths=[];
  globalThis.fetch=async(raw,init)=>{
    const u=new URL(raw);paths.push(u.pathname);
    assert.match(init.headers.get('User-Agent'),/Windows NT/);
    assert.equal(init.headers.get('Cookie'),'SESSDATA=test');
    if(u.pathname.endsWith('/view'))return new Response('blocked',{status:412});
    if(u.pathname.startsWith('/video/'))return new Response('<script>window.__INITIAL_STATE__='+JSON.stringify({videoData:info})+';window.extra={};</script>');
    return Response.json({code:0,data:{quality:64,durl:[{url:'https://cdn.bilivideo.com/video.mp4'}]}});
  };
  try{const d=await parseVideo('https://www.bilibili.com/video/BV123',1,{cookie:'SESSDATA=test'});assert.equal(d.title,'Test');assert.ok(paths.includes('/video/BV123/'));}finally{globalThis.fetch=original;}
});
test('Bilibili playurl 412 falls back to signed WBI endpoint',async()=>{
  const original=globalThis.fetch;let signed=0;
  globalThis.fetch=async raw=>{
    const u=new URL(raw);
    if(u.pathname.endsWith('/view'))return Response.json({code:0,data:info});
    if(u.pathname==='/x/player/playurl')return new Response('blocked',{status:412});
    if(u.pathname.endsWith('/nav'))return Response.json({code:-101,data:{wbi_img:{img_url:'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'}}});
    assert.equal(u.pathname,'/x/player/wbi/playurl');assert.match(u.searchParams.get('w_rid'),/^[a-f0-9]{32}$/);assert.equal(u.searchParams.get('bvid'),'BV123');signed++;
    return Response.json({code:0,data:{quality:64,durl:[{url:'https://cdn.bilivideo.com/video.mp4'}]}});
  };
  try{const d=await parseVideo('https://www.bilibili.com/video/BV123');assert.equal(d.streams[0].quality,64);assert.equal(signed,2);}finally{globalThis.fetch=original;}
});
test('blocked API and public page report server restriction without claiming Cookie expiration',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('blocked',{status:412});};
  try{await assert.rejects(parseVideo('https://www.bilibili.com/video/BV123',1,{cookie:'SESSDATA=test'}),/服务器获取视频信息（412）/);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
