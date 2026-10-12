import { Input, BufferSource, MP4, Output, BufferTarget, Mp4OutputFormat, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacketSink } from 'mediabunny';

// Copy compressed packets without decoding or changing resolution/bitrate.
export async function remux(videoBytes, audioBytes) {
  const videoInput = new Input({source:new BufferSource(videoBytes),formats:[MP4]});
  const audioInput = new Input({source:new BufferSource(audioBytes),formats:[MP4]});
  let output;
  try {
    const video = await videoInput.getPrimaryVideoTrack();
    const audio = await audioInput.getPrimaryAudioTrack();
    if(!video || !audio) throw new Error('文件缺少画面或音频，请重新解析。');
    const videoConfig = await video.getDecoderConfig();
    const audioConfig = await audio.getDecoderConfig();
    if(!videoConfig || !audioConfig) throw new Error('该视频编码暂不支持本地合并。');
    const target = new BufferTarget();
    output = new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
    const videoSource = new EncodedVideoPacketSource(await video.getCodec());
    const audioSource = new EncodedAudioPacketSource(await audio.getCodec());
    output.addVideoTrack(videoSource,{rotation:video.rotation});
    output.addAudioTrack(audioSource);
    await output.start();
    const copy = async (track,source,config) => {
      let count=0;
      for await(const packet of new EncodedPacketSink(track).packets()) {
        await source.add(packet,count===0?{decoderConfig:config}:undefined);
        count++;
      }
      source.close();
      if(!count) throw new Error('媒体文件中没有有效数据。');
    };
    await Promise.all([copy(video,videoSource,videoConfig),copy(audio,audioSource,audioConfig)]);
    await output.finalize();
    return target.buffer;
  } catch(error) { if(output) await output.cancel().catch(()=>{}); throw error; }
  finally {videoInput.dispose();audioInput.dispose();}
}

const MAX_BYTES = 256 * 1024 * 1024;
export async function mergeDownloads(videoUrl,audioUrl,onStatus=()=>{}) {
  let used=0;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),300000);
  const read = async (url,stage) => {
    const response = await fetch(url,{signal:controller.signal});
    if(!response.ok) throw new Error('下载失败或链接已过期，请重新解析。');
    const total=Number(response.headers.get('content-length'))||undefined;
    if(Number(response.headers.get('content-length')||0)+used>MAX_BYTES) {await response.body?.cancel();throw new Error('高清文件较大，请分别下载画面与音频后合并（本地合并上限 256MB）。');}
    const reader=response.body.getReader();const chunks=[];let size=0;
    try{
      while(true){const {done,value}=await reader.read();if(done)break;used+=value.length;size+=value.length;if(used>MAX_BYTES)throw new Error('文件超过本地合并上限 256MB，请使用单独下载。');chunks.push(value);onStatus((stage==='video'?'正在下载画面… ':'正在下载声音… ')+(size/1024/1024).toFixed(1)+' MB',{stage,loaded:size,total});}
    }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
  };
  try{
    const video=await read(videoUrl,'video');const audio=await read(audioUrl,'audio');
    onStatus('正在本地合并为带声音的 MP4…',{stage:'merge'});
    return new Blob([await remux(video,audio)],{type:'video/mp4'});
  }finally{controller.abort();clearTimeout(timer);}
}
