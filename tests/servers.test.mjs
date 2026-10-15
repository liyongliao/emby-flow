import test from 'node:test';
import assert from 'node:assert/strict';
import {serverCandidates,detectServer} from '../public/flow-servers.js';
const info={ServerName:'  我的影院  ',Id:'server-id',Version:'4.9.0'};
test('bare domains, IP ports and protocol-relative addresses prefer HTTPS',()=>{
 assert.deepEqual(serverCandidates(' media.example.com '),['https://media.example.com','http://media.example.com']);
 assert.deepEqual(serverCandidates('1.2.3.4:8096'),['https://1.2.3.4:8096','http://1.2.3.4:8096']);
 assert.deepEqual(serverCandidates('//media.example.com'),['https://media.example.com','http://media.example.com']);
});
test('preserves explicit protocol and reverse proxy prefix, accepts Emby web URLs',()=>{
 assert.deepEqual(serverCandidates('http://media.example.com:8096/prefix/emby/web/index.html#!/home'),['http://media.example.com:8096/prefix']);
 assert.deepEqual(serverCandidates('https://media.example.com/emby/'),['https://media.example.com']);
 assert.deepEqual(serverCandidates('media.example.com/base/web/index.html'),['https://media.example.com/base','http://media.example.com/base']);
});
test('invalid schemes, embedded credentials and whitespace fail before probing',()=>{
 for(const input of ['','ftp://media.example.com','javascript:alert(1)','https://user:secret@media.example.com','not a domain'])assert.throws(()=>serverCandidates(input));
});
test('uses actual server name and does not probe HTTP after successful HTTPS',async()=>{
 const calls=[];const result=await detectServer('media.example.com',async server=>{calls.push(server);return info});
 assert.deepEqual(calls,['https://media.example.com']);assert.deepEqual(result,{server:'https://media.example.com',name:'我的影院'});
});
test('HTTP-only server fallback probes public info without credentials',async()=>{
 const calls=[];const result=await detectServer('1.2.3.4:8096',async(...args)=>{calls.push(args);if(args[0].startsWith('https:'))throw Error('TLS unavailable');return info});
 assert.equal(result.server,'http://1.2.3.4:8096');assert.deepEqual(calls,[['https://1.2.3.4:8096'],['http://1.2.3.4:8096']]);
});
test('explicit HTTPS is never downgraded and arbitrary website JSON is rejected',async()=>{
 let calls=0;await assert.rejects(detectServer('https://media.example.com',async()=>{calls++;throw Error('unavailable')}),/无法识别/);assert.equal(calls,1);
 await assert.rejects(detectServer('https://media.example.com',async()=>({title:'other website'})),/有效的 Emby/);
});
