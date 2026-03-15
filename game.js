// ══════════════════════════════════════════════
//  WORLD CONQUEST — game.js  v1.5.0 (Aşama 5)
// ══════════════════════════════════════════════

const SERVER_URL = 'https://world-conquest-production.up.railway.app';

const PLAYER_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316'];
const BOT_NAMES     = ['Ahmet','Boris','César','Dimitri','Elena','Fatima','Genghis','Hannibal'];
const REL           = { NEUTRAL:'neutral', ALLIED:'allied', WAR:'war' };

// ─── STATE ────────────────────────────────────
const G = {
  players:          [],
  countries:        {},
  countryBounds:    {},
  neighbors:        {},
  relations:        {},
  pendingAlliances: [],
  eliminated:       new Set(), // elenen oyuncu id'leri
  phase:            'menu',    // menu | selection | playing
  selectionOrder:   [],        // sırayla kim seçiyor
  selectionIdx:     0,
  turn:             1,
  turnDuration:     60,
  winPct:           70,
  timer:            60,
  timerInterval:    null,
  map:              null,
  geoLayer:         null,
  selected:         null,
  botPool:          [...BOT_NAMES],
  socket:           null,
  myId:             0,
  roomCode:         null,
  isMultiplayer:    false,
  myTurn:           true,
  _sidebarOwnerId:  null,
};

// ─── AUDIO ────────────────────────────────────
let _audioCtx = null;
function audioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function playTone(freq, type, dur, vol=0.15, delay=0) {
  try {
    const ctx=audioCtx(), o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol, ctx.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+delay+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime+delay); o.stop(ctx.currentTime+delay+dur);
  } catch(e) {}
}
const SFX = {
  attack()    { playTone(180,'sawtooth',0.12,0.2); playTone(130,'sawtooth',0.15,0.15,0.05); },
  victory()   { [523,659,784,1047].forEach((f,i)=>playTone(f,'sine',0.3,0.2,i*0.1)); },
  defeat()    { [300,250,200,150].forEach((f,i)=>playTone(f,'sawtooth',0.2,0.15,i*0.1)); },
  war()       { playTone(80,'square',0.4,0.25); playTone(100,'square',0.3,0.2,0.1); },
  diplo()     { playTone(660,'sine',0.15,0.15); playTone(880,'sine',0.12,0.12,0.08); },
  reinforce() { playTone(440,'sine',0.1,0.12); playTone(550,'sine',0.1,0.1,0.06); },
  income()    { playTone(880,'sine',0.06,0.08); playTone(1100,'sine',0.05,0.07,0.05); },
  select()    { playTone(660,'sine',0.2,0.18); playTone(880,'sine',0.15,0.15,0.1); },
  eliminated(){ playTone(200,'sawtooth',0.5,0.3); playTone(150,'sawtooth',0.4,0.25,0.2); playTone(100,'sawtooth',0.3,0.2,0.4); },
};

// ─── CONFETTI ─────────────────────────────────
function launchConfetti() {
  const canvas=document.getElementById('confetti-canvas');
  const ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  const pieces=Array.from({length:160},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height,
    r:Math.random()*6+3, color:['#f0a500','#ef4444','#22c55e','#3b82f6','#8b5cf6','#ec4899'][Math.floor(Math.random()*6)],
    tilt:Math.random()*10-10, tiltAngle:0, tiltSpeed:Math.random()*0.07+0.03,
  }));
  let frame=0;
  const anim=()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p=>{
      p.tiltAngle+=p.tiltSpeed; p.y+=2.5; p.tilt=Math.sin(p.tiltAngle)*12;
      ctx.beginPath(); ctx.lineWidth=p.r; ctx.strokeStyle=p.color;
      ctx.moveTo(p.x+p.tilt+p.r/2,p.y); ctx.lineTo(p.x+p.tilt,p.y+p.tilt+p.r);
      ctx.stroke();
      if(p.y>canvas.height){p.y=-10;p.x=Math.random()*canvas.width;}
    });
    if(++frame<200)requestAnimationFrame(anim);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  };
  requestAnimationFrame(anim);
}

// ─── UTILS ────────────────────────────────────
let _toastTimer;
function toast(msg, dur=2000) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>el.classList.remove('show'),dur);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function playerById(id)  { return G.players.find(p=>p.id===id); }
function playerColor(id) { return playerById(id)?.color||'#888'; }
function playerName(id)  { return playerById(id)?.name||'?'; }

// ─── DIPLOMACY ────────────────────────────────
function getRelation(a,b)     { return G.relations[a]?.[b]||REL.NEUTRAL; }
function setRelation(a,b,rel) {
  if(!G.relations[a])G.relations[a]={};
  if(!G.relations[b])G.relations[b]={};
  G.relations[a][b]=rel; G.relations[b][a]=rel;
}
function isAllied(a,b)  { return getRelation(a,b)===REL.ALLIED; }
function isAtWar(a,b)   { return getRelation(a,b)===REL.WAR; }
function initRelations() {
  G.relations={}; G.pendingAlliances=[];
  G.players.forEach(a=>G.players.forEach(b=>{if(a.id!==b.id)setRelation(a.id,b.id,REL.NEUTRAL);}));
}
function relationLabel(rel) {
  if(rel===REL.ALLIED) return {text:'🤝 Müttefik',cls:'badge-green'};
  if(rel===REL.WAR)    return {text:'⚔️ Savaş',cls:'badge-red'};
  return {text:'— Nötr',cls:''};
}
function diploEvent(msg, color) {
  const log=document.getElementById('diplo-log'); if(!log) return;
  const el=document.createElement('div'); el.className='diplo-entry';
  el.innerHTML='<span style="color:'+(color||'var(--text)')+'">'+msg+'</span>';
  log.appendChild(el);
  setTimeout(()=>el.classList.add('fading'),5500);
  setTimeout(()=>el.remove(),6200);
}

// ─── NEIGHBORS ────────────────────────────────
function buildNeighborMap() {
  const PAD=1.5; G.neighbors={};
  const ids=Object.keys(G.countryBounds);
  ids.forEach(id=>{G.neighbors[id]=new Set();});
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) {
    const a=G.countryBounds[ids[i]], b=G.countryBounds[ids[j]];
    if(a.minLon-PAD<=b.maxLon&&a.maxLon+PAD>=b.minLon&&a.minLat-PAD<=b.maxLat&&a.maxLat+PAD>=b.minLat) {
      G.neighbors[ids[i]].add(ids[j]); G.neighbors[ids[j]].add(ids[i]);
    }
  }
}
function getMyNeighborEnemies(pid) {
  const r=new Set();
  (playerById(pid)?.countries||[]).forEach(cid=>{
    (G.neighbors[cid]||new Set()).forEach(nid=>{
      if(G.countries[nid]?.owner!==pid) r.add(nid);
    });
  });
  return r;
}

// ─── MENU ─────────────────────────────────────
function showMenu() {
  clearInterval(G.timerInterval);
  if(G.socket){G.socket.disconnect();G.socket=null;}
  G.isMultiplayer=false; G.phase='menu';
  document.getElementById('win-overlay').classList.remove('show');
  showScreen('menu');
}
function showOnlineScreen() {
  document.getElementById('connecting').classList.remove('show');
  showScreen('online-screen');
}

// ─── SOLO LOBBY ───────────────────────────────
function showLobby() {
  G.players=[{id:0,name:'Sen',color:PLAYER_COLORS[0],countries:[],gold:1000,army:50,isBot:false}];
  G.botPool=[...BOT_NAMES]; G.isMultiplayer=false;
  document.getElementById('bot-panel').style.display='block';
  document.getElementById('mp-info-panel').style.display='none';
  document.getElementById('room-code-wrap').style.display='none';
  document.getElementById('lobby-title').textContent='🤖 Bot ile Oyna';
  renderLobby(); showScreen('lobby');
}
function renderLobby() {
  document.getElementById('player-count').textContent=G.players.length;
  const list=document.getElementById('player-list'); list.innerHTML='';
  for(let i=0;i<8;i++){
    const p=G.players[i]; const div=document.createElement('div');
    div.className='player-slot'+(p?'':' empty');
    div.innerHTML=p
      ?'<div class="player-dot" style="background:'+p.color+'"></div><div class="player-name">'+p.name+'</div>'+(p.isBot?'<span class="badge badge-gold">BOT</span>':'')+'<span class="badge badge-green">Hazır</span>'
      :'<div class="player-dot" style="background:var(--border)"></div><div class="player-name" style="color:var(--muted)">Bekleniyor...</div>';
    list.appendChild(div);
  }
}
function addBot() {
  if(G.players.length>=8) return toast('Maksimum 8 oyuncu!');
  const name=G.botPool.shift()||'Bot-'+G.players.length;
  G.players.push({id:G.players.length,name,color:PLAYER_COLORS[G.players.length%PLAYER_COLORS.length],countries:[],gold:1000,army:50,isBot:true});
  renderLobby();
}
function removeBot() {
  const idx=G.players.findIndex((p,i)=>i>0&&p.isBot); if(idx<0) return toast('Bot yok!');
  const p=G.players.splice(idx,1)[0]; G.botPool.unshift(p.name);
  G.players.forEach((pl,i)=>pl.id=i); renderLobby();
}
function startGame() {
  if(G.players.length<2) return toast('En az 2 oyuncu!');
  G.turnDuration=parseInt(document.getElementById('turn-time').value);
  G.winPct=parseInt(document.getElementById('win-cond').value);
  const gold=parseInt(document.getElementById('start-gold').value);
  G.players.forEach(p=>{p.gold=gold;p.army=50;p.countries=[];});
  G.myId=0;
  showScreen('game');
  setTimeout(initMap, 50);
}

// ─── MULTIPLAYER LOBBY ────────────────────────
function mpCreateRoom() {
  const name=document.getElementById('online-name').value.trim()||'Oyuncu';
  const settings={
    turnDuration:parseInt(document.getElementById('mp-turn-time').value),
    winPct:parseInt(document.getElementById('mp-win-cond').value),
    startGold:parseInt(document.getElementById('mp-start-gold').value),
  };
  showConnecting('Sunucuya bağlanılıyor...');
  G.socket=io(SERVER_URL,{transports:['websocket','polling']});
  setupSocketEvents();
  G.socket.on('connect',()=>{
    document.getElementById('connecting-msg').textContent='Oda oluşturuluyor...';
    G.socket.emit('room:create',{name,color:PLAYER_COLORS[0],settings});
  });
  G.socket.on('connect_error',()=>{hideConnecting();toast('Sunucuya bağlanılamadı!',3000);});
}
function mpJoinRoom() {
  const name=document.getElementById('online-name').value.trim()||'Oyuncu';
  const code=document.getElementById('join-code-input').value.trim().toUpperCase();
  if(!code||code.length<4) return toast('Geçerli bir oda kodu gir!');
  showConnecting('Odaya katılınıyor...');
  G.socket=io(SERVER_URL,{transports:['websocket','polling']});
  setupSocketEvents();
  G.socket.on('connect',()=>G.socket.emit('room:join',{code,name,color:PLAYER_COLORS[Math.floor(Math.random()*PLAYER_COLORS.length)]}));
  G.socket.on('connect_error',()=>{hideConnecting();toast('Sunucuya bağlanılamadı!',3000);});
}
function showConnecting(msg) {
  document.querySelectorAll('.online-card > *:not(#connecting)').forEach(el=>el.style.display='none');
  document.getElementById('connecting').classList.add('show');
  document.getElementById('connecting-msg').textContent=msg;
}
function hideConnecting() {
  document.querySelectorAll('.online-card > *').forEach(el=>el.style.display='');
  document.getElementById('connecting').classList.remove('show');
}
function setupSocketEvents() {
  G.socket.on('room:joined',({roomCode,players,settings})=>{
    G.roomCode=roomCode; G.isMultiplayer=true; G.players=players;
    if(settings){G.turnDuration=settings.turnDuration;G.winPct=settings.winPct;}
    document.getElementById('room-code').textContent=roomCode;
    document.getElementById('room-code-wrap').style.display='flex';
    document.getElementById('lobby-title').textContent='🌐 Online Oda';
    document.getElementById('bot-panel').style.display='none';
    document.getElementById('mp-info-panel').style.display='block';
    document.getElementById('mp-settings-display').innerHTML='Tur: '+G.turnDuration+'sn | Kazanma: %'+G.winPct;
    renderLobby(); showScreen('lobby');
    toast('Odaya katıldın! Kod: '+roomCode,2500);
  });
  G.socket.on('room:updated',({players})=>{G.players=players;renderLobby();});
  G.socket.on('room:error',({msg})=>{hideConnecting();toast(msg,3000);});
  G.socket.on('game:start',({players,countries,countryBounds,neighbors,myPlayerId})=>{
    G.players=players;G.countries=countries;G.countryBounds=countryBounds;
    G.neighbors={};
    Object.keys(neighbors).forEach(id=>{G.neighbors[id]=new Set(neighbors[id]);});
    G.myId=myPlayerId; initRelations(); G.eliminated=new Set();
    showScreen('game');
    // Map must be created before selection:start arrives — give it time
    setTimeout(()=>initMapMultiplayer(), 50);
  });
  G.socket.on('game:state',(state)=>{
    if(state.countries) G.countries=state.countries;
    if(state.players)   G.players=state.players;
    if(state.relations) G.relations=state.relations;
    if(state.eliminated)G.eliminated=new Set(state.eliminated);
    refreshLayer(G.selected); updateHUD();
  });
  G.socket.on('player:eliminated',({playerId,playerName})=>{
    G.eliminated.add(playerId);
    showEliminatedBanner(playerName, playerId===G.myId);
    diploEvent('💀 '+playerName+' elendi!','#ef4444');
    refreshLayer(null); updateHUD();
  });
  G.socket.on('turn:start',({turn,currentPlayerId})=>{
    G.turn=turn; G.myTurn=(currentPlayerId===G.myId);
    document.getElementById('turn-num').textContent=turn;
    const ind=document.getElementById('turn-indicator');
    if(G.myTurn){ind.textContent='⚡ Senin Turun';ind.classList.remove('waiting');}
    else{ind.textContent='⏳ Bekle...';ind.classList.add('waiting');}
    startTimer(); if(G.myTurn) toast('Senin turun!',1500);
  });
  // Selection phase — wait for map to be ready before starting
  G.socket.on('selection:start',({order})=>{
    G.selectionOrder=order; G.selectionIdx=0;
    const waitForMap=()=>{
      if(G.map&&G.geoLayer&&G._mapReady){ startSelectionPhase(); }
      else { setTimeout(waitForMap,100); }
    };
    waitForMap();
  });
  G.socket.on('selection:pick',({playerId,countryId})=>{
    applySelection(playerId,countryId);
    G.selectionIdx++;
    updateSelectionUI();
  });
  G.socket.on('diplo:request',({type,fromId,fromName,fromColor,amount})=>{
    if(type==='alliance') showAllianceRequest(fromId,fromName,fromColor);
    if(type==='peace')    showPeaceRequest(fromId,fromName,fromColor);
    if(type==='gold'){
      diploEvent('💰 '+fromName+' sana '+amount+' altın gönderdi!',fromColor);
      const me=playerById(G.myId); if(me){me.gold+=amount;updateHUD();}
    }
  });
  G.socket.on('diplo:response',({type,fromId,accepted})=>{
    const n=playerName(fromId),c=playerColor(fromId);
    if(type==='alliance'){
      if(accepted){setRelation(G.myId,fromId,REL.ALLIED);diploEvent('🤝 '+n+' ittifakı kabul etti!',c);refreshLayer(null);}
      else diploEvent('❌ '+n+' ittifakı reddetti.',c);
    }
    if(type==='peace'){
      if(accepted){setRelation(G.myId,fromId,REL.NEUTRAL);diploEvent('☮️ '+n+' barışı kabul etti!',c);refreshLayer(null);}
      else diploEvent('❌ '+n+' barışı reddetti.',c);
    }
    SFX.diplo();
  });
  G.socket.on('diplo:war',({fromId,fromName,fromColor,targetId})=>{
    setRelation(fromId,targetId,REL.WAR); refreshLayer(null);
    if(targetId===G.myId){diploEvent('🚨 '+fromName+' sana SAVAŞ İLAN ETTİ!','#ef4444');shakeScreen();SFX.war();}
    else diploEvent('📢 '+fromName+' savaş ilan etti!',fromColor);
  });
  G.socket.on('player:action',(action)=>{
    const n=playerName(action.playerId);
    if(action.type==='attack'&&action.success) toast('⚔️ '+n+' bir ülke fethetti!',2000);
  });
  G.socket.on('game:over',({winnerId,winnerName})=>{
    clearInterval(G.timerInterval); const won=winnerId===G.myId;
    showWin(won?'🏆':'😞',won?'KAZANDIN!':winnerName+' Kazandı','');
    if(won){SFX.victory();launchConfetti();}else SFX.defeat();
  });
  G.socket.on('disconnect',()=>toast('Bağlantı kesildi!',4000));
}
function startMultiplayerGame() {
  if(!G.socket||!G.roomCode) return toast('Önce odaya katıl!');
  G.socket.emit('game:start',{roomCode:G.roomCode});
}

// ─── MAP INIT ─────────────────────────────────
function initMap() {
  resetMapState();
  const map=createMap(); G.map=map;
  COUNTRIES_GEO.features.forEach(f=>{
    const id=f.properties.ISO_A3; if(!id) return;
    G.countries[id]={id,name:f.properties.ADMIN||id,owner:null,army:Math.floor(Math.random()*15)+5,income:f.properties.income||20};
    const coords=f.geometry.coordinates[0],lons=coords.map(c=>c[0]),lats=coords.map(c=>c[1]);
    G.countryBounds[id]={minLon:Math.min(...lons),maxLon:Math.max(...lons),minLat:Math.min(...lats),maxLat:Math.max(...lats)};
  });
  buildNeighborMap(); initRelations(); G.eliminated=new Set();
  renderMapLayer();
  // Start selection phase
  G.selectionOrder=[...G.players.map(p=>p.id)];
  G.selectionIdx=0;
  startSelectionPhase();
}
function initMapMultiplayer() {
  resetMapState();
  G.map=createMap();
  renderMapLayer();
  initHUD();
  // Signal that map is ready — selection:start handler will pick this up
  G._mapReady=true;
}
function resetMapState() {
  G.countries={}; G.countryBounds={}; G.turn=1; G.selected=null; G.phase='selection';
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('turn-num').textContent='1';
  if(G.map){G.map.remove();G.map=null;}
}
function createMap() {
  const map=L.map('map',{center:[20,10],zoom:2,minZoom:2,maxZoom:6,zoomControl:true,attributionControl:false,maxBounds:[[-90,-200],[90,200]]});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19}).addTo(map);
  return map;
}

// ─── SELECTION PHASE ──────────────────────────
function startSelectionPhase() {
  G.phase='selection';
  showSelectionOverlay();
  renderMapLayer();
  updateSelectionUI();
  // Bots auto-select immediately with small delay
  tryBotSelect();
}

function showSelectionOverlay() {
  const overlay=document.getElementById('selection-overlay');
  if(overlay) overlay.classList.add('show');
}
function hideSelectionOverlay() {
  const overlay=document.getElementById('selection-overlay');
  if(overlay) overlay.classList.remove('show');
}

function updateSelectionUI() {
  if(G.selectionIdx>=G.selectionOrder.length){
    // All selected — start game
    hideSelectionOverlay();
    G.phase='playing';
    initHUD(); startTimer();
    toast('Savaş başlıyor!',2000);
    return;
  }
  const currentId=G.selectionOrder[G.selectionIdx];
  const current=playerById(currentId);
  const isMe=currentId===G.myId;
  const el=document.getElementById('selection-info');
  if(el){
    el.innerHTML='<span style="color:'+current.color+'">'+current.name+'</span>'+(isMe?' — Bir ülke seç!':' seçiyor...');
  }
  if(!isMe) tryBotSelect();
}

function tryBotSelect() {
  if(G.selectionIdx>=G.selectionOrder.length) return;
  const currentId=G.selectionOrder[G.selectionIdx];
  const current=playerById(currentId);
  if(!current||!current.isBot) return;
  // Bot picks random neutral country
  setTimeout(()=>{
    if(G.phase!=='selection') return;
    const neutrals=Object.values(G.countries).filter(c=>c.owner===null);
    if(neutrals.length===0) return;
    const pick=neutrals[Math.floor(Math.random()*neutrals.length)];
    applySelection(currentId,pick.id);
    G.selectionIdx++;
    refreshLayer(null);
    updateSelectionUI();
  },800);
}

function applySelection(playerId, countryId) {
  const c=G.countries[countryId]; if(!c) return;
  const p=playerById(playerId); if(!p) return;
  c.owner=playerId; c.army=30;
  p.countries=[countryId];
  // Update map immediately
  if(G.geoLayer){
    G.geoLayer.eachLayer(l=>{if(l.cid===countryId) l.setStyle(getStyle(countryId));});
  }
  SFX.select();
  diploEvent('🗺️ '+p.name+' → '+c.name+' seçti',p.color);
}

function selectCountryInPhase(id) {
  if(G.phase!=='selection') return false;
  const currentId=G.selectionOrder[G.selectionIdx];
  if(currentId!==G.myId) return false; // not my turn to select
  const c=G.countries[id];
  if(!c||c.owner!==null){ toast('Bu ülke zaten alınmış!'); return false; }
  applySelection(G.myId, id);
  G.selectionIdx++;
  refreshLayer(null);
  if(G.isMultiplayer&&G.socket){
    G.socket.emit('selection:pick',{countryId:id});
  }
  updateSelectionUI();
  return true;
}

// ─── MAP LAYER ────────────────────────────────
function renderMapLayer() {
  if(G.geoLayer){G.geoLayer.remove();G.geoLayer=null;}
  G.geoLayer=L.geoJSON(COUNTRIES_GEO,{
    style:f=>getStyle(f.properties.ISO_A3),
    onEachFeature:(f,layer)=>{
      const id=f.properties.ISO_A3; if(!id||!G.countries[id]) return;
      layer.cid=id;
      layer.on('click',()=>{
        if(G.phase==='selection'){
          selectCountryInPhase(id);
        } else {
          clickCountry(id);
        }
      });
      // FIX: tooltip açık kalma ve null hatası — closeTooltip kullan
      layer.on('mouseover',function(){
        const c=G.countries[id]; if(!c) return;
        const o=c.owner!==null?playerById(c.owner):null;
        const isMine=c.owner===G.myId;
        const reachable=G.neighbors[id]?[...G.neighbors[id]].some(n=>G.countries[n]?.owner===G.myId):false;
        const rel=o&&!isMine?getRelation(G.myId,c.owner):null;
        let tip='<b>'+c.name+'</b><br>';
        tip+='Sahip: <span style="color:'+(o?o.color:'#888')+'">'+(o?o.name:'Bağımsız')+'</span><br>';
        tip+='⚔️ '+c.army+' &nbsp; 💰 +'+c.income+'/tur';
        if(G.phase==='selection'&&c.owner===null) tip+='<br><span style="color:var(--gold)">Tıkla → Seç</span>';
        if(rel===REL.ALLIED) tip+='<br><span style="color:var(--green)">🤝 Müttefik</span>';
        if(rel===REL.WAR)    tip+='<br><span style="color:var(--red)">⚔️ Savaş Halinde</span>';
        if(G.phase==='playing'&&!isMine&&!reachable) tip+='<br><span style="color:var(--red);font-size:11px;">⛔ Komşun değil</span>';
        // FIX: tooltip'i önce kapat, sonra aç
        try { this.closeTooltip(); } catch(e){}
        this.bindTooltip(tip,{sticky:true,opacity:0.95}).openTooltip();
      });
      layer.on('mouseout',function(){
        // FIX: unbindTooltip yerine closeTooltip + unbind
        try { this.closeTooltip(); this.unbindTooltip(); } catch(e){}
      });
    }
  }).addTo(G.map);
}

function getStyle(id, highlight) {
  const c=G.countries[id]; if(!c) return {};
  const owned=c.owner!==null;
  const player=owned?playerById(c.owner):null;
  const isMine=c.owner===G.myId;
  const eliminated=owned&&G.eliminated.has(c.owner);
  const reachable=G.phase==='playing'&&G.neighbors[id]?[...G.neighbors[id]].some(n=>G.countries[n]?.owner===G.myId):false;
  const dimmed=owned&&!isMine&&G.phase==='playing'&&!reachable;
  const allied=owned&&!isMine&&isAllied(G.myId,c.owner);
  const atWar =owned&&!isMine&&isAtWar(G.myId,c.owner);
  let col=highlight?'#ffffff':(owned?'rgba(0,0,0,0.35)':'#334155');
  if(allied&&!highlight) col='#22c55e';
  if(atWar&&!highlight)  col='#e84040';
  // Seçim fazında boş ülkeler parlak
  const selectionHighlight=G.phase==='selection'&&!owned;
  return {
    fillColor:   owned?(eliminated?'#555':player?.color||'#555'):'#1e293b',
    fillOpacity: owned?(eliminated?0.2:dimmed?0.28:0.78):(selectionHighlight?0.5:0.45),
    color:       col,
    weight:      highlight?2:(allied||atWar?1.5:(selectionHighlight?0.8:0.5)),
  };
}
function refreshLayer(hl) {
  if(!G.geoLayer) return;
  G.geoLayer.eachLayer(l=>{if(l.cid) l.setStyle(getStyle(l.cid,l.cid===hl));});
}

// ─── SIDEBAR ──────────────────────────────────
function clickCountry(id) {
  if(G.phase!=='playing') return;
  const c=G.countries[id]; if(!c) return;
  G.selected=id; refreshLayer(id);
  const owner=c.owner!==null?playerById(c.owner):null;
  const isMyCountry=c.owner===G.myId;
  const isNeutralC=c.owner===null;
  const me=playerById(G.myId);
  const nei=getMyNeighborEnemies(G.myId);
  const canAttack=!isMyCountry&&nei.has(id);
  const myPow=me?.army||0;
  const winChance=Math.round(Math.min(95,Math.max(5,(myPow/(myPow+c.army))*100)));
  const rel=owner&&!isMyCountry?getRelation(G.myId,c.owner):null;
  const rl=rel?relationLabel(rel):null;

  document.getElementById('sb-title').textContent=c.name;
  let h='';
  h+='<div class="info-row"><span class="info-key">Sahip</span><span class="info-val" style="color:'+(owner?owner.color:'var(--muted)')+'">'+(owner?owner.name:'Bağımsız')+'</span></div>';
  h+='<div class="info-row"><span class="info-key">Ordu</span><span class="info-val">⚔️ '+c.army+'</span></div>';
  h+='<div class="info-row"><span class="info-key">Tur Geliri</span><span class="info-val">💰 +'+c.income+'</span></div>';
  if(rl) h+='<div class="info-row"><span class="info-key">İlişki</span><span class="badge '+rl.cls+'">'+rl.text+'</span></div>';
  h+='<div class="divider"></div>';

  if(isMyCountry){
    h+='<button class="action-btn btn-reinforce" onclick="reinforce(\''+id+'\')">⬆ Takviye <span class="cost">50💰 → +10⚔️</span></button>';
  } else if(canAttack){
    const blocked=rel===REL.ALLIED;
    if(blocked){
      h+='<button class="action-btn btn-attack btn-disabled">⚔️ Saldır <span class="cost">Müttefike saldıramazsın</span></button>';
    } else {
      h+='<button class="action-btn btn-attack" onclick="attack(\''+id+'\')">⚔️ '+(isNeutralC?'Ele Geçir':'Saldır')+' <span class="cost">100💰</span></button>';
      h+='<p class="hint">Güç: ~'+myPow+' vs ~'+c.army+' | Şans: <b style="color:'+(winChance>50?'var(--green)':'var(--red)')+'">%'+winChance+'</b></p>';
    }
  } else {
    if(G.eliminated.has(c.owner)){
      h+='<p class="hint">Bu oyuncu elendi.</p>';
    } else {
      h+='<div style="background:rgba(232,64,64,0.07);border:1px solid rgba(232,64,64,0.2);border-radius:7px;padding:10px;margin-bottom:8px;"><p style="font-size:13px;color:var(--red);font-weight:700;">⛔ Komşun Değil</p><p class="hint" style="margin-top:3px;">Sadece komşu ülkelere saldırabilirsin.</p></div>';
    }
  }

  if(owner&&!isMyCountry&&!G.eliminated.has(c.owner)){
    G._sidebarOwnerId=c.owner;
    h+='<div class="divider"></div><div class="diplo-section-title">🌐 Diplomasi</div>';
    const pending=G.pendingAlliances.some(r=>r.fromId===G.myId&&r.toId===c.owner);
    if(rel!==REL.ALLIED){
      if(!pending) h+='<button class="action-btn btn-diplo" onclick="proposeAlliance(G._sidebarOwnerId)">🤝 İttifak Teklif Et <span class="cost">200💰</span></button>';
      else         h+='<button class="action-btn btn-diplo btn-disabled">🤝 Teklif Bekleniyor...</button>';
    }
    if(rel===REL.ALLIED) h+='<button class="action-btn btn-war" onclick="breakAlliance(G._sidebarOwnerId)">💔 İttifakı Boz</button>';
    if(rel===REL.NEUTRAL)h+='<button class="action-btn btn-war" onclick="declareWar(G._sidebarOwnerId)">🚨 Savaş İlan Et</button>';
    if(rel===REL.WAR)    h+='<button class="action-btn btn-peace" onclick="offerPeace(G._sidebarOwnerId)">☮️ Barış Teklif Et <span class="cost">150💰</span></button>';
    h+='<button class="action-btn btn-gold-send" onclick="openGoldTransfer(G._sidebarOwnerId)">💰 Altın Gönder</button>';
  }
  h+='<div class="divider"></div><p class="hint">💡 Yeşil=müttefik sınırı &nbsp; Kırmızı=savaş sınırı</p>';
  document.getElementById('sb-body').innerHTML=h;
  document.getElementById('sidebar').classList.add('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  G.selected=null; refreshLayer(null);
}

// ─── MILITARY ─────────────────────────────────
function reinforce(id){
  const me=playerById(G.myId);
  if(me.gold<50) return toast('Yeterli altın yok! (50💰)');
  if(G.isMultiplayer&&!G.myTurn) return toast('Senin turun değil!');
  me.gold-=50; G.countries[id].army+=10; me.army+=10;
  SFX.reinforce(); updateHUD(); clickCountry(id); toast('+10 ⚔️ takviye!');
  if(G.isMultiplayer&&G.socket) G.socket.emit('player:action',{type:'reinforce',countryId:id});
}

function attack(id){
  const me=playerById(G.myId);
  if(me.gold<100) return toast('Yeterli altın yok! (100💰)');
  if(G.isMultiplayer&&!G.myTurn) return toast('Senin turun değil!');
  if(!getMyNeighborEnemies(G.myId).has(id)) return toast('⛔ Komşun değil!');
  const c=G.countries[id];
  if(isAllied(G.myId,c.owner)) return toast('⛔ Müttefikine saldıramazsın!');
  me.gold-=100;
  const myPow  =me.army+Math.floor(Math.random()*25)+5;
  const theirPow=c.army+Math.floor(Math.random()*20);
  SFX.attack();
  if(myPow>theirPow){
    const prev=c.owner;
    if(prev!==null){
      const prevP=playerById(prev);
      if(prevP){
        prevP.countries=prevP.countries.filter(x=>x!==id);
        if(isAllied(G.myId,prev)) setRelation(G.myId,prev,REL.NEUTRAL);
        // Check elimination
        if(prevP.countries.length===0 && !G.eliminated.has(prev)){
          eliminatePlayer(prev);
        }
      }
    }
    c.owner=G.myId;
    if(!me.countries.includes(id)) me.countries.push(id);
    const losses=Math.max(1,Math.floor(c.army*0.3));
    me.army=Math.max(5,me.army-losses); c.army=Math.max(5,Math.floor(myPow*0.2));
    // Pulse animation on captured country
    if(G.geoLayer){
      G.geoLayer.eachLayer(l=>{
        if(l.cid===id){
          l.setStyle({...getStyle(id),fillOpacity:1});
          setTimeout(()=>l.setStyle(getStyle(id)),600);
        }
      });
    }
    refreshLayer(id); updateHUD(); clickCountry(id);
    diploEvent('🏴 '+me.name+' → '+c.name+' fethetti!',me.color);
    toast('🏆 '+c.name+' fethedildi! (−'+losses+' ⚔️)',2500);
    checkWin();
    if(G.isMultiplayer&&G.socket) G.socket.emit('player:action',{type:'attack',countryId:id,success:true});
  } else {
    const losses=Math.max(1,Math.floor(myPow*0.25));
    me.army=Math.max(5,me.army-losses);
    updateHUD(); clickCountry(id);
    toast('❌ Saldırı püskürtüldü! '+myPow+' vs '+theirPow+' (−'+losses+' ⚔️)',3000);
    if(G.isMultiplayer&&G.socket) G.socket.emit('player:action',{type:'attack',countryId:id,success:false});
  }
}

// ─── PLAYER ELIMINATION ───────────────────────
function eliminatePlayer(pid) {
  G.eliminated.add(pid);
  const p=playerById(pid); if(!p) return;
  const isMe=pid===G.myId;
  SFX.eliminated();
  showEliminatedBanner(p.name, isMe);
  diploEvent('💀 '+p.name+' elendi!','#ef4444');
  // All their countries become neutral
  Object.values(G.countries).forEach(c=>{
    if(c.owner===pid){ c.owner=null; c.army=Math.max(5,Math.floor(c.army*0.5)); }
  });
  refreshLayer(null); updateHUD();
  if(G.isMultiplayer&&G.socket) G.socket.emit('player:eliminated',{playerId:pid});
}

function showEliminatedBanner(name, isMe) {
  const banner=document.getElementById('eliminated-banner');
  const msg=document.getElementById('eliminated-msg');
  if(!banner||!msg) return;
  msg.textContent=isMe?'Elendин! Oyun bitti.':name+' elendi!';
  banner.style.background=isMe?'rgba(232,64,64,0.95)':'rgba(30,40,60,0.95)';
  banner.classList.add('show');
  setTimeout(()=>banner.classList.remove('show'),3500);
}

// ─── DIPLOMACY ACTIONS ────────────────────────
function proposeAlliance(tid){
  const me=playerById(G.myId);
  if(me.gold<200) return toast('200💰 gerekli!');
  me.gold-=200; updateHUD();
  G.pendingAlliances.push({fromId:G.myId,toId:tid});
  if(G.isMultiplayer&&G.socket){
    G.socket.emit('diplo:request',{type:'alliance',toId:tid});
    toast('🤝 İttifak teklifi gönderildi!');
  } else {
    setTimeout(()=>{
      G.pendingAlliances=G.pendingAlliances.filter(r=>!(r.fromId===G.myId&&r.toId===tid));
      const rel=getRelation(G.myId,tid);
      if(Math.random()<(rel===REL.WAR?0.3:0.7)){
        setRelation(G.myId,tid,REL.ALLIED);
        diploEvent('🤝 '+playerName(tid)+' ittifakı kabul etti!',playerColor(tid));
        refreshLayer(null); SFX.diplo();
      } else {
        me.gold+=200; updateHUD();
        diploEvent('❌ '+playerName(tid)+' ittifakı reddetti.',playerColor(tid));
      }
      if(G.selected) clickCountry(G.selected);
    },1200);
    toast('🤝 İttifak teklifi gönderildi...');
  }
}
function breakAlliance(tid){
  setRelation(G.myId,tid,REL.NEUTRAL);
  diploEvent('💔 '+playerName(G.myId)+' ittifakı bozdu!',playerColor(G.myId));
  refreshLayer(null); if(G.selected) clickCountry(G.selected);
  if(G.isMultiplayer&&G.socket) G.socket.emit('diplo:break',{targetId:tid});
  toast('İttifak bozuldu.');
}
function declareWar(tid){
  setRelation(G.myId,tid,REL.WAR);
  shakeScreen(); SFX.war();
  diploEvent('🚨 '+playerName(G.myId)+' → '+playerName(tid)+' SAVAŞ İLAN ETTİ!','#ef4444');
  refreshLayer(null); if(G.selected) clickCountry(G.selected);
  if(G.isMultiplayer&&G.socket) G.socket.emit('diplo:war',{targetId:tid});
  toast('🚨 Savaş ilan edildi!');
}
function offerPeace(tid){
  const me=playerById(G.myId);
  if(me.gold<150) return toast('150💰 gerekli!');
  me.gold-=150; updateHUD();
  if(G.isMultiplayer&&G.socket){
    G.socket.emit('diplo:request',{type:'peace',toId:tid});
    toast('☮️ Barış teklifi gönderildi!');
  } else {
    setTimeout(()=>{
      if(Math.random()<0.55){
        setRelation(G.myId,tid,REL.NEUTRAL);
        diploEvent('☮️ '+playerName(tid)+' barışı kabul etti!',playerColor(tid));
        refreshLayer(null); SFX.diplo();
      } else {
        me.gold+=150; updateHUD();
        diploEvent('❌ '+playerName(tid)+' barışı reddetti.',playerColor(tid));
      }
      if(G.selected) clickCountry(G.selected);
    },1000);
    toast('☮️ Barış teklifi gönderildi...');
  }
}
function showAllianceRequest(fid,fn,fc){
  openModal('🤝 İttifak Teklifi',fn+' sana ittifak teklif etti.\nKabul eder misin?',null,
    ()=>{setRelation(G.myId,fid,REL.ALLIED);diploEvent('🤝 '+fn+' ile ittifak!',fc);refreshLayer(null);SFX.diplo();G.socket.emit('diplo:response',{type:'alliance',toId:fid,accepted:true});},
    ()=>G.socket.emit('diplo:response',{type:'alliance',toId:fid,accepted:false})
  );
}
function showPeaceRequest(fid,fn,fc){
  openModal('☮️ Barış Teklifi',fn+' sana barış teklif etti.\nKabul eder misin?',null,
    ()=>{setRelation(G.myId,fid,REL.NEUTRAL);diploEvent('☮️ '+fn+' ile barış!',fc);refreshLayer(null);SFX.diplo();G.socket.emit('diplo:response',{type:'peace',toId:fid,accepted:true});},
    ()=>G.socket.emit('diplo:response',{type:'peace',toId:fid,accepted:false})
  );
}
function openGoldTransfer(tid){
  openModal('💰 Altın Gönder',playerName(tid)+' oyuncusuna altın gönder.',{placeholder:'Miktar (örn: 200)',type:'number'},
    (val)=>{
      const amt=parseInt(val); if(!amt||amt<=0) return toast('Geçersiz miktar!');
      const me=playerById(G.myId); if(me.gold<amt) return toast('Yeterli altın yok!');
      me.gold-=amt; updateHUD();
      if(G.isMultiplayer&&G.socket) G.socket.emit('diplo:gold',{toId:tid,amount:amt});
      else{ const t=playerById(tid); if(t){t.gold+=amt;diploEvent('💰 '+me.name+' → '+t.name+' '+amt+' altın',me.color);}}
      toast('💰 '+amt+' altın gönderildi!');
      if(G.selected) clickCountry(G.selected);
    }
  );
}

// ─── MODAL ────────────────────────────────────
let _mConfirm=null,_mCancel=null;
function openModal(title,sub,inputOpts,onOk,onNo){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-sub').textContent=sub;
  const inp=document.getElementById('modal-input');
  if(inputOpts){inp.style.display='block';inp.placeholder=inputOpts.placeholder||'';inp.type=inputOpts.type||'text';inp.value='';}
  else inp.style.display='none';
  _mConfirm=onOk; _mCancel=onNo;
  document.getElementById('modal-overlay').classList.add('show');
}
function modalConfirm(){
  const v=document.getElementById('modal-input').value;
  document.getElementById('modal-overlay').classList.remove('show');
  if(_mConfirm) _mConfirm(v);
}
function modalCancel(){
  document.getElementById('modal-overlay').classList.remove('show');
  if(_mCancel) _mCancel();
}

// ─── SCREEN SHAKE ─────────────────────────────
function shakeScreen(){
  const el=document.getElementById('game'); el.classList.add('shake');
  setTimeout(()=>el.classList.remove('shake'),400);
}

// ─── HUD ──────────────────────────────────────
function initHUD(){
  document.getElementById('players-hud').innerHTML=G.players.map(p=>
    '<div class="p-chip" id="pchip-'+p.id+'">'+'<div class="p-dot" style="background:'+p.color+'"></div>'+'<span>'+p.name.split(' ')[0]+'</span>&nbsp;<b id="chip-'+p.id+'">'+p.countries.length+'</b></div>'
  ).join('');
  updateHUD();
}
function updateHUD(){
  const me=playerById(G.myId)||G.players[0]; if(!me) return;
  const ec=document.getElementById('hud-countries');
  const eg=document.getElementById('hud-gold');
  const ea=document.getElementById('hud-army');
  if(ec) ec.textContent=me.countries.length;
  if(eg) eg.textContent=me.gold;
  if(ea) ea.textContent=me.army;
  G.players.forEach(p=>{
    const el=document.getElementById('chip-'+p.id);
    if(el) el.textContent=p.countries.length;
    const chip=document.getElementById('pchip-'+p.id);
    if(chip) chip.style.opacity=G.eliminated.has(p.id)?'0.35':'1';
  });
}

// ─── TIMER ────────────────────────────────────
function startTimer(){
  clearInterval(G.timerInterval);
  G.timer=G.turnDuration;
  const el=document.getElementById('timer'),box=document.getElementById('timer-box');
  el.textContent=G.timer; el.classList.remove('danger'); box.classList.remove('danger');
  G.timerInterval=setInterval(()=>{
    G.timer--; el.textContent=G.timer;
    const d=G.timer<=10; el.classList.toggle('danger',d); box.classList.toggle('danger',d);
    if(G.timer<=0) endTurn();
  },1000);
}
function endTurn(){
  clearInterval(G.timerInterval);
  if(G.isMultiplayer){if(G.myTurn&&G.socket)G.socket.emit('turn:end',{roomCode:G.roomCode});return;}
  G.turn++;
  document.getElementById('turn-num').textContent=G.turn;
  const me=playerById(0); let income=0;
  me.countries.forEach(id=>{if(G.countries[id])income+=G.countries[id].income;});
  me.gold+=income; me.army+=Math.floor(income/15);
  SFX.income();
  toast('Tur '+G.turn+' — +'+income+' 💰',2000);
  G.players.slice(1).forEach(bot=>{if(bot.isBot&&!G.eliminated.has(bot.id))botTurn(bot);});
  refreshLayer(G.selected); updateHUD(); startTimer();
}

// ─── BOT AI ───────────────────────────────────
function botTurn(bot){
  let income=0;
  bot.countries.forEach(id=>{if(G.countries[id])income+=G.countries[id].income;});
  bot.gold+=income; bot.army+=Math.floor(income/15);

  // Expand to adjacent neutrals
  const adjN=[];
  bot.countries.forEach(cid=>{
    (G.neighbors[cid]||new Set()).forEach(nid=>{if(G.countries[nid]?.owner===null)adjN.push(nid);});
  });
  if(adjN.length>0){
    const pick=adjN[Math.floor(Math.random()*adjN.length)];
    G.countries[pick].owner=bot.id;
    if(!bot.countries.includes(pick))bot.countries.push(pick);
    if(G.geoLayer)G.geoLayer.eachLayer(l=>{if(l.cid===pick)l.setStyle(getStyle(pick));});
  } else {
    const neutrals=Object.values(G.countries).filter(c=>c.owner===null);
    if(neutrals.length>0){
      const pick=neutrals[Math.floor(Math.random()*neutrals.length)];
      G.countries[pick.id].owner=bot.id;
      if(!bot.countries.includes(pick.id))bot.countries.push(pick.id);
      if(G.geoLayer)G.geoLayer.eachLayer(l=>{if(l.cid===pick.id)l.setStyle(getStyle(pick.id));});
    }
  }

  // Bot diplomacy
  if(Math.random()<0.12){
    const others=G.players.filter(p=>p.id!==bot.id&&p.isBot&&!G.eliminated.has(p.id));
    if(others.length>0){
      const t=others[Math.floor(Math.random()*others.length)];
      if(getRelation(bot.id,t.id)===REL.NEUTRAL&&bot.gold>=200){
        bot.gold-=200; setRelation(bot.id,t.id,REL.ALLIED);
        diploEvent('🤝 '+bot.name+' ↔ '+t.name+' ittifak',bot.color); refreshLayer(null);
      }
    }
  }

  // Bot attacks player
  if(Math.random()<0.3&&bot.gold>=100&&bot.army>=15){
    const attackable=[];
    bot.countries.forEach(cid=>{
      (G.neighbors[cid]||new Set()).forEach(nid=>{
        const nc=G.countries[nid];
        if(nc&&nc.owner===0&&!isAllied(bot.id,0)&&!G.eliminated.has(0)) attackable.push(nid);
      });
    });
    if(attackable.length>0){
      const target=attackable[Math.floor(Math.random()*attackable.length)];
      const t=G.countries[target];
      const botPow=bot.army+Math.floor(Math.random()*15);
      const playerPow=t.army+Math.floor(Math.random()*20)+G.players[0].army*0.3;
      bot.gold-=100;
      if(botPow>playerPow){
        const me=playerById(0);
        if(me) me.countries=me.countries.filter(x=>x!==target);
        t.owner=bot.id;
        if(!bot.countries.includes(target)) bot.countries.push(target);
        if(G.geoLayer)G.geoLayer.eachLayer(l=>{if(l.cid===target)l.setStyle(getStyle(target));});
        diploEvent('⚠️ '+bot.name+' → '+t.name+' aldı!',bot.color);
        toast('⚠️ '+bot.name+', '+t.name+' ülkeni aldı!',3000);
        // Check if player is eliminated
        const me2=playerById(0);
        if(me2&&me2.countries.length===0&&!G.eliminated.has(0)){
          eliminatePlayer(0);
        }
        updateHUD();
      }
    }
  }
  checkWin();
}

// ─── WIN CHECK ────────────────────────────────
function checkWin(){
  // Check if only one player remains
  const alive=G.players.filter(p=>!G.eliminated.has(p.id));
  if(alive.length===1){
    clearInterval(G.timerInterval);
    const winner=alive[0];
    const won=winner.id===G.myId;
    showWin(won?'🏆':'😞',won?'KAZANDIN!':winner.name+' Kazandı',
      winner.countries.length+' ülke ile kazandı');
    if(won){SFX.victory();launchConfetti();}else SFX.defeat();
    return;
  }
  // Check percentage win condition
  const total=Object.keys(G.countries).length;
  G.players.forEach(p=>{
    if(G.eliminated.has(p.id)) return;
    const pct=Math.round(p.countries.length/total*100);
    if(pct>=(G.winPct||70)){
      clearInterval(G.timerInterval);
      const won=p.id===G.myId;
      showWin(won?'🏆':'😞',won?'KAZANDIN!':p.name+' Kazandı',
        p.countries.length+' ülke — %'+pct+' harita kontrolü');
      if(won){SFX.victory();launchConfetti();}else SFX.defeat();
    }
  });
}

function showWin(icon,title,sub){
  document.getElementById('win-icon').textContent=icon;
  document.getElementById('win-title').textContent=title;
  document.getElementById('win-sub').textContent=sub;
  document.getElementById('win-overlay').classList.add('show');
}
