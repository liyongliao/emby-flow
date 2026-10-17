import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseClipTime,formatClipTime,validateClipRange,readClipRange,createClipReader,exportClip} from '../public/flow-clip.js';
import {clipRange,matchesClipRange} from '../lib/clip-range.mjs';
import {Input,BufferSource,ALL_FORMATS} from '../public/mediabunny/mediabunny.mjs';

test('time selection accepts millisecond precision and rejects invalid bounds',()=>{
 assert.equal(parseClipTime('01:02:03.125'),3723.125);assert.equal(formatClipTime(3723.125),'01:02:03.125');
 for(const value of ['01:60:01','1:3:4:5','-1','NaN',''])assert.throws(()=>parseClipTime(value));
 for(const [start,end] of [[5,5],[8,4],[-1,8],[0,61]])assert.throws(()=>validateClipRange(start,end,60));
});
test('proxy only accepts bounded single-range requests and verifies upstream offsets',()=>{
 assert.deepEqual(clipRange('bytes=12-20'),{start:12,end:20});
 for(const header of [null,'bytes=0-','bytes=-10','bytes=2-1','bytes=0-99999999','bytes=0-1,3-4'])assert.throws(()=>clipRange(header));
 assert.equal(matchesClipRange(new Response('',{status:206,headers:{'Content-Range':'bytes 12-20/100'}}),{start:12,end:20}),true);
 assert.equal(matchesClipRange(new Response('',{status:200}),{start:12,end:20}),false);
});
test('ignored Range and wrong Content-Range are canceled before consuming the full body',async()=>{
 for(const response of [{status:200,range:null},{status:206,range:'bytes 0-3/100'}]){
  let canceled=false;
  const body=new ReadableStream({cancel(){canceled=true}});
  await assert.rejects(readClipRange('test',10,14,{fetchFn:async()=>new Response(body,{status:response.status,headers:response.range?{'Content-Range':response.range}:{}})}),/分段读取/);
  assert.equal(canceled,true);
 }
});
test('truncated and oversized responses cannot produce a successful clip read',async()=>{
 for(const length of [2,8])await assert.rejects(readClipRange('test',10,14,{fetchFn:async()=>new Response(new Uint8Array(length),{status:206,headers:{'Content-Range':'bytes 10-13/100'}})}),/中断|超过/);
});
function fileFetch(data){
 const ranges=[];
 const fetchFn=async(_url,{headers,signal})=>{
  signal?.throwIfAborted();const match=headers.Range.match(/bytes=(\d+)-(\d+)/);assert.ok(match);
  const start=Number(match[1]),end=Number(match[2]);ranges.push([start,end]);
  return new Response(data.subarray(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${data.length}`}});
 };return {fetchFn,ranges};
}
test('overlapping audio/video reads share cached blocks and an initial scan has a budget',async()=>{
 const file=fileFetch(new Uint8Array(1024));const reader=createClipReader('test',{fetchFn:file.fetchFn,blockSize:128});await reader.getSize();
 await Promise.all([reader.read(10,60),reader.read(20,70)]);assert.equal(file.ranges.length,2);
 await assert.rejects(reader.read(0,33*1024**2),/过大/);
});
for(const inputFormat of ['mp4','mkv'])for(const format of ['mp4','mkv'])test(`real ${inputFormat} → ${format} clip retains audio/video and only reads part of the source`,async()=>{
 const data=await readFile(new URL(`fixtures/clip-source.${inputFormat}`,import.meta.url));const file=fileFetch(data);
 const result=await exportClip({url:'test',start:17.3,end:19.8,duration:24,format,fetchFn:file.fetchFn,blockSize:16384});
 assert.ok(result.size>1000);assert.ok(result.readBytes<data.length*.75,`${result.readBytes} / ${data.length}`);
 const output=new Input({formats:ALL_FORMATS,source:new BufferSource(await result.blob.arrayBuffer())});
 assert.equal(await(await output.getPrimaryVideoTrack()).getCodec(),'avc');assert.equal(await(await output.getPrimaryAudioTrack()).getCodec(),'aac');
 const seconds=await output.computeDuration();const expected=format==='mp4'?2.5:19.8-result.actualStart;
 assert.ok(Math.abs(seconds-expected)<.15,`${seconds} vs ${expected}`);output.dispose();
});
test('canceling a file export aborts its writable instead of committing a partial video',async()=>{
 const data=await readFile(new URL('fixtures/clip-source.mp4',import.meta.url));const file=fileFetch(data);const abort=new AbortController();let aborted=false,closed=false;
 const fileHandle={async createWritable(){return {async write(){abort.abort()},async truncate(){},async close(){closed=true},async abort(){aborted=true}}}};
 await assert.rejects(exportClip({url:'test',start:10,end:18,duration:24,fetchFn:file.fetchFn,blockSize:16384,fileHandle,signal:abort.signal}),{name:'AbortError'});
 assert.equal(closed,false);assert.equal(aborted,true);
});
