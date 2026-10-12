import {inspectMp4} from './mp4-info.js';
import {downloadFilename} from '../public/filename.js';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const APP_UA = 'com.ss.android.ugc.aweme/290100 (Linux; U; Android 13; zh_CN; Pixel 7; Build/TD1A.220804.031)';
const domains = ['bilibili.com', 'b23.tv', 'douyin.com', 'iesdouyin.com'];
const matches = (host, list) => list.some(d => host === d || host.endsWith('.' + d));
export function inputUrl(input) {
  const match = String(input || '').match(/https?:\/\/[^\s<>"，。]+/);
  if (!match) throw new Error('请粘贴包含完整链接的分享内容。');
  const url = new URL(match[0]);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !matches(url.hostname, domains)) throw new Error('仅支持 HTTPS 的 B 站和抖音链接。');
  return url;
}
async function upstream(url, init = {}, allowed = domains) {
  const initialHost = new URL(url).hostname;
  for (let i = 0; i < 6; i++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || !matches(u.hostname, allowed)) throw new Error('平台返回了不受支持的地址。');
    const headers = new Headers({ 'User-Agent': UA, ...init.headers });
    // Credentials must never follow a redirect to a different host.
    if (u.hostname !== initialHost) { headers.delete('Cookie'); headers.delete('uifid'); }
    const res = await fetch(u, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if ([301,302,303,307,308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('平台跳转缺少目标地址。');
      await res.body?.cancel(); url = new URL(location, u).href; continue;
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`平台请求失败（${res.status}），请稍后重试。`); }
    return { res, url: u };
  }
  throw new Error('分享链接跳转次数过多。');
}
async function jsonApi(url, cookie = '') {
  const { res } = await upstream(url, { headers: { Referer: 'https://www.bilibili.com/', ...(cookie ? {Cookie:cookie} : {}) } });
  const body = await res.json();
  if (body.code !== 0) throw new Error(`B 站暂时无法解析：${body.message || body.code}`);
  return body.data;
}
export function cleanCookie(value) {
  if (typeof value !== 'string' || value.length > 24000 || /[\r\n\x00-\x1f\x7f]/.test(value)) throw new Error('Cookie 格式不正确，请只复制请求头 Cookie 的值。');
  return value.trim().replace(/^cookie:\s*/i, '');
}
const qualityName = (play, q) => play.support_formats?.find(f => f.quality === q)?.new_description || play.accept_description?.[play.accept_quality?.indexOf(q)] || ({127:'8K',126:'杜比视界',125:'HDR',120:'4K',116:'1080P 60帧',112:'1080P 高码率',80:'1080P',74:'720P 60帧',64:'720P',32:'480P',16:'360P'}[q]) || '可用清晰度';
export function biliMediaAddress(stream) {
  for(const raw of [stream.baseUrl,stream.base_url,stream.url,...(stream.backupUrl||stream.backup_url||[])]) {
    if(!raw)continue;
    try{const u=mediaUrl(raw);if(matches(u.hostname,['bilivideo.com','bilivideo.cn']))return u.href;}catch{}
  }
}
async function douyinHdCandidate(video) {
  const uri=video.play_addr?.uri||video.play_addr_h264?.uri;
  if(!uri || !/^[a-zA-Z0-9_-]{8,100}$/.test(uri))return;
  const href='https://aweme.snssdk.com/aweme/v1/play/?'+new URLSearchParams({video_id:uri,ratio:'1080p',line:'0',is_play_url:'1',watermark:'0'});
  const {res,url}=await upstream(href,{headers:{'User-Agent':APP_UA,Range:'bytes=0-262143'}},mediaDomains);
  const reader=res.body.getReader();const chunks=[];let length=0;
  try{
    while(length<262144){const {done,value}=await reader.read();if(done)break;const chunk=value.subarray(0,262144-length);chunks.push(chunk);length+=chunk.length;}
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const info=inspectMp4(bytes);
  if(!info)return;
  const range=res.headers.get('content-range')?.match(/\/(\d+)$/);
  const size=range?Number(range[1]):res.status===200?Number(res.headers.get('content-length'))||undefined:undefined;
  return {addr:{url_list:[url.href]},height:Math.min(info.width,info.height),width:info.width,frameHeight:info.height,codec:info.codec,size,label:'高清播放版本'};
}
export async function parseVideo(input, page = 1, options = {}) {
  const cookie = cleanCookie(options.cookie || '');
  let url = inputUrl(input);
  if (['b23.tv','v.douyin.com'].includes(url.hostname)) { const resolved = await upstream(url.href); await resolved.res.body?.cancel(); url = resolved.url; }
  if (matches(url.hostname, ['bilibili.com'])) {
    const id = url.pathname.match(/\/(BV[\w]+|av\d+)/i)?.[1];
    if (!id) throw new Error('请使用 B 站普通视频链接（BV 或 av）。');
    const query = id.toLowerCase().startsWith('av') ? `aid=${id.slice(2)}` : `bvid=${id}`;
    const info = await jsonApi(`https://api.bilibili.com/x/web-interface/view?${query}`, cookie);
    const p = Number(page);
    if (!Number.isInteger(p) || p < 1 || p > info.pages.length) throw new Error('所选分 P 不存在。');
    const selected = info.pages[p - 1];
    const endpoint = `https://api.bilibili.com/x/player/playurl?bvid=${info.bvid}&cid=${selected.cid}`;
    const play = await jsonApi(`${endpoint}&qn=127&fnval=0&platform=html5&high_quality=1&fourk=1`, cookie);
    const streams = (play.durl || []).filter(s => s.url).map((s, i) => ({ url: s.url, kind:'combined', quality:play.quality, label: `${qualityName(play,play.quality)} · 含声音${play.durl.length > 1 ? ` · 片段 ${i + 1}` : ''}`, size: s.size, extension: /\.flv(?:\?|$)/i.test(s.url) ? 'flv' : 'mp4' }));
    const notices = [];
    // DASH may expose higher resolutions than the merged HTML5 stream.
    // A failed optional DASH request must not lose a working merged download.
    try {
      const dash = await jsonApi(`${endpoint}&qn=127&fnval=4048&fourk=1`, cookie);
      const seen = new Set();
      for (const video of [...(dash.dash?.video || [])].sort((a,b)=>b.id-a.id || (String(b.codecs).startsWith('avc')?1:0)-(String(a.codecs).startsWith('avc')?1:0))) {
        const address = biliMediaAddress(video);
        if (!address || seen.has(video.id) || streams.some(s=>s.kind==='combined' && s.quality>=video.id)) continue;
        seen.add(video.id);
        streams.push({url:address,kind:'video',quality:video.id,extension:'mp4',label:`${qualityName(dash,video.id)} · 仅画面`,codec:video.codecs});
      }
      if (streams.some(s=>s.kind==='video')) {
        const audio = [...(dash.dash?.audio || [])].sort((a,b)=>(b.bandwidth||0)-(a.bandwidth||0))[0];
        const address=audio&&biliMediaAddress(audio);
        if (address) streams.push({url:address,kind:'audio',extension:'m4a',label:'独立音频 · 配合高清画面'});
        notices.push('标为“仅画面”的高清文件需要与独立音频合并；“含声音”的文件可以直接播放。');
      }
    } catch { notices.push('高清独立流暂时不可用，已保留可下载的完整视频。'); }
    if (!cookie) notices.push('当前未登录，部分高清档位需要在解析设置中填写 B 站 Cookie；清晰度以平台实际返回为准。');
    if (!streams.length) throw new Error('没有可下载的视频流，可能需要登录或属于受限内容。');
    return { platform: 'bilibili', title: info.title, author: info.owner?.name, cover: info.pic, duration: selected.duration, source: `https://www.bilibili.com/video/${info.bvid}?p=${p}`, pages: info.pages.map(x => ({ page: x.page, title: x.part })), page: p, streams, notices };
  }
  const id = url.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1] || url.searchParams.get('modal_id') || url.searchParams.get('vid');
  if (!id || !/^\d+$/.test(id)) throw new Error('无法识别抖音视频编号，请复制视频的分享链接。');
  let item;
  // Feed responses include recommendations. Only use the exact requested ID,
  // and never send the visitor's web-session credentials to these app hosts.
  for (const host of ['api5-normal-c-hl.amemv.com','aweme.snssdk.com']) {
    try {
      const {res} = await upstream(`https://${host}/aweme/v1/feed/?aweme_id=${id}&aid=1128`,{headers:{'User-Agent':APP_UA,Accept:'application/json'}},['amemv.com','snssdk.com']);
      const feed = await res.json();
      item = feed.status_code === 0 ? feed.aweme_list?.find(entry=>String(entry.aweme_id)===id && entry.video) : undefined;
      if(item) break;
    } catch { /* Share page and session API remain available as fallbacks. */ }
  }
  let html = '';
  if(!item) try { const { res } = await upstream(`https://www.iesdouyin.com/share/video/${id}/`, {headers:{'Accept-Language':'zh-CN,zh;q=0.9'}}); html = await res.text(); } catch { /* Try the session API if the share page is unavailable. */ }
  let data;
  for (const pattern of [/window\._ROUTER_DATA\s*=\s*([\s\S]*?)<\/script>/, /<script[^>]+id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/]) {
    const raw = html.match(pattern)?.[1];
    if (!raw) continue;
    try { data = JSON.parse(raw.trim().replace(/;\s*$/, '')); } catch { try { data = JSON.parse(decodeURIComponent(raw.trim())); } catch {} }
    if (data) break;
  }
  const queue = [data];
  for (let i = 0; i < queue.length && i < 5000; i++) {
    const value = queue[i]; if (!value || typeof value !== 'object') continue;
    if (!item && value.video && String(value.aweme_id || value.awemeId || value.itemId) === id) { item = value; break; }
    queue.push(...Object.values(value).filter(v => v && typeof v === 'object'));
  }
  let failure = '';
  if (!item?.video) {
    const uifid = cookie.match(/(?:^|;\s*)(?:UIFID|uifid)=([^;]+)/)?.[1];
    const headers = {'User-Agent':DESKTOP_UA,Referer:`https://www.douyin.com/video/${id}`,Accept:'application/json','Accept-Language':'zh-CN,zh;q=0.9',...(cookie?{Cookie:cookie}:{}),...(uifid?{uifid}: {})};
    for (const aid of ['6383','1128']) {
      try {
        const query = new URLSearchParams({aweme_id:id,aid,device_platform:'webapp',channel:'channel_pc_web',cookie_enabled:'true',version_code:'290100',version_name:'29.1.0',browser_name:'Chrome',browser_version:'139.0.0.0',browser_platform:'Win32',browser_language:'zh-CN',browser_online:'true',engine_name:'Blink',engine_version:'139.0.0.0',os_name:'Windows',os_version:'10',screen_width:'1920',screen_height:'1080',platform:'PC',support_h265:'1',support_dash:'1',...(uifid?{uifid}: {})});
        const response = await upstream(`https://www.douyin.com/aweme/v1/web/aweme/detail/?${query}`,{headers});
        const text = await response.res.text();
        if (!text.trim() || !text.trim().startsWith('{')) { failure='平台返回验证页面或空响应'; continue; }
        const detail = JSON.parse(text);
        if (detail.status_code === 2483) { failure='平台要求有效登录会话'; break; }
        if (detail.aweme_detail?.video && String(detail.aweme_detail.aweme_id) === id) { item=detail.aweme_detail; break; }
        failure=detail.status_code ? `平台状态码 ${detail.status_code}` : '详情响应中没有该视频';
      } catch(error) { failure=error.message.replace(/[。.]$/, ''); }
    }
  }
  if (!item?.video) throw new Error(`抖音解析失败：${failure || '分享页没有视频数据'}。${cookie ? (failure.includes('403') ? '已尝试公开视频接口与 Cookie 详情接口，平台仍拒绝请求。403 无法判断 Cookie 是否过期，也可能是服务器出口或请求验证限制。' : 'Cookie 详情接口未返回视频，请检查会话或稍后重试。') : '已尝试公开视频接口。可展开“解析设置”，填写自己浏览器中的抖音 Cookie 后重试。'}`);
  if (item.images?.length) throw new Error('这个作品是图集，暂不支持视频下载。');
  const video = item.video;
  const codecOf = value => value.is_h265 === 1 || value.is_bytevc1 === 1 ? 'hevc' : value.is_h265 === 0 || value.is_bytevc1 === 0 ? 'avc' : undefined;
  const candidates = [...(video.bit_rate || [])].map(x=>({addr:x.play_addr,label:x.gear_name||'',height:x.play_addr?.height,bitrate:x.bit_rate,codec:codecOf(x)}));
  const defaultAddr=video.play_addr_h264||video.play_addr_265||video.play_addr;
  candidates.push({addr:defaultAddr,label:'平台提供的视频',height:defaultAddr?.height||video.height,codec:video.play_addr_h264?'avc':video.play_addr_265?'hevc':codecOf(video)});
  try {const hd=await douyinHdCandidate(video);if(hd)candidates.push(hd);}catch{/* Keep working feed formats when the HD probe fails. */}
  const compatibility = candidate => candidate.codec==='avc'?2:candidate.codec==='hevc'?0:1;
  candidates.sort((a,b)=>(b.height||0)-(a.height||0)||compatibility(b)-compatibility(a)||(b.bitrate||0)-(a.bitrate||0));
  const streams = []; const seen = new Set(); const seenResolutions = new Set();
  for (const candidate of candidates) {
    const raw = candidate.addr?.url_list?.find(u=>u.startsWith('https://')) || candidate.addr?.url_list?.[0];
    if (!raw) continue;
    const media = raw.replace(/^http:/,'https:');
    if (seen.has(media) || (candidate.height && seenResolutions.has(candidate.height))) continue;
    seen.add(media); if(candidate.height) seenResolutions.add(candidate.height);
    const suffix = candidate.codec==='hevc'?' · HEVC（需兼容播放器）':candidate.codec==='avc'?' · H.264 兼容版':'';
    const sizeLabel=candidate.size ? ` · ${(candidate.size/1048576).toFixed(1)}MB` : '';
    streams.push({url:media,kind:'combined',height:candidate.height,width:candidate.width,frameHeight:candidate.frameHeight,size:candidate.size,bitrate:candidate.bitrate,codec:candidate.codec,label:(candidate.height ? `${candidate.height}P · 含声音` : candidate.label || '平台提供的视频')+suffix+sizeLabel,extension:'mp4'});
  }
  if (!streams.length) throw new Error('视频详情中没有下载地址，可能是平台限制。');
  streams.sort((a,b)=>compatibility(b)-compatibility(a)||(b.height||0)-(a.height||0));
  const notices=streams.some(s=>s.codec==='hevc')?['优先选择 H.264 兼容版。HEVC 视频在部分浏览器中可能只有声音，可下载后用支持 HEVC 的播放器打开。']:[];
  return { platform: 'douyin', title: item.desc || '抖音视频', author: item.author?.nickname, cover: video.cover?.url_list?.[0], duration: Math.round((video.duration || 0)/1000), source: `https://www.douyin.com/video/${id}`, pages: [], page: 1, streams, notices };
}
const mediaDomains = ['bilivideo.com','bilivideo.cn','akamaized.net','douyinvod.com','byteoversea.com','snssdk.com','amemv.com','zjcdn.com','www.douyin.com','www.iesdouyin.com'];
function mediaUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.port || u.username || u.password || !matches(u.hostname, mediaDomains)) throw new Error('不支持该视频下载域名。');
  if (matches(u.hostname,['douyin.com','iesdouyin.com']) && !/^\/aweme\/v1\/play(?:wm)?\/$/.test(u.pathname)) throw new Error('不支持该视频下载路径。');
  return u;
}
const encoder = new TextEncoder();
async function key(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']); }
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
async function signature(secret, payload) { return hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))); }
const json = (body, status=200) => Response.json(body, { status, headers: { 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === '/api/parse' && request.method === 'POST') {
        if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({error:'不允许跨站请求。'},403);
        if (Number(request.headers.get('content-length') || 0) > 32768) return json({error:'分享内容或 Cookie 过长。'},413);
        const raw = await request.text(); if (raw.length > 32768) return json({error:'分享内容或 Cookie 过长。'},413);
        const body = JSON.parse(raw); const result = await parseVideo(body.url, body.page || 1, {cookie:body.cookie});
        if(!env.DOWNLOAD_SECRET && result.platform==='bilibili')result.notices.push('本站尚未启用代理下载，B 站直链可能被防盗链拦截，高清音视频合并也无法使用。请配置 DOWNLOAD_SECRET 后重新解析。');
        for (const stream of result.streams) {
          stream.filename=downloadFilename(result,stream);
          stream.fullFilename=downloadFilename(result,stream,{complete:true});
          try {
            mediaUrl(stream.url);
            if (env.DOWNLOAD_SECRET) {
              const exp = String(Math.floor(Date.now()/1000)+1800);
              const platform = result.platform;
              const ext = stream.extension || 'mp4';
              const filename=stream.filename;
              const sig = await signature(env.DOWNLOAD_SECRET, [stream.url,exp,platform,ext,filename].join('\n'));
              stream.download = '/api/download?'+new URLSearchParams({url:stream.url,exp,platform,ext,filename,sig});
            }
          } catch { /* Direct platform link stays available. */ }
        }
        return json(result);
      }
      if (url.pathname === '/api/download' && request.method === 'GET') {
        if (!env.DOWNLOAD_SECRET) return json({error:'站点尚未启用代理下载，请使用视频直链。'},503);
        const raw = url.searchParams.get('url'); const exp = url.searchParams.get('exp'); const platform = url.searchParams.get('platform'); const sig = url.searchParams.get('sig') || '';
        const ext = url.searchParams.get('ext') || 'mp4';
        const filename=url.searchParams.get('filename');
        if(filename && (encoder.encode(filename).length>240 || /[\u0000-\u001f\u007f<>:"/\\|?*]/.test(filename) || !filename.endsWith('.'+ext)))return json({error:'下载文件名无效。'},403);
        if (!['mp4','m4a','flv'].includes(ext) || !/^\d+$/.test(exp || '') || Number(exp) < Date.now()/1000 || Number(exp) > Date.now()/1000 + 1800 || !['bilibili','douyin'].includes(platform) || !/^[a-f0-9]{64}$/.test(sig)) return json({error:'下载链接已失效，请重新解析。'},403);
        const payload=[raw,exp,platform,ext];if(filename)payload.push(filename);
        const valid = await crypto.subtle.verify('HMAC', await key(env.DOWNLOAD_SECRET), Uint8Array.from(sig.match(/../g), x => parseInt(x,16)), encoder.encode(payload.join('\n')));
        if (!valid) return json({error:'下载链接无效。'},403);
        const target = mediaUrl(raw);
        const headers = { Referer: platform === 'bilibili' ? 'https://www.bilibili.com/' : 'https://www.douyin.com/' };
        const range = request.headers.get('range'); if (range && /^bytes=\d+-\d*$/.test(range)) headers.Range = range;
        const {res} = await upstream(target.href, {headers}, mediaDomains);
        const encoded=encodeURIComponent(filename||'vidfetch-video.'+ext).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
        const out = new Headers({ 'Content-Type': res.headers.get('content-type') || (ext==='m4a'?'audio/mp4':'video/mp4'), 'Content-Disposition': 'attachment; filename="vidfetch-video.'+ext+'"; filename*=UTF-8\'\''+encoded, 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
        for (const name of ['content-length','content-range','accept-ranges']) if (res.headers.has(name)) out.set(name,res.headers.get(name));
        return new Response(res.body, {status:res.status,headers:out});
      }
      return json({error:'接口不存在或请求方法不正确。'},404);
    } catch(error) { return json({error:error instanceof SyntaxError ? '请求格式不正确。' : error.message || '解析失败，请重试。'},400); }
  }
};
