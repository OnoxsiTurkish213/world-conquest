const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin:'*', methods:['GET','POST'] } });

app.use(express.static(path.join(__dirname)));
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'index.html')));

const rooms = {};
const REL   = { NEUTRAL:'neutral', ALLIED:'allied', WAR:'war' };

function randCode() { return Math.random().toString(36).substr(2,4).toUpperCase(); }

const COUNTRIES = [
  {id:'TUR',name:'Türkiye',        income:40, bbox:[26,36,45,42]   },
  {id:'RUS',name:'Rusya',          income:80, bbox:[30,50,180,75]  },
  {id:'USA',name:'ABD',            income:100,bbox:[-125,25,-65,50]},
  {id:'CHN',name:'Çin',            income:90, bbox:[75,18,135,53]  },
  {id:'BRA',name:'Brezilya',       income:60, bbox:[-74,-34,-34,5] },
  {id:'IND',name:'Hindistan',      income:70, bbox:[68,8,97,36]    },
  {id:'DEU',name:'Almanya',        income:50, bbox:[6,47,15,55]    },
  {id:'GBR',name:'İngiltere',      income:50, bbox:[-6,50,2,59]    },
  {id:'FRA',name:'Fransa',         income:50, bbox:[-5,42,8,51]    },
  {id:'AUS',name:'Avustralya',     income:55, bbox:[113,-44,154,-10]},
  {id:'CAN',name:'Kanada',         income:65, bbox:[-141,42,-53,83]},
  {id:'ARG',name:'Arjantin',       income:35, bbox:[-73,-55,-53,-22]},
  {id:'MEX',name:'Meksika',        income:40, bbox:[-117,14,-86,33]},
  {id:'IDN',name:'Endonezya',      income:45, bbox:[95,-11,141,6]  },
  {id:'SAU',name:'S.Arabistan',    income:55, bbox:[36,16,55,32]   },
  {id:'NGA',name:'Nijerya',        income:30, bbox:[3,4,15,14]     },
  {id:'ZAF',name:'G.Afrika',       income:35, bbox:[16,-35,33,-22] },
  {id:'EGY',name:'Mısır',          income:30, bbox:[25,22,37,32]   },
  {id:'PAK',name:'Pakistan',       income:28, bbox:[60,23,78,37]   },
  {id:'KOR',name:'G.Kore',         income:48, bbox:[126,34,130,38] },
  {id:'JPN',name:'Japonya',        income:65, bbox:[130,30,146,45] },
  {id:'ITA',name:'İtalya',         income:45, bbox:[7,36,18,47]    },
  {id:'ESP',name:'İspanya',        income:42, bbox:[-9,36,5,44]    },
  {id:'POL',name:'Polonya',        income:38, bbox:[14,49,24,55]   },
  {id:'UKR',name:'Ukrayna',        income:25, bbox:[22,44,40,53]   },
  {id:'IRN',name:'İran',           income:35, bbox:[44,25,63,40]   },
  {id:'IRQ',name:'Irak',           income:32, bbox:[38,29,49,38]   },
  {id:'SYR',name:'Suriye',         income:10, bbox:[36,32,42,37]   },
  {id:'SDN',name:'Sudan',          income:18, bbox:[24,8,38,22]    },
  {id:'ETH',name:'Etiyopya',       income:15, bbox:[33,3,48,15]    },
  {id:'COD',name:'Kongo',          income:12, bbox:[12,-13,31,5]   },
  {id:'TZA',name:'Tanzanya',       income:14, bbox:[29,-12,41,-1]  },
  {id:'KEN',name:'Kenya',          income:16, bbox:[34,-5,42,5]    },
  {id:'GHA',name:'Gana',           income:18, bbox:[-3,5,1,11]     },
  {id:'VEN',name:'Venezuela',      income:20, bbox:[-73,1,-59,12]  },
  {id:'COL',name:'Kolombiya',      income:28, bbox:[-79,-4,-66,13] },
  {id:'PER',name:'Peru',           income:25, bbox:[-81,-18,-68,0] },
  {id:'CHL',name:'Şili',           income:30, bbox:[-76,-56,-65,-17]},
  {id:'SWE',name:'İsveç',          income:48, bbox:[11,55,25,69]   },
  {id:'NOR',name:'Norveç',         income:52, bbox:[4,57,31,71]    },
  {id:'FIN',name:'Finlandiya',     income:46, bbox:[20,60,32,70]   },
  {id:'DNK',name:'Danimarka',      income:44, bbox:[8,54,13,58]    },
  {id:'NLD',name:'Hollanda',       income:46, bbox:[3,51,7,54]     },
  {id:'BEL',name:'Belçika',        income:44, bbox:[2,49,7,52]     },
  {id:'CHE',name:'İsviçre',        income:50, bbox:[6,45,10,48]    },
  {id:'AUT',name:'Avusturya',      income:44, bbox:[9,46,18,49]    },
  {id:'CZE',name:'Çekya',          income:40, bbox:[12,48,19,51]   },
  {id:'HUN',name:'Macaristan',     income:36, bbox:[16,45,23,49]   },
  {id:'ROU',name:'Romanya',        income:30, bbox:[20,43,30,48]   },
  {id:'BGR',name:'Bulgaristan',    income:28, bbox:[22,41,28,44]   },
  {id:'SRB',name:'Sırbistan',      income:24, bbox:[18,42,23,46]   },
  {id:'HRV',name:'Hırvatistan',    income:28, bbox:[13,42,19,47]   },
  {id:'GRC',name:'Yunanistan',     income:32, bbox:[20,35,27,42]   },
  {id:'PRT',name:'Portekiz',       income:36, bbox:[-9,37,-6,42]   },
  {id:'ISR',name:'İsrail',         income:42, bbox:[34,29,36,33]   },
  {id:'JOR',name:'Ürdün',          income:22, bbox:[35,29,39,33]   },
  {id:'YEM',name:'Yemen',          income:10, bbox:[42,12,54,19]   },
  {id:'OMN',name:'Umman',          income:35, bbox:[52,16,60,24]   },
  {id:'ARE',name:'BAE',            income:50, bbox:[51,22,56,26]   },
  {id:'KWT',name:'Kuveyt',         income:48, bbox:[46,28,49,30]   },
  {id:'QAT',name:'Katar',          income:55, bbox:[50,24,52,27]   },
  {id:'KAZ',name:'Kazakistan',     income:38, bbox:[50,40,88,56]   },
  {id:'UZB',name:'Özbekistan',     income:18, bbox:[56,37,74,46]   },
  {id:'AFG',name:'Afganistan',     income:8,  bbox:[60,29,75,39]   },
  {id:'BGD',name:'Bangladeş',      income:20, bbox:[88,20,93,27]   },
  {id:'MMR',name:'Myanmar',        income:15, bbox:[92,10,102,28]  },
  {id:'THA',name:'Tayland',        income:35, bbox:[97,5,106,21]   },
  {id:'VNM',name:'Vietnam',        income:28, bbox:[102,8,110,23]  },
  {id:'PHL',name:'Filipinler',     income:25, bbox:[117,5,127,20]  },
  {id:'MYS',name:'Malezya',        income:35, bbox:[99,0,120,8]    },
  {id:'NZL',name:'Yeni Zelanda',   income:42, bbox:[166,-47,178,-34]},
  {id:'DZA',name:'Cezayir',        income:30, bbox:[-9,18,12,38]   },
  {id:'LBY',name:'Libya',          income:22, bbox:[9,20,25,34]    },
  {id:'MAR',name:'Fas',            income:25, bbox:[-17,27,0,36]   },
  {id:'MLI',name:'Mali',           income:10, bbox:[-12,10,5,25]   },
  {id:'NER',name:'Nijer',          income:8,  bbox:[0,11,16,24]    },
  {id:'TCD',name:'Çad',            income:9,  bbox:[13,7,24,24]    },
  {id:'ANG',name:'Angola',         income:20, bbox:[11,-18,24,-5]  },
  {id:'MOZ',name:'Mozambik',       income:12, bbox:[30,-26,41,-10] },
  {id:'ZMB',name:'Zambiya',        income:14, bbox:[21,-18,34,-8]  },
  {id:'MDG',name:'Madagaskar',     income:10, bbox:[43,-25,51,-12] },
  {id:'CMR',name:'Kamerun',        income:15, bbox:[8,2,16,13]     },
];

function buildNeighbors() {
  const PAD=1.5,nb={};
  COUNTRIES.forEach(c=>{nb[c.id]=[];});
  for(let i=0;i<COUNTRIES.length;i++) for(let j=i+1;j<COUNTRIES.length;j++) {
    const a=COUNTRIES[i].bbox,b=COUNTRIES[j].bbox;
    if(a[0]-PAD<=b[2]&&a[2]+PAD>=b[0]&&a[1]-PAD<=b[3]&&a[3]+PAD>=b[1]){
      nb[COUNTRIES[i].id].push(COUNTRIES[j].id);nb[COUNTRIES[j].id].push(COUNTRIES[i].id);
    }
  }
  return nb;
}
function buildCountries() {
  const c={};
  COUNTRIES.forEach(x=>{c[x.id]={id:x.id,name:x.name,owner:null,army:Math.floor(Math.random()*15)+5,income:x.income};});
  return c;
}
function buildBounds() {
  const b={};
  COUNTRIES.forEach(x=>{b[x.id]={minLon:x.bbox[0],minLat:x.bbox[1],maxLon:x.bbox[2],maxLat:x.bbox[3]};});
  return b;
}
function initRelations(players) {
  const r={};
  players.forEach(a=>{r[a.id]={};players.forEach(b=>{if(a.id!==b.id)r[a.id][b.id]=REL.NEUTRAL;});});
  return r;
}
function distributeStart(countries,players) {
  const ids=Object.keys(countries).sort(()=>Math.random()-0.5);
  let i=0;
  players.forEach(p=>{for(let k=0;k<2&&i<ids.length;k++,i++){countries[ids[i]].owner=p.id;countries[ids[i]].army=20;p.countries.push(ids[i]);}});
}
function checkWinServer(code) {
  const room=rooms[code];if(!room)return;
  const total=Object.keys(room.countries).length;
  room.players.forEach(p=>{
    const pct=Math.round(p.countries.length/total*100);
    if(pct>=(room.settings.winPct||70)){
      clearTimeout(room.timerHandle);room.phase='over';
      io.to(code).emit('game:over',{winnerId:p.id,winnerName:p.name});
    }
  });
}

io.on('connection', socket => {
  console.log('+', socket.id);

  socket.on('room:create', ({name,color,settings}) => {
    const code=randCode();
    const player={id:socket.id,name,color,countries:[],gold:settings.startGold||1000,army:50};
    rooms[code]={code,host:socket.id,players:[player],settings,phase:'lobby',currentIdx:0,turn:1,timerHandle:null,relations:{}};
    socket.join(code);socket.roomCode=code;
    socket.emit('room:joined',{roomCode:code,players:rooms[code].players,settings});
    console.log('room created:',code,'by',name);
  });

  socket.on('room:join', ({code,name,color}) => {
    const room=rooms[code];
    if(!room)          return socket.emit('room:error',{msg:'Oda bulunamadı: '+code});
    if(room.phase!=='lobby') return socket.emit('room:error',{msg:'Oyun zaten başladı!'});
    if(room.players.length>=8) return socket.emit('room:error',{msg:'Oda dolu!'});
    const player={id:socket.id,name,color,countries:[],gold:room.settings.startGold||1000,army:50};
    room.players.push(player);socket.join(code);socket.roomCode=code;
    socket.emit('room:joined',{roomCode:code,players:room.players,settings:room.settings});
    socket.to(code).emit('room:updated',{players:room.players});
    console.log(name,'joined',code);
  });

  socket.on('game:start', ({roomCode}) => {
    const room=rooms[roomCode];
    if(!room||room.host!==socket.id) return;
    if(room.players.length<2) return socket.emit('room:error',{msg:'En az 2 oyuncu gerekli!'});
    room.phase='playing';
    room.countries=buildCountries();
    room.countryBounds=buildBounds();
    room.neighbors=buildNeighbors();
    room.relations=initRelations(room.players);
    distributeStart(room.countries,room.players);
    room.players.forEach(p=>{
      io.to(p.id).emit('game:start',{players:room.players,countries:room.countries,countryBounds:room.countryBounds,neighbors:room.neighbors,myPlayerId:p.id});
    });
    setTimeout(()=>startTurn(roomCode),600);
  });

  socket.on('player:action', action => {
    const room=rooms[socket.roomCode];if(!room||room.phase!=='playing')return;
    action.playerId=socket.id;
    if(action.type==='reinforce'){
      const c=room.countries[action.countryId],p=room.players.find(x=>x.id===socket.id);
      if(c&&p&&p.gold>=50){p.gold-=50;c.army+=10;p.army+=10;}
    } else if(action.type==='attack'&&action.success){
      const c=room.countries[action.countryId],att=room.players.find(x=>x.id===socket.id);
      if(c&&att){
        if(c.owner!==null){const prev=room.players.find(x=>x.id===c.owner);if(prev)prev.countries=prev.countries.filter(x=>x!==action.countryId);}
        c.owner=socket.id;if(!att.countries.includes(action.countryId))att.countries.push(action.countryId);
      }
    }
    io.to(socket.roomCode).emit('game:state',{countries:room.countries,players:room.players,relations:room.relations});
    socket.to(socket.roomCode).emit('player:action',action);
    checkWinServer(socket.roomCode);
  });

  // Diplomacy
  socket.on('diplo:request', ({type,toId}) => {
    const room=rooms[socket.roomCode];if(!room)return;
    const from=room.players.find(p=>p.id===socket.id);if(!from)return;
    if(type==='alliance'&&from.gold>=200){from.gold-=200;io.to(socket.roomCode).emit('game:state',{players:room.players});}
    if(type==='peace'   &&from.gold>=150){from.gold-=150;io.to(socket.roomCode).emit('game:state',{players:room.players});}
    io.to(toId).emit('diplo:request',{type,fromId:socket.id,fromName:from.name,fromColor:from.color});
  });

  socket.on('diplo:response', ({type,toId,accepted}) => {
    const room=rooms[socket.roomCode];if(!room)return;
    if(accepted){
      const nr=type==='alliance'?REL.ALLIED:REL.NEUTRAL;
      if(!room.relations[socket.id])room.relations[socket.id]={};
      if(!room.relations[toId])    room.relations[toId]={};
      room.relations[socket.id][toId]=nr;room.relations[toId][socket.id]=nr;
      io.to(socket.roomCode).emit('game:state',{relations:room.relations});
    } else {
      const from=room.players.find(p=>p.id===toId);
      if(from){if(type==='alliance')from.gold+=200;if(type==='peace')from.gold+=150;}
      io.to(socket.roomCode).emit('game:state',{players:room.players});
    }
    io.to(toId).emit('diplo:response',{type,fromId:socket.id,accepted});
  });

  socket.on('diplo:war', ({targetId}) => {
    const room=rooms[socket.roomCode];if(!room)return;
    const from=room.players.find(p=>p.id===socket.id);
    if(!room.relations[socket.id])room.relations[socket.id]={};
    if(!room.relations[targetId]) room.relations[targetId]={};
    room.relations[socket.id][targetId]=REL.WAR;room.relations[targetId][socket.id]=REL.WAR;
    io.to(socket.roomCode).emit('game:state',{relations:room.relations});
    io.to(socket.roomCode).emit('diplo:war',{fromId:socket.id,fromName:from?.name,fromColor:from?.color,targetId});
  });

  socket.on('diplo:break', ({targetId}) => {
    const room=rooms[socket.roomCode];if(!room)return;
    if(!room.relations[socket.id])room.relations[socket.id]={};
    if(!room.relations[targetId]) room.relations[targetId]={};
    room.relations[socket.id][targetId]=REL.NEUTRAL;room.relations[targetId][socket.id]=REL.NEUTRAL;
    io.to(socket.roomCode).emit('game:state',{relations:room.relations});
  });

  socket.on('diplo:gold', ({toId,amount}) => {
    const room=rooms[socket.roomCode];if(!room)return;
    const from=room.players.find(p=>p.id===socket.id),to=room.players.find(p=>p.id===toId);
    if(!from||!to||from.gold<amount)return;
    from.gold-=amount;to.gold+=amount;
    io.to(socket.roomCode).emit('game:state',{players:room.players});
    io.to(toId).emit('diplo:request',{type:'gold',fromId:socket.id,fromName:from.name,fromColor:from.color,amount});
  });

  socket.on('turn:end', ({roomCode}) => {
    const room=rooms[roomCode];if(!room||room.phase!=='playing')return;
    if(room.players[room.currentIdx]?.id!==socket.id)return;
    clearTimeout(room.timerHandle);advanceTurn(roomCode);
  });

  socket.on('disconnect', () => {
    console.log('-',socket.id);
    const code=socket.roomCode;if(!code||!rooms[code])return;
    const room=rooms[code];
    room.players=room.players.filter(p=>p.id!==socket.id);
    if(room.players.length===0){clearTimeout(room.timerHandle);delete rooms[code];}
    else{if(room.host===socket.id)room.host=room.players[0].id;io.to(code).emit('room:updated',{players:room.players});}
  });
});

function startTurn(code) {
  const room=rooms[code];if(!room||room.phase!=='playing')return;
  const cur=room.players[room.currentIdx];
  if(cur){
    let inc=0;cur.countries.forEach(id=>{if(room.countries[id])inc+=room.countries[id].income;});
    cur.gold+=inc;cur.army+=Math.floor(inc/15);
  }
  io.to(code).emit('game:state',{countries:room.countries,players:room.players});
  io.to(code).emit('turn:start',{turn:room.turn,currentPlayerId:cur?.id});
  const dur=(room.settings.turnDuration||60)*1000;
  room.timerHandle=setTimeout(()=>advanceTurn(code),dur);
}
function advanceTurn(code) {
  const room=rooms[code];if(!room||room.phase!=='playing')return;
  room.currentIdx=(room.currentIdx+1)%room.players.length;
  room.turn++;startTurn(code);
}

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log('World Conquest v1.0.0 on port',PORT));
