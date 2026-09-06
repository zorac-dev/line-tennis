export class Room {
  constructor(state, env){ this.state=state; this.env=env; this.sessions=new Map(); this.hostId=null; }
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket') return new Response('Expected websocket',{status:426});
    const pair=new WebSocketPair(); const client=pair[0], server=pair[1];
    const id=crypto.randomUUID().slice(0,8); server.accept();
    this.sessions.set(server,{id,name:`Player-${id.slice(0,3)}`}); if(!this.hostId)this.hostId=id;
    server.send(JSON.stringify({type:'welcome',id,hostId:this.hostId})); this.broadcastRoster();
    server.addEventListener('message',e=>this.onMessage(server,e.data));
    server.addEventListener('close',()=>this.leave(server));
    server.addEventListener('error',()=>this.leave(server));
    return new Response(null,{status:101,webSocket:client});
  }
  onMessage(ws,raw){
    let m; try{m=JSON.parse(raw)}catch{return}
    const s=this.sessions.get(ws); if(!s)return;
    if(m.type==='hello'){ s.name=String(m.name||'Player').slice(0,12); this.broadcastRoster(); }
    if(m.type==='start' && s.id===this.hostId && this.sessions.size>=2 && this.sessions.size<=4){ this.broadcast({type:'start',players:this.playerList()}); }
    if(m.type==='input'){ this.sendToHost({type:'input',id:s.id,input:m.input}); }
    if(m.type==='snapshot' && s.id===this.hostId){ this.broadcast({type:'snapshot',state:m.state},ws); }
  }
  playerList(){ return [...this.sessions.values()].map(x=>({id:x.id,name:x.name})); }
  broadcastRoster(){ this.broadcast({type:'roster',hostId:this.hostId,players:this.playerList()}); }
  broadcast(obj,except=null){ const msg=JSON.stringify(obj); for(const ws of this.sessions.keys()) if(ws!==except) try{ws.send(msg)}catch{} }
  sendToHost(obj){ for(const [ws,s] of this.sessions) if(s.id===this.hostId){try{ws.send(JSON.stringify(obj))}catch{} break} }
  leave(ws){ const leaving=this.sessions.get(ws); this.sessions.delete(ws); if(leaving?.id===this.hostId){ this.hostId=this.sessions.values().next().value?.id||null; this.broadcast({type:'host',hostId:this.hostId}); } this.broadcastRoster(); }
}

export default {
  async fetch(request, env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return cors(new Response(null,{status:204}));
    if(url.pathname.startsWith('/room/')){
      const room=url.pathname.split('/').filter(Boolean)[1];
      const id=env.ROOMS.idFromName(room); return env.ROOMS.get(id).fetch(request);
    }
    return cors(new Response('LINE Tennis worker is running'));
  }
};
function cors(res){ const h=new Headers(res.headers);h.set('Access-Control-Allow-Origin','*');h.set('Access-Control-Allow-Headers','*');h.set('Access-Control-Allow-Methods','GET,OPTIONS');return new Response(res.body,{status:res.status,headers:h}); }
