const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
async function verify(file,isServer){
 const s=fs.readFileSync(file,'utf8');
 const start=s.indexOf('let reservationInFlight = false;');
 const end=s.indexOf('\n /* 바텀',start)>0?s.indexOf('\n /* 바텀',start):s.indexOf('\n/* 바텀',start);
 let fragment=s.slice(start,end);
 if(end<0){const last=s.indexOf('const overlay',start);fragment=s.slice(start,last).replace(/\/\*[^]*$/,'');}
 const elements={submitBtn:{dataset:{},addEventListener:(type,fn)=>{handler=fn}},userName:{value:'홍길동',focus(){}},userPhone:{value:'01012345678',focus(){}},agree:{checked:true}};
 let handler,resolve,calls=0;const wait=new Promise(r=>resolve=r);
 const context={window:{location:{pathname:'/vaccination.html',search:''},showAlert(){}},document:{getElementById:id=>elements[id]||null,body:{getAttribute:()=> '예방접종'},querySelectorAll:()=>[]},localStorage:{getItem(){throw Error('storage blocked')},setItem(){throw Error('storage blocked')}},sessionStorage:{getItem:()=>null},URLSearchParams,navigator:{userAgent:'test'},Date,console,setTimeout,alert(){},escapeHTML:v=>v,setButtonLoading(){},serverTimestamp:()=>null,db:{},collection(){},sendEmailNotification(){},gtag(){throw Error('analytics failed')},fetch:async()=>{calls++;await wait;return {ok:true,json:async()=>({ok:true})}},addDoc:async()=>{calls++;await wait}};
 vm.createContext(context);vm.runInContext(fragment+'\nbindReservationEvent();',context);
 const first=handler({preventDefault(){}});await handler({preventDefault(){}});assert.equal(calls,1);resolve();await first;
 assert.equal(elements.userName.value,'');elements.userName.value='홍길동';elements.userPhone.value='01012345678';await handler({preventDefault(){}});assert.equal(calls,1);
 console.log(file+': simultaneous clicks, blocked storage, analytics failure and success cooldown passed');
}
(async()=>{for (const file of (process.argv.slice(2).length ? process.argv.slice(2) : ['script.js'])) await verify(file)})().catch(e=>{console.error(e);process.exitCode=1});
