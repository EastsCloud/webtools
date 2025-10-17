
// ========= 音频 =========
class AudioClick {
  constructor(){
    this.ctx = null;
    this.outputGain = null;
    this.freq = 1400; // 统一音色，无重拍
  }
  ensure(){
    if(!this.ctx){
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.outputGain = this.ctx.createGain();
      this.outputGain.connect(this.ctx.destination);
      this.outputGain.gain.value = 0.8;
    }
  }
  click(time=0){
    this.ensure();
    const ctx=this.ctx;
    const osc=ctx.createOscillator();
    const env=ctx.createGain();
    osc.frequency.value=this.freq;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(1, time+0.001);
    env.gain.exponentialRampToValueAtTime(0.001, time+0.05);
    osc.connect(env); env.connect(this.outputGain);
    osc.start(time); osc.stop(time+0.06);
  }
}
const audioClick = new AudioClick();

// ========= 高精度节拍调度 =========
class MetronomeEngine{
  constructor({bpm=100}={}){
    this.bpm=bpm;
    this.isRunning=false; this.nextNoteTime=0;
    this.lookahead=25; // ms
    this.scheduleAheadTime=0.1; // seconds
    this.timerID=null;
  }
  _nextNote(){
    const secondsPerBeat = 60.0/this.bpm;
    this.nextNoteTime += secondsPerBeat;
  }
  _scheduler(){
    while(this.nextNoteTime < audioClick.ctx.currentTime + this.scheduleAheadTime){
      audioClick.click(this.nextNoteTime); // 统一音色
      this._nextNote();
    }
  }
  start(){
    if(this.isRunning) return;
    audioClick.ensure();
    this.isRunning=true;
    this.nextNoteTime = audioClick.ctx.currentTime + 0.05;
    this.timerID = setInterval(()=>this._scheduler(), this.lookahead);
  }
  stop(){
    this.isRunning=false;
    if(this.timerID) clearInterval(this.timerID);
    this.timerID=null;
  }
  set({bpm}){ if(bpm) this.bpm=bpm; }
}

// ========= 工具 =========
const $ = (sel, root=document)=>root.querySelector(sel);
function h(tag, attrs={}, ...children){
  const el=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class') el.className=v;
    else if(k==='html') el.innerHTML=v;
    else if(k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k,v);
  }
  for(const c of children){
    if(c==null) continue;
    if(typeof c==='string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}
function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms); }
function prettyTime(sec){
  sec=Math.max(0,Math.round(sec));
  const m=Math.floor(sec/60), s=sec%60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

// ========= 模块：节拍器 =========
function MetronomeCard(){
  const engine=new MetronomeEngine({bpm:100});
  const bpm = h('input',{type:'number',min:'20',max:'300',value:'100'});
  const status = h('span',{class:'chip'} ,'待机');
  const startBtn = h('button',{class:'btn btn-ok'},'开始');
  const stopBtn = h('button',{class:'btn btn-danger'},'停止');

  startBtn.onclick=()=>{ engine.set({bpm:+bpm.value}); engine.start(); status.textContent=`运行中 · ${bpm.value} BPM`; };
  stopBtn.onclick=()=>{ engine.stop(); status.textContent='已停止'; };

  const root=h('div',{class:'card'},
    h('h2',null,'节拍器'),
    h('div',{class:'row tight'},
      h('label',null,'BPM',bpm),
    ),
    h('div',{class:'row controls'},startBtn,stopBtn,status),
    h('div',{class:'hr'}),
  );
  return root;
}

// ========= 模块：计时器（倒计时/正计时） =========
function TimerCard(){
  let running=false, mode='countdown', startTime=null, remain=60, raf=null;
  const mins=h('input',{type:'number',min:'0',value:'1'});
  const secs=h('input',{type:'number',min:'0',max:'59',value:'0'});
  const modeSel=h('select',null,
    h('option',{value:'countdown',selected:true},'倒计时'),
    h('option',{value:'stopwatch'},'正计时')
  );
  const display=h('div',{class:'chip',style:'font-size:22px;'},'1:00');
  const startBtn=h('button',{class:'btn btn-ok'},'开始');
  const pauseBtn=h('button',{class:'btn'},'暂停');
  const resetBtn=h('button',{class:'btn btn-danger'},'重置');

  function totalSeconds(){ return (+mins.value)*60 + (+secs.value); }
  function render(t){ display.textContent=prettyTime(t); }
  function tick(){
    if(!running){ cancelAnimationFrame(raf); return; }
    const now=performance.now();
    if(mode==='countdown'){
      const t = Math.max(0, remain - (now-startTime)/1000);
      render(t);
      if(t<=0){ running=false; vibrate([200,100,200]); audioClick.click(audioClick.ctx?.currentTime||0); }
    }else{
      const t = (now-startTime)/1000; render(t);
    }
    raf=requestAnimationFrame(tick);
  }

  startBtn.onclick=()=>{
    mode=modeSel.value;
    if(mode==='countdown') remain = totalSeconds();
    startTime=performance.now(); running=true; tick();
  };
  pauseBtn.onclick=()=>{ running=false; };
  resetBtn.onclick=()=>{ running=false; render(totalSeconds()); };
  mins.oninput=secs.oninput=()=>{ if(!running) render(totalSeconds()); };

  const root=h('div',{class:'card'},
    h('h2',null,'计时器'),
    h('div',{class:'row tight'},
      h('label',null,'分钟',mins),
      h('label',null,'秒',secs),
      h('label',null,'模式',modeSel)
    ),
    h('div',{class:'row controls'},startBtn,pauseBtn,resetBtn,display)
  );
  return root;
}

// ========= 模块：序列（节拍 or 休止） =========
// 每行有“类型(节拍/休止)”，“BPM(仅节拍可编辑)”，“时长(秒)”
function SequenceCard(){
  const engine = new MetronomeEngine();
  let steps = []; // {type:'beat'|'rest', bpm:number, seconds:number}
  let idx = 0, timer = null;
  const list = h('div');

  function renderList(){
    list.innerHTML = '';
    if(steps.length === 0){
      list.appendChild(
        h('div',{class:'mute small'},'还没有片段。添加“节拍（BPM+时长）”或“休止（仅时长）”。')
      );
      return;
    }

    steps.forEach((s,i)=>{
      const idTag   = h('span',{class:'chip',style:'font-size:11px;padding:3px 7px;'}, `#${i+1}`);
      const typeTag = h('span',{class:'chip',style:'font-size:12px;padding:4px 8px;'},
                        s.type === 'beat' ? '节拍' : '休止');

      // BPM（仅节拍显示）
      const bpmBlock = s.type === 'beat'
        ? [ h('span',null,'BPM'),
            h('input',{
              type:'number', value:s.bpm, min:'20', max:'300',
              oninput:e => s.bpm = +e.target.value
            })
          ]
        : []; // 休止不显示 BPM

      // 时长（节拍/休止都要）
      const secLabel = h('span',null,'时长(秒)');
      const secInput = h('input',{
        type:'number', value:s.seconds, min:'1',
        oninput:e => s.seconds = +e.target.value
      });

      const delBtn = h('button',{
        class:'btn btn-danger',
        onclick:()=>{ steps.splice(i,1); renderList(); }
      }, '删除');

      // 单行：编号 + 类型 + （可选）BPM + 时长 + 删除
      const row = h('div',{class:'row tight',style:'align-items:center'},
        idTag,
        typeTag,
        ...bpmBlock,
        secLabel, secInput,
        delBtn
      );
      list.appendChild(row);
    });
  }

  const addBeat = h('button',{class:'btn btn-ok'},'＋ 添加节拍片段');
  const addRest = h('button',{class:'btn'},'＋ 添加休止片段');
  addBeat.onclick = ()=>{ steps.push({type:'beat', bpm:100, seconds:15}); renderList(); };
  addRest.onclick = ()=>{ steps.push({type:'rest', seconds:10}); renderList(); }; // 无 bpm 字段

  const status   = h('span',{class:'chip'},'待机');
  const startBtn = h('button',{class:'btn btn-ok'},'开始');
  const stopBtn  = h('button',{class:'btn btn-danger'},'停止');

  function runStep(i){
    if(i >= steps.length){ status.textContent='完成'; engine.stop(); idx=0; return; }
    idx = i;
    const s = steps[i];
    status.textContent = `进行 #${i+1}/${steps.length}`;
    clearTimeout(timer);

    if(s.type === 'rest'){
      engine.stop();
      timer = setTimeout(()=>runStep(i+1), s.seconds*1000);
    }else{
      engine.set({bpm:s.bpm}); engine.start();
      timer = setTimeout(()=>runStep(i+1), s.seconds*1000);
    }
  }

  startBtn.onclick = ()=>{ if(steps.length===0) return; clearTimeout(timer); runStep(0); };
  stopBtn.onclick  = ()=>{ clearTimeout(timer); engine.stop(); status.textContent='已停止'; };

  const root = h('div',{class:'card'},
    h('h2',null,'序列'),
    h('div',{class:'row'}, addBeat, addRest),
    h('div',{class:'hr'}),
    list,
    h('div',{class:'hr'}),
    h('div',{class:'row controls'}, startBtn, stopBtn, status)
  );
  renderList();
  return root;
}


// ========= 模块：随机数 =========
function RNGCard(){
  const min=h('input',{type:'number',value:'1'});
  const max=h('input',{type:'number',value:'100'});
  const result=h('div',{class:'chip',style:'font-size:22px'},'-');
  const roll=h('button',{class:'btn btn-ok'},'生成');
  const noRepeat=h('input',{type:'checkbox'});
  const history=[];
  roll.onclick=()=>{
    let a=+min.value, b=+max.value; if(b<a){ const t=a; a=b; b=t; min.value=a; max.value=b; }
    let val;
    if(noRepeat.checked && history.length<(b-a+1)){
      do{ val=Math.floor(Math.random()*(b-a+1))+a; } while(history.includes(val));
      history.push(val); if(history.length>50) history.shift();
    }else{
      val=Math.floor(Math.random()*(b-a+1))+a;
    }
    result.textContent=val;
    vibrate(30);
  };
  const root=h('div',{class:'card'},
    h('h2',null,'随机数'),
    h('div',{class:'row tight'},
      h('label',null,'最小值',min),
      h('label',null,'最大值',max),
      h('label',null,h('span',{class:'small'},'不重复'),noRepeat)
    ),
    h('div',{class:'row controls'},roll,result)
  );
  return root;
}

function initApp(){
  const modules=$('#modules');
  const addType=$('#addType');
  $('#addBtn').onclick=()=>{
    let card;
    switch(addType.value){
      case 'metronome': card=MetronomeCard(); break;
      case 'timer': card=TimerCard(); break;
      case 'sequence': card=SequenceCard(); break;
      case 'rng': card=RNGCard(); break;
    }
    const shell=h('div',{class:'card'});
    const body=h('div'); body.appendChild(card); body.firstChild.classList.remove('card');
    const titleMap={metronome:'节拍器',timer:'计时器',sequence:'序列',rng:'随机数'};
    const summary=h('div',{class:'row',style:'align-items:center;margin:-6px -6px 10px;'},
      h('h2',null,`${titleMap[addType.value]} 模块`),
      h('span',{class:'right'}),
      h('button',{class:'btn',onclick:()=>{ body.style.display= body.style.display==='none'?'':'none'; }},'折叠'),
      h('button',{class:'btn btn-danger',onclick:()=>shell.remove()},'移除')
    );
    shell.innerHTML=''; shell.appendChild(summary); shell.appendChild(body);
    modules.prepend(shell);
  };
}
document.addEventListener('DOMContentLoaded', initApp);
