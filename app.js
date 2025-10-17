
// ========= 音频 =========
class AudioClick {
	constructor() {
		this.ctx = null;
		this.outputGain = null;
		this.freq = 1400; // 统一音色，无重拍
	}
	ensure() {
		if (!this.ctx) {
			this.ctx = new (window.AudioContext || window.webkitAudioContext)();
			this.outputGain = this.ctx.createGain();
			this.outputGain.connect(this.ctx.destination);
			this.outputGain.gain.value = 0.8;
		}
	}
	click(time = 0) {
		this.ensure();
		const ctx = this.ctx;
		const osc = ctx.createOscillator();
		const env = ctx.createGain();
		osc.frequency.value = this.freq;
		env.gain.setValueAtTime(0, time);
		env.gain.linearRampToValueAtTime(1, time + 0.001);
		env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
		osc.connect(env); env.connect(this.outputGain);
		osc.start(time); osc.stop(time + 0.06);
	}
}
const audioClick = new AudioClick();

// ========= 高精度节拍调度 =========
class MetronomeEngine {
	constructor({ bpm = 100 } = {}) {
		this.bpm = bpm;
		this.isRunning = false; this.nextNoteTime = 0;
		this.lookahead = 25; // ms
		this.scheduleAheadTime = 0.1; // seconds
		this.timerID = null;
	}
	_nextNote() {
		const secondsPerBeat = 60.0 / this.bpm;
		this.nextNoteTime += secondsPerBeat;
	}
	_scheduler() {
		while (this.nextNoteTime < audioClick.ctx.currentTime + this.scheduleAheadTime) {
			audioClick.click(this.nextNoteTime); // 统一音色
			this._nextNote();
		}
	}
	start() {
		if (this.isRunning) return;
		audioClick.ensure();
		this.isRunning = true;
		this.nextNoteTime = audioClick.ctx.currentTime + 0.05;
		this.timerID = setInterval(() => this._scheduler(), this.lookahead);
	}
	stop() {
		this.isRunning = false;
		if (this.timerID) clearInterval(this.timerID);
		this.timerID = null;
	}
	set({ bpm }) { if (bpm) this.bpm = bpm; }
}

// ========= 工具 =========
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...children) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (k === 'class') el.className = v;
		else if (k === 'html') el.innerHTML = v;
		else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
		else el.setAttribute(k, v);
	}
	for (const c of children) {
		if (c == null) continue;
		if (typeof c === 'string') el.appendChild(document.createTextNode(c));
		else el.appendChild(c);
	}
	return el;
}
function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }
function prettyTime(sec) {
	sec = Math.max(0, Math.round(sec));
	const m = Math.floor(sec / 60), s = sec % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

// ======== 模块：节拍器（无内部标题） ========
function MetronomeCardBody() {
	const engine = new MetronomeEngine({ bpm: 100 });
	const bpm = h('input', { type: 'number', min: '20', max: '300', value: '100', class: 'input-inline w-num shrink' });
	const status = h('span', { class: 'chip shrink' }, '待机');
	const startBtn = h('button', { class: 'btn btn-ok btn-inline shrink' }, '开始');
	const stopBtn = h('button', { class: 'btn btn-danger btn-inline shrink' }, '停止');

	startBtn.onclick = () => { engine.set({ bpm: +bpm.value }); engine.start(); status.textContent = `运行中 · ${bpm.value} BPM`; };
	stopBtn.onclick = () => { engine.stop(); status.textContent = '已停止'; };

	return h('div', null,
		h('div', { class: 'row inline' },
			h('span', { class: 'compact-label shrink' }, 'BPM'),
			bpm,
			startBtn,
			stopBtn,
			status
		),
		// h('div', { class: 'mute small' }, '提示：首次播放前轻触屏幕以激活音频。')
	);
}

// ======== 模块：计时器（无内部标题） ========
function TimerCardBody() {
	let running = false, mode = 'countdown', startTime = null, remain = 60, raf = null;

	const mins = h('input', { type: 'number', min: '0', value: '1', class: 'input-inline w-num shrink' });
	const secs = h('input', { type: 'number', min: '0', max: '59', value: '0', class: 'input-inline w-num shrink' });
	const modeSel = h('select', { class: 'w-sel shrink' },
		h('option', { value: 'countdown', selected: true }, '倒计时'),
		h('option', { value: 'stopwatch' }, '正计时')
	);
	const display = h('div', { class: 'chip display-chip shrink' }, '1:00');
	const startBtn = h('button', { class: 'btn btn-ok btn-inline shrink' }, '开始');
	const pauseBtn = h('button', { class: 'btn btn-inline shrink' }, '暂停');
	const resetBtn = h('button', { class: 'btn btn-danger btn-inline shrink' }, '重置');

	function totalSeconds() { return (+mins.value) * 60 + (+secs.value); }
	function render(t) {
		t = Math.max(0, Math.round(t));
		const m = Math.floor(t / 60), s = t % 60;
		display.textContent = `${m}:${s.toString().padStart(2, '0')}`;
	}
	function tick() {
		if (!running) { cancelAnimationFrame(raf); return; }
		const now = performance.now();
		if (mode === 'countdown') {
			const t = Math.max(0, remain - (now - startTime) / 1000);
			render(t);
			if (t <= 0) {
				running = false;
				if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
				audioClick.click(audioClick.ctx?.currentTime || 0);
			}
		} else {
			const t = (now - startTime) / 1000; render(t);
		}
		raf = requestAnimationFrame(tick);
	}

	startBtn.onclick = () => { mode = modeSel.value; if (mode === 'countdown') remain = totalSeconds(); startTime = performance.now(); running = true; tick(); };
	pauseBtn.onclick = () => { running = false; };
	resetBtn.onclick = () => { running = false; render(totalSeconds()); };
	mins.oninput = secs.oninput = () => { if (!running) render(totalSeconds()); };

	// —— 全部一行 —— //
	return h('div', null,
		h('div', { class: 'row inline' },
			h('span', { class: 'compact-label shrink' }, '分'), mins,
			h('span', { class: 'compact-label shrink' }, '秒'), secs,
			h('span', { class: 'compact-label shrink' }, '模式'), modeSel,
			startBtn, pauseBtn, resetBtn,
			display
		)
	);
}


// ======== 模块：序列（纯文字类型 + 单行：BPM/时长/删除；休止无 BPM） ========
function SequenceCardBody() {
	const engine = new MetronomeEngine();
	let steps = []; let idx = 0, timer = null;
	const list = h('div');


	function renderList() {
		list.innerHTML = '';
		if (steps.length === 0) {
			list.appendChild(h('div', { class: 'mute small' }, '还没有片段。添加“节拍（BPM+时长）”或“休止（仅时长）”。'));
			return;
		}
		steps.forEach((s, i) => {
			const idTag = h('span', { class: 'chip w-chip shrink' }, `#${i + 1}`);
			const typeTag = h('span', { class: 'chip w-type shrink' }, s.type === 'beat' ? '节拍' : '休止');
			const rowKids = [idTag, typeTag];

			if (s.type === 'beat') {
				const bpmInput = h('input', {
					type: 'number', value: s.bpm ?? 100, min: '20', max: '300', class: 'input-inline w-num shrink',
					oninput: e => s.bpm = +e.target.value
				});
				rowKids.push(
					h('span', { class: 'compact-label shrink' }, 'BPM'),
					bpmInput
				);
			}

			const secInput = h('input', {
				type: 'number', value: s.seconds, min: '1', class: 'input-inline w-num shrink',
				oninput: e => s.seconds = +e.target.value
			});
			const delBtn = h('button', { class: 'btn btn-ghost btn-inline shrink', onclick: () => { steps.splice(i, 1); renderList(); } }, '删除');

			rowKids.push(
				h('span', { class: 'compact-label shrink' }, '时长(秒)'),
				secInput,
				delBtn
			);

			list.appendChild(h('div', { class: 'row inline' }, ...rowKids));
			// if (i < steps.length - 1) list.appendChild(h('div', { class: 'segdash' })); // 段间小横杠
		});
	}

	const addBeat = h('button', { class: 'btn btn-ok btn-xs shrink' }, '＋ 节拍');
	const addRest = h('button', { class: 'btn btn-xs shrink' }, '＋ 休止');
	const startBtn = h('button', { class: 'btn btn-ok btn-xs shrink' }, '开始');
	const stopBtn = h('button', { class: 'btn btn-danger btn-xs shrink' }, '停止');
	const status = h('span', { class: 'chip chip-xs shrink' }, '待机');


	addBeat.onclick = () => { steps.push({ type: 'beat', bpm: 100, seconds: 15 }); renderList(); };
	addRest.onclick = () => { steps.push({ type: 'rest', seconds: 10 }); renderList(); };


	function runStep(i) {
		if (i >= steps.length) { status.textContent = '完成'; engine.stop(); idx = 0; return; }
		idx = i; const s = steps[i];
		status.textContent = `进行 #${i + 1}/${steps.length}`;
		clearTimeout(timer);
		if (s.type === 'rest') { engine.stop(); timer = setTimeout(() => runStep(i + 1), s.seconds * 1000); }
		else { engine.set({ bpm: s.bpm }); engine.start(); timer = setTimeout(() => runStep(i + 1), s.seconds * 1000); }
	}

	startBtn.onclick = () => { if (steps.length === 0) return; clearTimeout(timer); runStep(0); };
	stopBtn.onclick = () => { clearTimeout(timer); engine.stop(); status.textContent = '已停止'; };


	return h('div', null,
		// 这一行包含：＋节拍｜＋休止｜开始｜停止｜待机
		h('div', { class: 'row inline' }, addBeat, addRest, startBtn, stopBtn, status),
		list
	);

}

// ======== 模块：随机数（无内部标题） ========
function RNGCardBody() {
	const min = h('input', { type: 'number', value: '1', class: 'input-inline w-num shrink' });
	const max = h('input', { type: 'number', value: '100', class: 'input-inline w-num shrink' });
	const result = h('div', { class: 'chip shrink' }, '-');
	const roll = h('button', { class: 'btn btn-ok btn-inline shrink' }, '生成');
	const noRepeat = h('input', { type: 'checkbox', class: 'shrink' });
	const history = [];
	roll.onclick = () => {
		let a = +min.value, b = +max.value; if (b < a) { [a, b] = [b, a]; min.value = a; max.value = b; }
		let v; if (noRepeat.checked && history.length < (b - a + 1)) {
			do { v = Math.floor(Math.random() * (b - a + 1)) + a; } while (history.includes(v));
			history.push(v); if (history.length > 50) history.shift();
		} else v = Math.floor(Math.random() * (b - a + 1)) + a;
		result.textContent = v; if (navigator.vibrate) navigator.vibrate(30);
	};
	return h('div', null,
		h('div', { class: 'row inline' },
			h('span', { class: 'compact-label shrink' }, '最小值'), min,
			h('span', { class: 'compact-label shrink' }, '最大值'), max,
			// h('span', { class: 'compact-label shrink' }, '不重复'), noRepeat,
			roll,
			result
		)
	);
}

// ======== 统一包装：无折叠，小型“删除”在名称栏右侧 ========
function createModuleShell(title, bodyNode) {
	const shell = h('div', { class: 'card' });
	const namebar = h('div', { class: 'namebar' },
		h('h3', null, title),
		h('span', { class: 'right' }),
		h('button', { class: 'btn btn-ghost btn-xs', onclick: () => shell.remove() }, '删除')
	);
	shell.appendChild(namebar);
	shell.appendChild(bodyNode);
	return shell;
}

// ======== 初始化 / 添加模块 ========
function initApp() {
	const modules = $('#modules');
	const addType = $('#addType');
	$('#addBtn').onclick = () => {
		let body, title;
		switch (addType.value) {
			case 'metronome': body = MetronomeCardBody(); title = '节拍器'; break;
			case 'timer': body = TimerCardBody(); title = '计时器'; break;
			case 'sequence': body = SequenceCardBody(); title = '序列'; break;
			case 'rng': body = RNGCardBody(); title = '随机数'; break;
		}
		modules.prepend(createModuleShell(title, body));
	};
}
document.addEventListener('DOMContentLoaded', initApp);
