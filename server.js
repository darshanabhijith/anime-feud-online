const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const QRCode=require('qrcode');
const app=express();const server=http.createServer(app);const io=new Server(server,{maxHttpBufferSize:100000});
const directory=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,'rooms.json');const defaultQuestions=JSON.parse(fs.readFileSync(path.join(__dirname,'data/questions.json'),'utf8'));
let rooms={};try{rooms=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
const clean=(x,n=80)=>String(x??'').trim().slice(0,n);
const validQuestions=(xs)=>Array.isArray(xs)&&xs.length>0&&xs.length<=150&&xs.every(q=>typeof q.question==='string'&&q.question.trim()&&q.question.length<=250&&Array.isArray(q.answers)&&q.answers.length>=2&&q.answers.length<=8&&q.answers.every(a=>typeof a.text==='string'&&a.text.trim()&&a.text.length<=100&&Number.isInteger(a.points)&&a.points>=0&&a.points<=1000));
const safeQuestions=xs=>xs.map(q=>({question:clean(q.question,250),answers:q.answers.map(a=>({text:clean(a.text,100),points:a.points}))}));
function persist(){try{fs.writeFileSync(file,JSON.stringify(rooms,null,2))}catch(e){console.error('Save failure:',e.message)}}
const code=()=>crypto.randomInt(100000,999999).toString();
const makeRoom=()=>({hostKey:crypto.randomBytes(24).toString('hex'),teams:['Team Akatsuki','Straw Hat Pirates'],scores:[0,0],questions:structuredClone(defaultQuestions),round:0,revealed:[],strikes:0,bank:0,multiplier:1,activeTeam:0,status:'waiting',buzz:null,players:{},poll:{open:false,question:'',options:[],votes:{}},bonus:{open:false,question:'',options:[],correct:0,points:10,answers:{},awarded:false},timerEnd:null,timerRemaining:30,created:Date.now()});
const sanitize=r=>({teams:r.teams,scores:r.scores,round:r.round,totalRounds:r.questions.length,question:r.questions[r.round]?.question||'',answers:(r.questions[r.round]?.answers||[]).map((a,i)=>r.revealed.includes(i)?{text:a.text,points:a.points,revealed:true}:{text:'',points:0,revealed:false}),revealed:r.revealed,strikes:r.strikes,bank:r.bank,multiplier:r.multiplier,activeTeam:r.activeTeam,status:r.status,buzz:r.buzz,players:Object.values(r.players).map(p=>({name:p.name,team:p.team,role:p.role,id:p.id})),poll:{open:r.poll.open,question:r.poll.question,options:r.poll.options,counts:r.poll.options.map((_,i)=>Object.values(r.poll.votes).filter(v=>v===i).length),total:Object.keys(r.poll.votes).length},bonus:{open:r.bonus.open,question:r.bonus.question,options:r.bonus.options,submitted:Object.keys(r.bonus.answers).length,awarded:r.bonus.awarded,points:r.bonus.points},timerEnd:r.timerEnd,timerRemaining:r.timerRemaining});
const emit=(id)=>{if(rooms[id])io.to(id).emit('state',sanitize(rooms[id]))};
const reply=(cb,payload)=>{if(typeof cb==='function')cb(payload)};
const err=(cb,message)=>reply(cb,{ok:false,error:message});
function auth(socket,id){return Boolean(rooms[id]&&socket.data.room===id&&socket.data.role==='host'&&socket.data.hostKey===rooms[id].hostKey)}
function resetRound(r){r.revealed=[];r.strikes=0;r.bank=0;r.buzz=null;r.status='playing';r.timerEnd=null;r.timerRemaining=30;r.poll={open:false,question:'',options:[],votes:{}};r.bonus={open:false,question:'',options:[],correct:0,points:10,answers:{},awarded:false}}
app.get('/qr',async(req,res)=>{const room=clean(req.query.room,6);if(!/^\d{6}$/.test(room)||!rooms[room])return res.status(404).send('Room not found');const proto=req.get('x-forwarded-proto')?.split(',')[0]||req.protocol;const link=`${proto}://${req.get('host')}/?room=${room}&role=audience`;try{res.type('png');res.send(await QRCode.toBuffer(link,{width:250,margin:2,color:{dark:'#17234b',light:'#ffffff'}}))}catch{res.status(500).end()}});
app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,res)=>res.json({ok:true,rooms:Object.keys(rooms).length}));
io.on('connection',s=>{
 s.on('create-room',(input,cb)=>{let id=code();while(rooms[id])id=code();const r=makeRoom();r.teams=[clean(input?.teamA||r.teams[0],30)||'Team A',clean(input?.teamB||r.teams[1],30)||'Team B'];rooms[id]=r;persist();reply(cb,{ok:true,id,hostKey:r.hostKey});});
 s.on('join-room',(input,cb)=>{const id=clean(input?.id,6),r=rooms[id];if(!r)return err(cb,'Room not found. Check the six-digit PIN.');const role=['host','team','audience','display'].includes(input?.role)?input.role:'audience';if(role==='host'&&input?.hostKey!==r.hostKey)return err(cb,'Incorrect host key.');let team=role==='team'?Number(input?.team):-1;if(role==='team'&&![0,1].includes(team))return err(cb,'Choose a team.');const name=clean(input?.name,30)|| (role==='host'?'Host':role==='display'?'Projector':'Anime Fan');if(s.data.room){s.leave(s.data.room);const old=rooms[s.data.room];if(old)delete old.players[s.id]}
 s.data={room:id,role,team,hostKey:role==='host'?r.hostKey:null};s.join(id);r.players[s.id]={id:s.id,name,team,role};reply(cb,{ok:true,id,role,questions:role==='host'?r.questions:undefined,pollConfig:role==='host'?r.poll:undefined,bonusConfig:role==='host'?r.bonus:undefined});emit(id);});
 s.on('host-action',(action,cb)=>{const id=s.data.room;if(!auth(s,id))return err(cb,'Host access required.');const r=rooms[id],q=r.questions[r.round];if(!q)return err(cb,'No active question.');const type=action?.type;const index=Number(action?.index);
 switch(type){
 case 'start':r.status='playing';break;
 case 'reveal':if(!Number.isInteger(index)||index<0||index>=q.answers.length)return err(cb,'Invalid answer.');if(!r.revealed.includes(index)){r.revealed.push(index);r.bank+=q.answers[index].points*r.multiplier}break;
 case 'hide':if(!r.revealed.includes(index))break;r.revealed=r.revealed.filter(i=>i!==index);r.bank=Math.max(0,r.bank-q.answers[index].points*r.multiplier);break;
 case 'strike':r.strikes=Math.min(3,r.strikes+1);break;
 case 'unstrike':r.strikes=Math.max(0,r.strikes-1);break;
 case 'award':if(![0,1].includes(index))return err(cb,'Choose team.');r.scores[index]+=r.bank;r.bank=0;r.status='awarded';break;
 case 'edit-score':if(![0,1].includes(index)||!Number.isSafeInteger(action.value)||action.value<0||action.value>1000000)return err(cb,'Invalid score.');r.scores[index]=action.value;break;
 case 'team':if(![0,1].includes(index))return err(cb,'Invalid team.');r.activeTeam=index;r.buzz=null;break;
 case 'clear-buzz':r.buzz=null;break;
 case 'multiplier':if(![1,2,3].includes(index))return err(cb,'Multiplier must be 1, 2, or 3.');r.multiplier=index;break;
 case 'next':r.round=(r.round+1)%r.questions.length;resetRound(r);break;
 case 'previous':r.round=(r.round-1+r.questions.length)%r.questions.length;resetRound(r);break;
 case 'set-round':if(!Number.isInteger(index)||index<0||index>=r.questions.length)return err(cb,'Invalid round.');r.round=index;resetRound(r);break;
 case 'timer-start':r.timerEnd=Date.now()+Math.max(1,r.timerRemaining)*1000;break;
 case 'timer-pause':if(r.timerEnd){r.timerRemaining=Math.max(0,Math.ceil((r.timerEnd-Date.now())/1000));r.timerEnd=null}break;
 case 'timer-reset':r.timerEnd=null;r.timerRemaining=Math.max(5,Math.min(300,Number(action.value)||30));break;
 case 'rename':if(![0,1].includes(index))return err(cb,'Invalid team.');r.teams[index]=clean(action.value,30)||`Team ${index+1}`;break;
 case 'reset-game':r.scores=[0,0];r.round=0;r.multiplier=1;resetRound(r);break;
 default:return err(cb,'Unknown action.')}
 persist();emit(id);reply(cb,{ok:true});});
 s.on('save-questions',(qs,cb)=>{const id=s.data.room;if(!auth(s,id))return err(cb,'Host access required.');if(!validQuestions(qs))return err(cb,'Questions require 2–8 answers, valid point values, and 1–150 rounds.');rooms[id].questions=safeQuestions(qs);rooms[id].round=0;resetRound(rooms[id]);persist();emit(id);reply(cb,{ok:true,questions:rooms[id].questions})});
 s.on('buzz',(_,cb)=>{const id=s.data.room,r=rooms[id];if(!r||s.data.role!=='team'||r.status!=='playing')return err(cb,'Buzzer unavailable.');if(r.buzz)return err(cb,'Someone buzzed first.');r.buzz={name:r.players[s.id]?.name||'Player',team:s.data.team};r.activeTeam=s.data.team;persist();emit(id);reply(cb,{ok:true})});
 s.on('host-poll',(p,cb)=>{const id=s.data.room;if(!auth(s,id))return err(cb,'Host access required.');const r=rooms[id];if(p?.type==='close'){r.poll.open=false}else if(p?.type==='open'){const opts=(p.options||[]).map(x=>clean(x,70)).filter(Boolean);if(!clean(p.question,200)||opts.length<2||opts.length>6)return err(cb,'Poll needs a question and 2–6 options.');r.poll={open:true,question:clean(p.question,200),options:opts,votes:{}}}else return err(cb,'Invalid poll.');persist();emit(id);reply(cb,{ok:true})});
 s.on('poll-vote',(choice,cb)=>{const id=s.data.room,r=rooms[id];if(!r||s.data.role!=='audience'||!r.poll.open)return err(cb,'Poll not open for audience.');if(!Number.isInteger(choice)||choice<0||choice>=r.poll.options.length)return err(cb,'Invalid choice.');r.poll.votes[s.id]=choice;persist();emit(id);reply(cb,{ok:true})});
 s.on('host-bonus',(p,cb)=>{const id=s.data.room;if(!auth(s,id))return err(cb,'Host access required.');const r=rooms[id];if(p.type==='close')r.bonus.open=false;else if(p.type==='open'){const options=(p.options||[]).map(x=>clean(x,70)).filter(Boolean),correct=Number(p.correct);if(!clean(p.question,200)||options.length<2||options.length>6||!Number.isInteger(correct)||correct<0||correct>=options.length)return err(cb,'Bonus needs question, 2–6 options and correct option.');r.bonus={open:true,question:clean(p.question,200),options,correct,points:Math.max(1,Math.min(100,Number(p.points)||10)),answers:{},awarded:false}}else if(p.type==='award'){if(r.bonus.open||r.bonus.awarded)return err(cb,'Close the bonus first or bonus already awarded.');const totals=[0,0];for(const [sid,answer] of Object.entries(r.bonus.answers)){const player=r.players[sid];if(player&&player.role==='audience'&&[0,1].includes(player.team)&&answer===r.bonus.correct)totals[player.team]+=r.bonus.points}r.scores[0]+=totals[0];r.scores[1]+=totals[1];r.bonus.awarded=true}else return err(cb,'Invalid bonus action.');persist();emit(id);reply(cb,{ok:true})});
 s.on('bonus-answer',(choice,cb)=>{const id=s.data.room,r=rooms[id];if(!r||s.data.role!=='audience'||!r.bonus.open)return err(cb,'Bonus not open.');if(!Number.isInteger(choice)||choice<0||choice>=r.bonus.options.length)return err(cb,'Invalid answer.');if(Object.hasOwn(r.bonus.answers,s.id))return err(cb,'You have already answered.');r.bonus.answers[s.id]=choice;persist();emit(id);reply(cb,{ok:true})});
 s.on('disconnect',()=>{const id=s.data.room,r=rooms[id];if(r){delete r.players[s.id];emit(id)}});
});
setInterval(()=>{for(const [id,r] of Object.entries(rooms)){if(r.timerEnd&&Date.now()>=r.timerEnd){r.timerEnd=null;r.timerRemaining=0;emit(id);persist()}}},500);
const port=Number(process.env.PORT)||3000;server.listen(port,()=>console.log(`Anime Feud running at http://localhost:${port}`));
