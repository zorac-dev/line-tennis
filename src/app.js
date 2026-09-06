const $ = (s) => document.querySelector(s);
const lobby = $('#lobby'), game = $('#game'), canvas = $('#court'), ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
let roomId = params.get('room');
let socket, myId, hostId, isHost = false, started = false;
let roster = [];
let input = {x:0,y:0,stroke:false,volley:false,serve:false};
let serveStartedAt = 0;
let authoritativeState = null;

const server = window.TENNIS_SERVER_URL;
const nameInput = $('#nameInput');
nameInput.value = localStorage.getItem('tennisName') || `Player${Math.floor(Math.random()*90+10)}`;

function wsUrl(){ return server.replace(/^http/,'ws') + `/room/${roomId}`; }
function randomRoom(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function inviteUrl(){ const u = new URL(location.href); u.searchParams.set('room', roomId); return u.toString(); }
function send(type,payload={}){ if(socket?.readyState===1) socket.send(JSON.stringify({type,...payload})); }

$('#createBtn').onclick = () => {
  if(!roomId){ roomId = randomRoom(); history.replaceState(null,'',`?room=${roomId}`); }
  connect();
};
$('#copyBtn').onclick = async()=>{ await navigator.clipboard.writeText(inviteUrl()); $('#copyBtn').textContent='コピーしました'; };
$('#shareBtn').onclick=()=>{
  const text = encodeURIComponent(`テニスしよう！ ${inviteUrl()}`);
  location.href = `https://line.me/R/msg/text/?${text}`;
};
$('#startBtn').onclick=()=>send('start');

function connect(){
  if(socket) return;
  localStorage.setItem('tennisName', nameInput.value.trim()||'Player');
  socket = new WebSocket(wsUrl());
  socket.onopen=()=>send('hello',{name:localStorage.getItem('tennisName')});
  socket.onmessage=(ev)=>{
    const m=JSON.parse(ev.data);
    if(m.type==='welcome'){ myId=m.id; hostId=m.hostId; isHost=myId===hostId; }
    if(m.type==='roster'){ roster=m.players; hostId=m.hostId; isHost=myId===hostId; renderRoster(); }
    if(m.type==='start'){ started=true; roster=m.players; enterGame(); if(isHost) initHostGame(); }
    if(m.type==='input' && isHost){ hostInputs[m.id]=m.input; }
    if(m.type==='snapshot' && !isHost){ authoritativeState=m.state; }
    if(m.type==='host'){ hostId=m.hostId; isHost=myId===hostId; }
  };
  socket.onclose=()=>{ $('#status').textContent='切断されました'; };
  $('#createBtn').hidden=true; $('#copyBtn').hidden=false; $('#roomInfo').textContent=`ルーム: ${roomId}`;
}

function renderRoster(){
  $('#players').innerHTML = roster.map((p,i)=>`<div class="player-row"><span>${i+1}. ${escapeHtml(p.name)}${p.id===hostId?' 👑':''}</span><span>${teamLabel(i, roster.length)}</span></div>`).join('');
  $('#startBtn').hidden = !(isHost && roster.length>=2 && roster.length<=4);
}
function teamLabel(i,n){ if(n===2) return i===0?'手前':'奥'; if(n>=3) return i%2===0?'A':'B'; return ''; }
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

if(roomId){ connect(); }

function enterGame(){ lobby.hidden=true; game.hidden=false; resize(); $('#status').textContent='試合開始'; }
window.addEventListener('resize',resize); function resize(){ canvas.width=innerWidth*devicePixelRatio; canvas.height=innerHeight*devicePixelRatio; }

const stick=$('#stick'), knob=$('#knob'); let stickPointer=null;
function setStick(e){
  const r=stick.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  let dx=e.clientX-cx, dy=e.clientY-cy; const max=r.width*.32, len=Math.hypot(dx,dy)||1;
  if(len>max){dx=dx/len*max;dy=dy/len*max}
  input.x=dx/max; input.y=dy/max; knob.style.transform=`translate(${dx}px,${dy}px)`;
}
stick.onpointerdown=e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);setStick(e)};
stick.onpointermove=e=>{if(e.pointerId===stickPointer)setStick(e)};
function resetStick(e){if(e.pointerId===stickPointer){stickPointer=null;input.x=input.y=0;knob.style.transform=''}}
stick.onpointerup=resetStick;stick.onpointercancel=resetStick;

function bindTap(btn,key){ btn.onpointerdown=e=>{e.preventDefault();input[key]=true; setTimeout(()=>input[key]=false,90)}; }
bindTap($('#volleyBtn'),'volley');
$('#strokeBtn').onpointerdown=e=>{ e.preventDefault(); serveStartedAt=performance.now(); $('#strokeBtn').classList.add('serve-charge'); input.stroke=true; };
$('#strokeBtn').onpointerup=e=>{
  $('#strokeBtn').classList.remove('serve-charge');
  const held=(performance.now()-serveStartedAt)/1000;
  if(hostGame?.serveMode || authoritativeState?.serveMode) input.serve=Math.min(1,held/1.2);
  setTimeout(()=>{input.stroke=false;input.serve=false},120);
};
setInterval(()=>{ if(started) send('input',{input}); },50);

let hostGame=null, hostInputs={};
function initHostGame(){
  const players=[...roster];
  if(players.length===3) players.push({id:'cpu',name:'CPU'});
  const positions = players.length===2 ? [[.5,.80],[.5,.20]] : [[.35,.80],[.35,.20],[.65,.80],[.65,.20]];
  hostGame={players:players.map((p,i)=>({id:p.id,name:p.name,x:positions[i][0],y:positions[i][1],vx:0,vy:0,team:i%2})),ball:{x:.5,y:.68,z:0,vx:0,vy:0,vz:0},score:[0,0],serveMode:true,server:0,lastHit:null,message:'サーブ'};
  authoritativeState=hostGame; requestAnimationFrame(hostLoop);
}
let lastT=0, snapT=0;
function hostLoop(t){ if(!started||!isHost||!hostGame)return; const dt=Math.min(.03,(t-lastT)/1000||.016); lastT=t; updateHost(dt); render(hostGame); if(t-snapT>50){send('snapshot',{state:hostGame});snapT=t} requestAnimationFrame(hostLoop); }
function updateHost(dt){
  const g=hostGame, speed=.42;
  for(const p of g.players){
    let inp = p.id==='cpu' ? cpuInput(p,g) : (hostInputs[p.id] || (p.id===myId?input:{x:0,y:0}));
    p.x=Math.max(.08,Math.min(.92,p.x+(inp.x||0)*speed*dt));
    const minY=p.team===0?.52:.06,maxY=p.team===0?.94:.48; p.y=Math.max(minY,Math.min(maxY,p.y+(inp.y||0)*speed*dt));
    tryHit(p,inp,g);
  }
  if(g.serveMode) return;
  const b=g.ball; b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=1.55*dt;
  if(b.z<=0){ b.z=0; b.vz=Math.abs(b.vz)*.72; if(Math.abs(b.vz)<.08) pointTo(b.y>.5?1:0,g); }
  if(b.x<.03||b.x>.97){pointTo(b.y>.5?1:0,g)}
  if(b.y<-.08||b.y>1.08){pointTo(b.y>.5?1:0,g)}
}
function tryHit(p,inp,g){
  const b=g.ball, d=Math.hypot((b.x-p.x)*1.7,b.y-p.y);
  if(g.serveMode && p.id===g.players[g.server].id && inp.serve){ const toward=p.team===0?-1:1; b.x=p.x;b.y=p.y+(toward*.05);b.z=.12;b.vx=(inp.x||0)*.28;b.vy=toward*(.62+.35*inp.serve);b.vz=.52+.25*inp.serve;g.serveMode=false;g.lastHit=p.id;g.message=''; return; }
  if(d<.11 && b.z<.28 && g.lastHit!==p.id && (inp.stroke||inp.volley)){ const toward=p.team===0?-1:1; const isVolley=!!inp.volley; b.vx=(inp.x||0)*.42; b.vy=toward*(isVolley?.84:.70); b.vz=isVolley?.22:.46; g.lastHit=p.id; }
}
function pointTo(team,g){ g.score[team]++; if(g.score[team]>=5){g.message=`チーム${team===0?'A':'B'} 勝利！`;started=false;send('snapshot',{state:g});return} g.server=(g.server+1)%g.players.length; const p=g.players[g.server]; g.ball={x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0};g.serveMode=true;g.lastHit=null;g.message=`${p.name} のサーブ`; }
function cpuInput(p,g){ const b=g.ball; const targetX=Math.max(.12,Math.min(.88,b.x)); const targetY=p.team===0?Math.max(.60,Math.min(.88,b.y+.08)):Math.max(.12,Math.min(.40,b.y-.08)); return {x:Math.sign(targetX-p.x)*.65,y:Math.sign(targetY-p.y)*.65,stroke:Math.hypot((b.x-p.x)*1.7,b.y-p.y)<.105,volley:false,serve:g.serveMode&&g.players[g.server].id==='cpu'?.75:0}; }

function drawLoop(){ if(started && !isHost && authoritativeState) render(authoritativeState); requestAnimationFrame(drawLoop); } requestAnimationFrame(drawLoop);
function render(g){
  const w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h); const dpr=devicePixelRatio; ctx.save(); ctx.scale(dpr,dpr); const W=w/dpr,H=h/dpr;
  const margin=Math.min(W,H)*.08, cw=W-margin*2, ch=H-margin*1.25; const ox=margin, oy=(H-ch)/2;
  ctx.fillStyle='#2f8b67';ctx.fillRect(0,0,W,H); ctx.fillStyle='#ca8164';ctx.fillRect(ox,oy,cw,ch);
  ctx.strokeStyle='white';ctx.lineWidth=3;ctx.strokeRect(ox,oy,cw,ch); ctx.beginPath();ctx.moveTo(ox,oy+ch/2);ctx.lineTo(ox+cw,oy+ch/2);ctx.stroke();
  ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ox+cw*.18,oy);ctx.lineTo(ox+cw*.18,oy+ch);ctx.moveTo(ox+cw*.82,oy);ctx.lineTo(ox+cw*.82,oy+ch);ctx.moveTo(ox+cw/2,oy+ch*.25);ctx.lineTo(ox+cw/2,oy+ch*.75);ctx.moveTo(ox+cw*.18,oy+ch*.25);ctx.lineTo(ox+cw*.82,oy+ch*.25);ctx.moveTo(ox+cw*.18,oy+ch*.75);ctx.lineTo(ox+cw*.82,oy+ch*.75);ctx.stroke();
  for(const [i,p] of g.players.entries()){ const x=ox+p.x*cw,y=oy+p.y*ch; ctx.fillStyle=i%2===0?'#fff4a8':'#9bd9ff';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17352a';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText(p.name,x,y-20); }
  const b=g.ball; const bx=ox+b.x*cw, by=oy+b.y*ch-b.z*120;ctx.fillStyle='#eaff47';ctx.beginPath();ctx.arc(bx,by,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(ox+b.x*cw,oy+b.y*ch,8,4,0,0,Math.PI*2);ctx.fill();
  ctx.restore(); $('#score').textContent=`${g.score[0]} - ${g.score[1]}`; $('#status').textContent=g.message||'PLAY';
}
