import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{inputUrl,parseVideo,cleanCookie,biliMediaAddress} from '../src/worker.js';
test('share input validates host, scheme and credentials',()=>{assert.equal(inputUrl('分享 https://v.douyin.com/abc/ 视频').hostname,'v.douyin.com');for(const u of ['https://bilibili.com.evil.test/','http://bilibili.com/','https://root@bilibili.com/','https://127.0.0.1/','https://bilibili.com:8443/'])assert.throws(()=>inputUrl(u));});
test('Bilibili selects part and reports actual quality',async()=>{const original=globalThis.fetch;const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return Response.json({code:0,data:calls.length===1?{bvid:'BV123',title:'Test',owner:{name:'Author'},pages:[{page:1,cid:100,part:'One',duration:60},{page:2,cid:200,part:'Two',duration:90}]}:{quality:32,accept_quality:[64,32],accept_description:['720P','480P'],durl:[{url:'https://a.bilivideo.com/test.mp4',size:100}]}});};try{const d=await parseVideo('https://www.bilibili.com/video/BV123',2);assert.equal(d.page,2);assert.match(calls[1],/cid=200/);assert.equal(d.streams[0].label,'480P · 含声音');assert.match(calls[1],/qn=127/);}finally{globalThis.fetch=original;}});
test('short link cannot redirect to private hosts',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});};try{await assert.rejects(parseVideo('https://b23.tv/abc'),/不受支持/);assert.equal(calls,1);}finally{globalThis.fetch=original;}});
test('Douyin extracts router share data',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<script>window._ROUTER_DATA = '+JSON.stringify({loaderData:{item_list:[{aweme_id:'123',desc:'Test',author:{nickname:'Alice'},video:{duration:42000,play_addr:{url_list:['https://a.douyinvod.com/v.mp4']}}}]}})+'</script>');try{const d=await parseVideo('https://www.douyin.com/video/123');assert.equal(d.title,'Test');assert.equal(d.duration,42);}finally{globalThis.fetch=original;}});
test('rejects invalid download tokens and cross origin parse requests',async()=>{const r=await worker.fetch(new Request('https://example.com/api/download?url=https://a.bilivideo.com/v.mp4&exp=9999999999&platform=bilibili&sig='+'0'.repeat(64)),{DOWNLOAD_SECRET:'test'});assert.equal(r.status,403);const cross=await worker.fetch(new Request('https://example.com/api/parse',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}),{});assert.equal(cross.status,403);});
test('signed download streams content and forwards byte ranges',async()=>{
  const original=globalThis.fetch;const exp=String(Math.floor(Date.now()/1000)+600);const url='https://a.bilivideo.com/test.mp4';const secret='integration-test-secret';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode([url,exp,'bilibili','mp4'].join('\n')))),b=>b.toString(16).padStart(2,'0')).join('');
  globalThis.fetch=async(target,init)=>{assert.equal(String(target),url);assert.equal(init.headers.get('Range'),'bytes=0-3');assert.equal(init.headers.get('Referer'),'https://www.bilibili.com/');return new Response('test',{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-3/10'}});};
  try{const response=await worker.fetch(new Request('https://example.com/api/download?'+new URLSearchParams({url,exp,platform:'bilibili',sig}),{headers:{Range:'bytes=0-3'}}),{DOWNLOAD_SECRET:secret});assert.equal(response.status,206);assert.equal(await response.text(),'test');assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(response.headers.get('content-range'),'bytes 0-3/10');}finally{globalThis.fetch=original;}
});
test('Douyin session API receives UIFID, falls back by aid and selects real bitrate variants',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(raw,init)=>{
    const url=new URL(raw);calls.push(url);
    if(['api5-normal-c-hl.amemv.com','aweme.snssdk.com'].includes(url.hostname)){assert.equal(init.headers.has('Cookie'),false);assert.equal(init.headers.has('uifid'),false);return Response.json({status_code:0,aweme_list:[]});}
    if(url.hostname==='www.iesdouyin.com') {assert.equal(init.headers.has('Cookie'),false);return new Response('<script>window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"itemId":"7689691017376746790"}}}</script>');}
    assert.equal(init.headers.get('Cookie'),'UIFID=test-uifid; sessionid=test-session');
    assert.equal(init.headers.get('uifid'),'test-uifid');
    if(url.searchParams.get('aid')==='6383') return Response.json({status_code:0});
    return Response.json({status_code:0,aweme_detail:{aweme_id:'7689691017376746790',desc:'Cookie API success',video:{duration:10000,bit_rate:[{bit_rate:1000000,play_addr:{height:720,url_list:['https://v.douyinvod.com/720.mp4']}},{bit_rate:3000000,play_addr:{height:1080,url_list:['https://v.douyinvod.com/1080.mp4']}}],play_addr:{url_list:['https://v.douyinvod.com/default.mp4']}}}});
  };
  try {const data=await parseVideo('https://www.douyin.com/jingxuan?modal_id=7689691017376746790',1,{cookie:'UIFID=test-uifid; sessionid=test-session'});assert.equal(calls.length,5);assert.equal(data.title,'Cookie API success');assert.equal(data.streams[0].label,'1080P · 含声音');assert.equal(JSON.stringify(data).includes('test-session'),false);}finally{globalThis.fetch=original;}
});
test('DASH exposes only higher available video tracks with a separate audio track',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(raw,init)=>{
    assert.equal(init.headers.get('Cookie'),'SESSDATA=test');
    const url=new URL(raw);
    if(url.pathname.endsWith('/view')) return Response.json({code:0,data:{bvid:'BV123',title:'Test',pages:[{page:1,cid:1,duration:1}]}});
    if(url.searchParams.get('fnval')==='0') return Response.json({code:0,data:{quality:80,durl:[{url:'https://a.bilivideo.com/1080.mp4'}]}});
    return Response.json({code:0,data:{dash:{video:[{id:80,baseUrl:'https://a.bilivideo.com/1080.m4s',codecs:'avc1'},{id:120,baseUrl:'https://a.bilivideo.com/4k.m4s',codecs:'avc1'}],audio:[{bandwidth:100,baseUrl:'https://a.bilivideo.com/audio.m4s'}]}}});
  };
  try {const data=await parseVideo('https://www.bilibili.com/video/BV123',1,{cookie:'SESSDATA=test'});assert.deepEqual(data.streams.map(s=>s.kind),['combined','video','audio']);assert.equal(data.streams[1].quality,120);assert.equal(data.streams[2].extension,'m4a');}finally{globalThis.fetch=original;}
});
test('credentials do not follow cross host redirects',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(raw,init)=>{
    calls++;
    if(calls===1){assert.equal(init.headers.get('Cookie'),'SESSDATA=test');return new Response(null,{status:302,headers:{location:'https://www.bilibili.com/fallback'}});}
    assert.equal(init.headers.has('Cookie'),false);return Response.json({code:-1,message:'test stop'});
  };
  try{await assert.rejects(parseVideo('https://www.bilibili.com/video/BV123',1,{cookie:'SESSDATA=test'}),/test stop/);}finally{globalThis.fetch=original;}
});
test('Cookie rejects header injection and accepts a copied header prefix',()=>{
  assert.equal(cleanCookie('Cookie: UIFID=test; sessionid=example'),'UIFID=test; sessionid=example');
  assert.throws(()=>cleanCookie('sessionid=test\r\nInjected: value'));
});
test('Douyin anonymous failure explains how to provide a session without inventing deletion',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async raw=>String(raw).includes('iesdouyin') ? new Response('<script>window._ROUTER_DATA = {"loaderData":{}}</script>') : new Response('Blocked by ArgusSecurityPlugin Uifid Not Found',{status:403});
  try{await assert.rejects(parseVideo('https://www.douyin.com/jingxuan?modal_id=7689691017376746790'),/填写自己浏览器中的抖音 Cookie/);}finally{globalThis.fetch=original;}
});
test('Douyin public feed picks exact ID, never sends Cookie and skips web endpoints on success',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(raw,init)=>{calls++;assert.equal(new URL(raw).hostname,'api5-normal-c-hl.amemv.com');assert.equal(init.headers.has('Cookie'),false);assert.equal(init.headers.has('uifid'),false);return Response.json({status_code:0,aweme_list:[{aweme_id:'999',desc:'Unrelated recommendation',video:{play_addr:{url_list:['https://v.douyinvod.com/wrong.mp4']}}},{aweme_id:'7689691017376746790',desc:'Requested video',video:{height:1080,play_addr:{height:1080,url_list:['https://v.douyinvod.com/right.mp4']},bit_rate:[{bit_rate:1000000,play_addr:{height:720,url_list:['https://v.douyinvod.com/720.mp4']}}]}}]});};
  try{const d=await parseVideo('https://www.douyin.com/jingxuan?modal_id=7689691017376746790',1,{cookie:'UIFID=private'});assert.equal(calls,1);assert.equal(d.title,'Requested video');assert.equal(d.streams[0].label,'1080P · 含声音');assert.equal(d.streams.some(s=>s.url.includes('wrong')),false);}finally{globalThis.fetch=original;}
});
test('Douyin falls back to backup feed if primary only returns recommendations',async()=>{
  const original=globalThis.fetch;const hosts=[];
  globalThis.fetch=async(raw)=>{const host=new URL(raw).hostname;hosts.push(host);return Response.json({status_code:0,aweme_list:host==='api5-normal-c-hl.amemv.com'?[{aweme_id:'999',video:{}}]:[{aweme_id:'123',desc:'Backup success',video:{play_addr:{url_list:['https://v.douyinvod.com/right.mp4']}}}]});};
  try{const d=await parseVideo('https://www.douyin.com/video/123');assert.equal(d.title,'Backup success');assert.deepEqual(hosts,['api5-normal-c-hl.amemv.com','aweme.snssdk.com']);}finally{globalThis.fetch=original;}
});
test('Douyin displays one highest bitrate variant per resolution',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({status_code:0,aweme_list:[{aweme_id:'123',video:{play_addr:{height:720,url_list:['https://v.douyinvod.com/default.mp4']},bit_rate:[{bit_rate:1000000,play_addr:{height:720,url_list:['https://v.douyinvod.com/low.mp4']}},{bit_rate:3000000,play_addr:{height:720,url_list:['https://v.douyinvod.com/best.mp4']}},{bit_rate:800000,play_addr:{height:576,url_list:['https://v.douyinvod.com/576.mp4']}}]}}]});
  try{const d=await parseVideo('https://www.douyin.com/video/123');assert.equal(d.streams.length,2);assert.equal(d.streams[0].url,'https://v.douyinvod.com/best.mp4');assert.deepEqual(d.streams.map(s=>s.height),[720,576]);}finally{globalThis.fetch=original;}
});
test('Douyin prefers H264 over higher bitrate HEVC and clearly labels HEVC-only resolutions',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({status_code:0,aweme_list:[{aweme_id:'123',video:{play_addr_h264:{height:576,url_list:['https://v.douyinvod.com/compatible.mp4']},bit_rate:[{is_h265:1,bit_rate:900000,play_addr:{height:576,url_list:['https://v.douyinvod.com/hevc576.mp4']}},{is_h265:1,bit_rate:1000000,play_addr:{height:720,url_list:['https://v.douyinvod.com/hevc720.mp4']}}]}}]});
  try{const d=await parseVideo('https://www.douyin.com/video/123');assert.equal(d.streams.length,2);assert.equal(d.streams[0].url,'https://v.douyinvod.com/compatible.mp4');assert.equal(d.streams[0].codec,'avc');assert.equal(d.streams[1].codec,'hevc');assert.match(d.streams[1].label,/需兼容播放器/);assert.equal(d.streams.some(s=>s.url.includes('hevc576')),false);}finally{globalThis.fetch=original;}
});
test('Bilibili chooses HTTPS backup when main audio uses unsupported CDN port',()=>{
  assert.equal(biliMediaAddress({baseUrl:'https://node.mcdn.bilivideo.cn:8082/audio.m4s',backupUrl:['https://cdn.bilivideo.com/audio.m4s']}),'https://cdn.bilivideo.com/audio.m4s');
  assert.equal(biliMediaAddress({base_url:'https://evil.test/audio',backup_url:['https://cdn.bilivideo.com/audio.m4s']}),'https://cdn.bilivideo.com/audio.m4s');
  assert.equal(biliMediaAddress({baseUrl:'https://node.mcdn.bilivideo.cn:8082/audio.m4s'}),undefined);
});

