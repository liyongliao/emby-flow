import {MoviPlayer} from './movi/player.js';
export class AdvancedPlayer{
 constructor(container,url,software=false){const canvas=document.createElement('canvas');canvas.style.width='100%';canvas.style.height='100%';container.replaceChildren(canvas);this.player=new MoviPlayer({source:{type:'url',url},canvas,renderer:'canvas',decoder:software?'software':'auto',enablePreviews:false,cache:{type:'lru',maxSizeMB:24}});this.audio=-1;this.subtitle=-1;this.kind='advanced';}
 get currentTime(){return BigInt(Math.round(this.player.getCurrentTime()*1000))}
 getDuration(){return BigInt(Math.round(this.player.getDuration()*1000))}
 getStatus(){return {idle:0,loading:3,ready:4,playing:6,paused:8,seeking:9,buffering:5,ended:7,error:2}[this.player.getState()]??0}
 on(name,fn){const events={firstVideoRendered:'frame',time:'timeUpdate',error:'error'};if(['played','paused','ended'].includes(name)){this.player.on('stateChange',state=>{if(state===({played:'playing',paused:'paused',ended:'ended'}[name]))fn()})}else this.player.on(events[name]||name,fn);return this}
 load(){return this.player.load()}
 play(){return this.player.play()}
 pause(){this.player.pause();return Promise.resolve()}
 resume(){return this.player.play()}
 isSuspended(){return this.player.isAudioBlockedSuspended()}
 seek(ms){return this.player.seek(Number(ms)/1000)}
 setVolume(value){this.player.setMuted(value===0);this.player.setVolume(value)}
 getVolume(){return this.player.getVolume()}
 setPlaybackRate(rate){this.player.setPlaybackRate(rate)}
 resize(){}
 destroy(){this.player.destroy();return Promise.resolve()}
 getStreams(){return this.player.getTracks().map(t=>({id:t.id,mediaType:t.type,index:t.id,metadata:{title:t.label,language:t.language}}))}
 getSelectedAudioStreamId(){return this.audio===-1?this.player.getAudioTracks()[0]?.id??-1:this.audio}
 getSelectedSubtitleStreamId(){return this.subtitle}
 selectAudio(id){this.audio=id;this.player.selectAudioTrack(id);return Promise.resolve()}
 selectSubtitle(id){this.subtitle=id;return this.player.selectSubtitleTrack(id===-1?null:id)}
 setSubtitleEnable(enable){if(!enable)this.selectSubtitle(-1)}
 getStats(){const stats=this.player.getStats(),track=this.player.getVideoTracks()[0];return {width:track?.width||0,height:track?.height||0,videoFrameRenderCount:stats['Frames Rendered']||0,decoder:stats['Video Decoder'],raw:stats}}
 getVideoInfo(){const track=this.player.getVideoTracks()[0];return track?{width:track.width,height:track.height,codec:track.codec,hdr:track.isHDR}:null}
}
