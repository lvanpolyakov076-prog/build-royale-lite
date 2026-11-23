'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const rooms=new Map();
const maps={
 harbor:{label:'Портовый район',max:8,bound:113,spawns:[[0,6],[14,11],[-17,11],[20,-16],[-14,-24],[32,5],[-30,10],[15,27]]},
 duel:{label:'Дуэльная арена',max:2,bound:24,spawns:[[0,17],[0,-17]]},
 box:{label:'Box PvP',max:5,bound:14,spawns:[[-10,9],[10,-9],[-10,-9],[10,9],[0,10]]}
};
const weapons={rifle:[22,140,110,1],pump:[13,36,800,8],smg:[14,75,65,1],marks:[38,170,280,1],auto:[9,30,280,8]};
const port=Number(process.env.PORT||8080),host=process.env.HOST||'127.0.0.1';
const index=fs.readFileSync(path.join(__dirname,'index.html'));
const send=(res,status,body)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));
const idOf=p=>p.token.slice(0,12);
const text=(value,fallback,max)=>typeof value==='string'&&value.trim()?value.trim().replace(/[\u0000-\u001f]/g,'').slice(0,max):fallback;
const listing=r=>({code:r.code,name:r.name,map:r.map,mapName:maps[r.map].label,players:r.players.size,limit:r.limit});
function seizeHost(room){if(!room.players.has(room.host))room.host=room.players.keys().next().value;}
function alive(room){return [...room.players.values()].filter(p=>p.hp>0);}
function finishIfNeeded(room){
 if(room.phase!=='live')return;
 const survivors=alive(room);
 if(survivors.length>1)return;
 room.phase='result';room.winner=survivors[0]?.name||'Ничья';
 for(const p of room.players.values())p.ready=false;
}
function tick(room,now){
 const elapsed=Math.min(1,Math.max(0,(now-room.lastTick)/1000));room.lastTick=now;
 if(room.phase==='countdown'&&now>=room.starts)room.phase='live';
 if(room.phase==='live'&&room.map==='box'){
  room.zone=Math.max(1.65,13.2-Math.max(0,(now-room.starts)/1000-4)*.36);
  for(const p of alive(room))if(Math.max(Math.abs(p.x),Math.abs(p.z))>room.zone)p.hp=Math.max(0,p.hp-12*elapsed);
 }
 finishIfNeeded(room);
}
function clean(now){
 for(const [code,room] of rooms){
  for(const [token,p] of room.players)if(now-p.last>26000)room.players.delete(token);
  if(!room.players.size){rooms.delete(code);continue;}
  seizeHost(room);tick(room,now);
 }
}
setInterval(()=>clean(Date.now()),500).unref();
function add(room,name,now){
 const token=randomBytes(18).toString('hex');
 const p={token,name,ready:false,last:now,sync:0,shotAt:0,seen:now,x:0,y:0,z:0,yaw:0,pitch:0,crouch:false,
  tool:'gun',weapon:'rifle',hp:100,kills:0,shield:0,rev:0,spawn:[0,0]};
 room.players.set(token,p);seizeHost(room);return p;
}
function start(room,now){
 room.phase=room.map==='box'?'countdown':'live';
 room.starts=now+(room.map==='box'?3000:0);
 room.zone=13.2;room.winner='';room.round++;room.lastTick=now;
 room.pieces.clear();room.harvested.clear();room.shots=[];
 let i=0;
 for(const p of room.players.values()){
  const [x,z]=maps[room.map].spawns[i++];
  Object.assign(p,{spawn:[x,z],x,y:0,z,yaw:Math.atan2(x,z),pitch:0,weapon:'rifle',tool:'gun',crouch:false,
   hp:100,shield:0,kills:0,rev:room.round,seen:now,shotAt:0,healAt:0});
 }
}
function publicPlayer(p){
 const {name,ready,x,y,z,yaw,pitch,crouch,tool,weapon,hp,shield,rev,kills,spawn}=p;
 return {id:idOf(p),name,ready,x,y,z,yaw,pitch,crouch,tool,weapon,hp,shield,rev,kills,spawn};
}
function snapshot(room,p,now,damage=0){
 return {...listing(room),version:++room.version,self:publicPlayer(p),roster:[...room.players.values()].map(publicPlayer),
  host:room.host===p.token,hostId:room.host?.slice(0,12),phase:room.phase,round:room.round,
  countdown:Math.max(0,(room.starts-now)/1000),zone:room.zone,winner:room.winner,damage,
  pieces:[...room.pieces.values()],harvested:[...room.harvested],effects:room.shots.filter(event=>now-event.time<450)};
}
function move(room,p,state,now){
 if(!state||!['x','y','z','yaw','pitch'].every(key=>Number.isFinite(state[key])))return;
 const max=maps[room.map].bound;
 const budget=1.65+Math.min(.55,Math.max(0,(now-p.seen)/1000))*13;
 if(Math.hypot(state.x-p.x,state.z-p.z)>budget||Math.abs(state.x)>max+.01||Math.abs(state.z)>max+.01||state.y<-.1||state.y>75)return;
 for(const key of ['x','y','z','yaw','pitch'])p[key]=state[key];
 p.crouch=Boolean(state.crouch);
 p.weapon=Object.hasOwn(weapons,state.weapon)?state.weapon:'rifle';
 p.tool=['gun','pick','build','item'].includes(state.tool)?state.tool:'item';
 p.seen=now;
}
function updatePieces(room,p,ops){
 if(!Array.isArray(ops))return;
 const bound=maps[room.map].bound;
 for(const op of ops.slice(0,16)){
  if(!op||typeof op.key!=='string')continue;
  const existing=room.pieces.get(op.key);
  if(op.action==='remove'){
   if(existing&&Math.hypot(existing.cx*4+2-p.x,existing.cz*4+2-p.z)<150)room.pieces.delete(op.key);
   continue;
  }
  if(op.action==='harvest'){
   if(room.map==='harbor'&&/^prop[0-9]{1,4}$/.test(op.key)&&room.harvested.size<2000)room.harvested.add(op.key);
   continue;
  }
  const b=op.piece;
  if(!b||!['w','f','s','r'].includes(b.t)||![b.cx,b.cz,b.d,b.ly].every(Number.isInteger))continue;
  const x=b.cx*4+2,z=b.cz*4+2;
  if(b.key!==op.key||b.key!==[b.t,b.cx,b.cz,b.d,b.ly].join()||b.d<0||b.d>3||
      b.ly<0||b.ly>(room.map==='box'?3:18)||Math.max(Math.abs(x),Math.abs(z))>bound+1||
      Math.hypot(x-p.x,z-p.z)>14||Math.abs(4*b.ly-p.y)>9)continue;
  if(existing?existing.owner!==idOf(p):room.pieces.size>=300)continue;
  const tiles=Array.isArray(b.tiles)&&b.tiles.length===9&&b.tiles.every(v=>typeof v==='boolean')&&b.tiles.some(Boolean)?b.tiles:null;
  room.pieces.set(b.key,{key:b.key,t:b.t,cx:b.cx,cz:b.cz,d:b.d,ly:b.ly,tiles,owner:idOf(p)});
 }
}
function hitDistance(origin,d,target){
 const height=target.crouch?1.17:1.8;
 const lo=[target.x-.38,target.y,target.z-.38],hi=[target.x+.38,target.y+height,target.z+.38];
 let near=0,far=170;
 for(let i=0;i<3;i++){
  if(Math.abs(d[i])<1e-7){if(origin[i]<lo[i]||origin[i]>hi[i])return Infinity;continue;}
  const x=(lo[i]-origin[i])/d[i],z=(hi[i]-origin[i])/d[i];
  near=Math.max(near,Math.min(x,z));far=Math.min(far,Math.max(x,z));
  if(near>far)return Infinity;
 }
 return near;
}
let effectId=0;
function shoot(room,p,burst,now){
 if(!Array.isArray(burst)||!burst.length||p.tool!=='gun')return 0;
 const [power,range,delay,pellets]=weapons[p.weapon];
 if(now-p.shotAt<delay)return 0;
 p.shotAt=now;
 let total=0;
 for(const [index,ray] of burst.slice(0,pellets).entries()){
  if(!ray||!Array.isArray(ray.dir)||!Array.isArray(ray.origin)||ray.dir.length!==3||ray.origin.length!==3||
    ![...ray.dir,...ray.origin,ray.range].every(Number.isFinite))continue;
  const o=ray.origin,d=ray.dir;
  if(Math.abs(Math.hypot(...d)-1)>.08||Math.hypot(o[0]-p.x,o[1]-p.y-(p.crouch?1.1:1.65),o[2]-p.z)>1.7)continue;
  let target=null,best=Math.max(0,Math.min(range,ray.range));
  for(const rival of alive(room)){
   if(rival===p)continue;
   const t=hitDistance(o,d,rival);if(t<best){best=t;target=rival;}
  }
  if(index<3){
   room.shots.push({id:++effectId,source:idOf(p),start:o,end:o.map((v,i)=>v+d[i]*best),time:now});
   if(room.shots.length>72)room.shots.shift();
  }
  if(!target)continue;
  const amount=Math.min(target.hp+target.shield,power),blocked=Math.min(target.shield,amount);
  target.shield-=blocked;target.hp-=amount-blocked;total+=amount;
  if(target.hp<=0)p.kills++;
 }
 return total;
}
async function body(req){
 const chunks=[];let count=0;
 for await(const chunk of req){count+=chunk.length;if(count>18000)throw Error('size');chunks.push(chunk);}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('payload');
 return data;
}
const server=http.createServer(async(req,res)=>{
 const now=Date.now();
 if(req.method==='GET'&&req.url==='/healthz'){
  send(res,200,{ok:true});return;
 }
 if(req.method==='GET'&&['/','/index.html'].includes(req.url)){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(index);return;
 }
 if(req.method==='GET'&&req.url==='/api/rooms'){
  clean(now);
  send(res,200,[...rooms.values()].filter(r=>r.phase==='lobby'&&r.players.size<r.limit).map(listing));return;
 }
 if(req.method!=='POST'||!['/api/create','/api/join','/api/sync','/api/ready','/api/start','/api/leave'].includes(req.url)){
  send(res,404,{error:'Страница не найдена'});return;
 }
 if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'Ожидается JSON'});return;}
 try{
  const data=await body(req);
  if(req.url==='/api/create'){
   clean(now);
   if(rooms.size>=100){send(res,429,{error:'Сервер занят'});return;}
   const map=data.map;if(!Object.hasOwn(maps,map)){send(res,400,{error:'Неизвестная карта'});return;}
   const limit=Number(data.limit);
   if(!Number.isInteger(limit)||limit<2||limit>maps[map].max){send(res,400,{error:'Неверное число игроков'});return;}
   let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
   const room={code,map,limit,name:text(data.name,'Лобби',38),players:new Map(),pieces:new Map(),harvested:new Set(),
    shots:[],version:0,host:null,phase:'lobby',starts:0,round:0,lastTick:now,zone:13.2,winner:''};
   rooms.set(code,room);
   const p=add(room,text(data.player,'Игрок 1',22),now);
   send(res,200,{...snapshot(room,p,now),token:p.token});return;
  }
  const room=rooms.get(String(data.code).toUpperCase());
  if(!room){send(res,404,{error:'Лобби не найдено'});return;}
  if(req.url==='/api/join'){
   if(room.phase!=='lobby'||room.players.size>=room.limit){send(res,409,{error:'Лобби заполнено или матч уже начался'});return;}
   const p=add(room,text(data.player,'Игрок '+(room.players.size+1),22),now);
   send(res,200,{...snapshot(room,p,now),token:p.token});return;
  }
  const p=room.players.get(data.token);
  if(!p){send(res,404,{error:'Вход в лобби истёк'});return;}
  p.last=now;tick(room,now);
  if(req.url==='/api/leave'){room.players.delete(p.token);seizeHost(room);finishIfNeeded(room);if(!room.players.size)rooms.delete(room.code);send(res,200,{});return;}
  if(req.url==='/api/ready'){
   if(!['lobby','result'].includes(room.phase)){send(res,409,{error:'Матч уже начался'});return;}
   p.ready=Boolean(data.ready);
  }
  if(req.url==='/api/start'){
   if(room.host!==p.token||!['lobby','result'].includes(room.phase)||room.players.size<2||[...room.players.values()].some(player=>!player.ready)){
    send(res,409,{error:'Старт доступен организатору, когда готовы все участники'});return;
   }
   start(room,now);
  }
  let damage=0;
  if(req.url==='/api/sync'){
   if(now-p.sync<28){send(res,429,{error:'Слишком частые обновления'});return;}
   p.sync=now;
   if(room.phase==='live'&&p.hp>0&&data.round===room.round){
    move(room,p,data.state,now);
    const consumable=data.heal;
    if(room.map==='harbor'&&['mini','big','med'].includes(consumable)&&now-p.healAt>=1400){
     p.healAt=now;
     if(consumable==='med')p.hp=100;
     else if(consumable==='mini'&&p.shield<50)p.shield=Math.min(50,p.shield+25);
     else if(consumable==='big')p.shield=Math.min(100,p.shield+50);
    }
    updatePieces(room,p,data.ops);damage=shoot(room,p,data.shots,now);
    finishIfNeeded(room);
   }
  }
  send(res,200,snapshot(room,p,now,damage));
 }catch{if(!res.headersSent)send(res,400,{error:'Некорректный запрос'});}
});
server.listen(port,host,()=>console.log('Build Royale Lite: http://'+host+':'+port));



