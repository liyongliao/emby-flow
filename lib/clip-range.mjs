// Clip exports must never fall back to a full-body upstream response.
export function clipRange(header){
 const match=String(header||'').match(/^bytes=(\d+)-(\d+)$/);
 if(!match)throw Error('片段导出需要明确的字节范围。');
 const start=Number(match[1]),end=Number(match[2]);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start||end-start+1>4*1024**2)throw Error('片段读取范围无效或过大。');
 return {start,end};
}
export function matchesClipRange(response,range){
 const match=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
 return response.status===206&&!!match&&Number(match[1])===range.start&&Number(match[2])===range.end&&Number(match[3])>range.end;
}
