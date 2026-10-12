const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('reservation-api.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
let writes = 0, release, rejectWrite, fail = false;
const payload = { name:'홍길동', phone:'01012345678', package:'상담', pageName:'index.html' };
const options = { body:JSON.stringify(payload) };
const context = {
 initializeApp:()=>({}),getApps:()=>[],getApp:()=>({}),getFirestore:()=>({}),collection:()=>({}),serverTimestamp:()=>null,
 addDoc:async()=>{writes++;if(fail)throw Error('permission-denied');await new Promise((r,j)=>{release=r;rejectWrite=j});},
 window:{emailjs:{send:async()=>{throw Error('email unavailable')}}},
 localStorage:{setItem(){throw Error('storage blocked')}},Date,console,
};
vm.createContext(context);
vm.runInContext(source, context);
(async()=>{
 fail=true;await assert.rejects(context.submitReservation('', options), /permission-denied/);
 fail=false;const first=context.submitReservation('',options);
 await assert.rejects(context.submitReservation('',options),/reservation_busy/);
 release();const response=await first;
 assert.equal(response.ok,true);assert.equal((await response.json()).ok,true);
 await assert.rejects(context.submitReservation('',options),/too_many_requests/);
 assert.equal(writes,2); // One failed storage attempt and one successful reservation.
 console.log('First submit succeeds; parallel request blocked; write failure retry allowed; notification/storage errors preserve success.');
})().catch(e=>{console.error(e);process.exitCode=1});
