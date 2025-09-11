
/**
 * Heart's Melody v2 – Upgraded Diary + existing Studio
 * - Emotion diary with Plutchik model (base + intensity)
 * - Entry list with edit/delete, year-month filter
 * - Calendar view with monthly navigation
 * - Stats (tiles + frequency bar + 30-day dot map)
 * - Backup/Restore (JSON)
 * - Keeps existing Studio (poem/music/visual) from v1
 * No external API calls; AI response is generated locally (tone-based).
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
let toastTimeout;
const toast = (msg) => {
  const el = $("#toast");
  el.textContent = msg;
  const showCls = "show";
  if (el.classList.contains(showCls)) {
    el.classList.remove(showCls);
    void el.offsetWidth; // restart animation
  }
  el.classList.add(showCls);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove(showCls), 1800);
};

/* -------------------- THEME -------------------- */
(() => {
  const key = "hm_theme_dark";
  const btn = $("#themeToggle");
  const setDark = (isDark) => {
    document.documentElement.style.setProperty('--bg', isDark? '#0f1226':'#f6f7fb');
    document.documentElement.style.setProperty('--text', isDark? '#E6E6F0':'#1f2937');
    document.documentElement.style.setProperty('--muted', isDark? '#B8B9C9':'#6b7280');
  };
  const saved = localStorage.getItem(key);
  setDark(saved === null ? true : saved === '1');
  btn.addEventListener('click', () => {
    const isDark = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#0f1226';
    setDark(!isDark);
    localStorage.setItem(key, !isDark ? '1' : '0');
  });
})();

/* -------------------- TABS -------------------- */
$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const id = tab.dataset.target;
  $$('.panel').forEach(p => p.classList.remove('active'));
  $(id).classList.add('active');

  if(id === '#insights'){ renderInsights(); }
  if(id === '#calendar'){ renderCalendar(); }
  if(id === '#diary'){ populateYearMonthFilter(); renderEntries(); }
  if(id === '#data'){ /* no-op */ }
}));

/* -------------------- STORAGE -------------------- */
const Storage = {
  // Works (from v1)
  saveWork(work){
    const arr = JSON.parse(localStorage.getItem('hm_works') || '[]');
    arr.unshift(work);
    localStorage.setItem('hm_works', JSON.stringify(arr));
  },
  getWorks(){ return JSON.parse(localStorage.getItem('hm_works') || '[]'); },
  saveSessions(point){
    const arr = JSON.parse(localStorage.getItem('hm_sessions') || '[]');
    arr.push(point);
    localStorage.setItem('hm_sessions', JSON.stringify(arr));
  },
  getSessions(){ return JSON.parse(localStorage.getItem('hm_sessions') || '[]'); },

  // Diary
  getDiary(){ return JSON.parse(localStorage.getItem('hm_diary_entries_v1') || '[]'); },
  setDiary(entries){ localStorage.setItem('hm_diary_entries_v1', JSON.stringify(entries)); },
  addDiary(entry){ const arr = Storage.getDiary(); arr.unshift(entry); Storage.setDiary(arr); },
};

/* -------------------- DIARY MODEL (Plutchik) -------------------- */
// Inspired by the user's Emotion Diary code (React/Zustand), ported to vanilla JS.
// Base emotions with intensity and emoji/color.
const plutchikEmotions = {
  joy_serenity:   { base: 'joy', intensity: 'low',    intensity_kr: '낮음', name: '평온', name_kr_full: '평온 (기쁨)', color: '#FACC15', emoji: '😌' },
  joy_joy:        { base: 'joy', intensity: 'medium', intensity_kr: '중간', name: '기쁨', name_kr_full: '기쁨', color: '#FACC15', emoji: '😊' },
  joy_ecstasy:    { base: 'joy', intensity: 'high',   intensity_kr: '높음', name: '황홀', name_kr_full: '황홀 (기쁨)', color: '#D97706', emoji: '🤩' },

  trust_acceptance: { base: 'trust', intensity: 'low', name: '수용', name_kr_full: '수용 (신뢰)', color: '#4ADE80', emoji: '🙂', intensity_kr:'낮음' },
  trust_trust:      { base: 'trust', intensity: 'medium', name: '신뢰', name_kr_full: '신뢰', color: '#4ADE80', emoji: '🤝', intensity_kr:'중간' },
  trust_admiration: { base: 'trust', intensity: 'high', name: '감탄', name_kr_full: '감탄 (신뢰)', color: '#16A34A', emoji: '😍', intensity_kr:'높음' },

  fear_apprehension:{ base: 'fear', intensity: 'low', name: '불안', name_kr_full: '불안 (두려움)', color: '#818CF8', emoji: '😟', intensity_kr:'낮음' },
  fear_fear:        { base: 'fear', intensity: 'medium', name: '두려움', name_kr_full: '두려움', color: '#818CF8', emoji: '😨', intensity_kr:'중간' },
  fear_terror:      { base: 'fear', intensity: 'high', name: '공포', name_kr_full: '공포 (두려움)', color: '#4F46E5', emoji: '😱', intensity_kr:'높음' },

  surprise_distraction: { base: 'surprise', intensity: 'low', name: '산만', name_kr_full: '산만 (놀람)', color: '#38BDF8', emoji: '🤔', intensity_kr:'낮음' },
  surprise_surprise:    { base: 'surprise', intensity: 'medium', name: '놀람', name_kr_full: '놀람', color: '#38BDF8', emoji: '😮', intensity_kr:'중간' },
  surprise_amazement:   { base: 'surprise', intensity: 'high', name: '경탄', name_kr_full: '경탄 (놀람)', color: '#0284C7', emoji: '😲', intensity_kr:'높음' },

  sadness_pensiveness:{ base: 'sadness', intensity: 'low', name: '우울', name_kr_full: '우울 (슬픔)', color: '#60A5FA', emoji: '😔', intensity_kr:'낮음' },
  sadness_sadness:    { base: 'sadness', intensity: 'medium', name: '슬픔', name_kr_full: '슬픔', color: '#60A5FA', emoji: '😢', intensity_kr:'중간' },
  sadness_grief:      { base: 'sadness', intensity: 'high', name: '비탄', name_kr_full: '비탄 (슬픔)', color: '#2563EB', emoji: '😭', intensity_kr:'높음' },

  disgust_boredom:  { base: 'disgust', intensity: 'low', name: '지루함', name_kr_full: '지루함 (혐오)', color: '#A78BFA', emoji: '😒', intensity_kr:'낮음' },
  disgust_disgust:  { base: 'disgust', intensity: 'medium', name: '혐오', name_kr_full: '혐오', color: '#A78BFA', emoji: '🤢', intensity_kr:'중간' },
  disgust_loathing: { base: 'disgust', intensity: 'high', name: '증오', name_kr_full: '증오 (혐오)', color: '#7C3AED', emoji: '🤮', intensity_kr:'높음' },

  anger_annoyance:  { base: 'anger', intensity: 'low', name: '짜증', name_kr_full: '짜증 (분노)', color: '#F87171', emoji: '😠', intensity_kr:'낮음' },
  anger_anger:      { base: 'anger', intensity: 'medium', name: '분노', name_kr_full: '분노', color: '#F87171', emoji: '😡', intensity_kr:'중간' },
  anger_rage:       { base: 'anger', intensity: 'high', name: '격노', name_kr_full: '격노 (분노)', color: '#DC2626', emoji: '🤬', intensity_kr:'높음' },

  anticipation_interest:  { base: 'anticipation', intensity: 'low', name: '관심', name_kr_full: '관심 (기대)', color: '#2DD4BF', emoji: '🧐', intensity_kr:'낮음' },
  anticipation_anticipation:{ base: 'anticipation', intensity: 'medium', name: '기대', name_kr_full: '기대', color: '#2DD4BF', emoji: '🤔', intensity_kr:'중간' },
  anticipation_vigilance: { base: 'anticipation', intensity: 'high', name: '경계', name_kr_full: '경계 (기대)', color: '#0D9488', emoji: '🕵️', intensity_kr:'높음' },
};

const baseEmotionOrder = ['joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation'];
const intensityOrder = ['low', 'medium', 'high'];

/* -------------------- DIARY UI -------------------- */
let selectedBase = null;
let selectedEmotionKey = null;

const emotionSelector = $("#emotionSelector");
const intensityRow = $("#intensityRow");
const intensityButtons = $("#intensityButtons");

function renderBaseEmotions(container, onSelectBase, selectedBaseKey){
  container.innerHTML = "";
  baseEmotionOrder.forEach(base => {
    // find medium intensity for display
    const key = Object.keys(plutchikEmotions).find(k => plutchikEmotions[k].base === base && plutchikEmotions[k].intensity === 'medium');
    const info = plutchikEmotions[key];
    const btn = document.createElement('button');
    btn.className = 'emotion-btn';
    if(base === selectedBaseKey) btn.classList.add('selected');
    btn.style.borderColor = 'rgba(255,255,255,.12)';
    btn.style.background = 'rgba(255,255,255,.06)';
    btn.innerHTML = `<div class="emotion-emoji" style="font-size:1.5rem">${info.emoji}</div><div class="emotion-name" style="color:#121212;background:linear-gradient(135deg, rgba(255,255,255,.85), rgba(255,255,255,.7)); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">${info.name_kr_full.split(' ')[0]}</div>`;
    btn.addEventListener('click', () => onSelectBase(base));
    container.appendChild(btn);
  });
}

function renderIntensityButtons(baseKey, container, onSelect, selectedKey){
  container.innerHTML = "";
  intensityOrder.forEach(inten => {
    const fullKey = Object.keys(plutchikEmotions).find(k => plutchikEmotions[k].base === baseKey && plutchikEmotions[k].intensity === inten);
    const info = plutchikEmotions[fullKey];
    const b = document.createElement('button');
    b.className = 'intensity-btn' + (selectedKey === fullKey ? ' selected' : '');
    b.textContent = `${info.name} (${info.intensity_kr})`;
    b.addEventListener('click', ()=> onSelect(fullKey));
    container.appendChild(b);
  });
}

// initial render
renderBaseEmotions(emotionSelector, (base)=>{
  selectedBase = base;
  intensityRow.hidden = false;
  renderBaseEmotions(emotionSelector, (b)=>{
    selectedBase = b;
    renderIntensityButtons(selectedBase, intensityButtons, (key)=>{ selectedEmotionKey = key; highlightSelection(); }, selectedEmotionKey);
  }, selectedBase);
  renderIntensityButtons(selectedBase, intensityButtons, (key)=>{ selectedEmotionKey = key; highlightSelection(); }, selectedEmotionKey);
}, selectedBase);

function highlightSelection(){
  // add selected class to base of selectedEmotionKey
  const base = selectedEmotionKey ? plutchikEmotions[selectedEmotionKey].base : selectedBase;
  renderBaseEmotions(emotionSelector, (b)=>{
    selectedBase = b;
    renderIntensityButtons(selectedBase, intensityButtons, (key)=>{ selectedEmotionKey = key; highlightSelection(); }, selectedEmotionKey);
  }, base);
  renderIntensityButtons(selectedBase, intensityButtons, (key)=>{ selectedEmotionKey = key; highlightSelection(); }, selectedEmotionKey);
}

/* -------------------- AI RESPONSE (local) -------------------- */
const aiTones = {
  default: { name: 'AI 자동 선택', style: '공감하는' },
  warm: { name: '따뜻하게', style: '따뜻하고 부드러운' },
  encouraging: { name: '격려하며', style: '용기를 북돋는' },
  humorous: { name: '재치있게', style: '가볍고 유머러스한' },
  insightful: { name: '통찰력 있게', style: '차분하고 통찰력 있는' }
};

function generateAiResponse(emotionKey, memo, toneKey='default'){
  const emo = plutchikEmotions[emotionKey];
  const tone = aiTones[toneKey] || aiTones.default;
  const emoName = emo?.name_kr_full || '오늘';
  const emoEmoji = emo?.emoji || '✨';
  const clean = (s)=> (s||'').trim().slice(0, 240);
  const note = clean(memo);

  const opening = {
    joy: `지금 마음에 빛이 퍼지고 있어요 ${emoEmoji}`,
    trust: `스스로와 세상을 신뢰하는 느낌이 와닿네요 ${emoEmoji}`,
    fear: `불안과 두려움 속에서도 숨을 고른 당신, 충분히 잘하고 있어요 ${emoEmoji}`,
    surprise: `예상치 못한 파도가 스쳐갔군요 ${emoEmoji}`,
    sadness: `마음이 무거운 날엔 그대로 머물러도 괜찮아요 ${emoEmoji}`,
    disgust: `거슬리는 감정이 올라올 땐 거리를 두는 것도 돌봄이에요 ${emoEmoji}`,
    anger: `분노는 경계가 필요하다는 신호예요 ${emoEmoji}`,
    anticipation: `좋은 기대가 잔잔히 모이고 있네요 ${emoEmoji}`,
  }[emo?.base || 'joy'];

  const middle = note
    ? `당신의 메모를 읽으며 느꼈어요: “${note}”. 이 감정은 충분히 타당하고, 지금의 나를 보호하려는 자연스러운 반응이에요.`
    : `짧게라도 마음을 적어두면, 나중에 스스로에게 큰 단서가 되어 줄 거예요.`;

  const closing = {
    warm: `오늘은 스스로에게 조금 더 다정해도 좋아요. 따뜻한 물 한 잔과 함께, 숨을 길게 내쉬어 볼까요?`,
    encouraging: `한 걸음만 더, 지금의 리듬으로 충분해요. 작은 실천이 내일의 나를 바꿉니다!`,
    humorous: `마음 날씨가 살짝 흐려도, 우산은 우리에게 있잖아요 ☔️ 내일은 분명 맑음 확률 73%쯤?!`,
    insightful: `감정은 방향을 알려주는 나침반이에요. 오늘의 신호를 간직해 두면, 다음 선택이 한결 선명해집니다.`,
    default: `오늘의 감정을 잘 기록하셨어요. 이 기록이 쌓이면 당신만의 길이 더 분명해질 거예요.`
  }[toneKey] || aiTones.default;

  return `${opening}\n${middle}\n${closing}`;
}

/* -------------------- DIARY ENTRIES -------------------- */
const yearMonthFilter = $("#yearMonthFilter");
const entriesList = $("#entriesList");
const memoEl = $("#memo");
const aiToneEl = $("#aiTone");
const aiBox = $("#aiResponseBox");
const aiBody = $("#aiResponse");

function getAvailableYearMonths(entries){
  const set = new Set(entries.map(e => {
    const d = new Date(e.date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }));
  return Array.from(set).sort().reverse();
}

function populateYearMonthFilter(){
  const entries = Storage.getDiary();
  const list = getAvailableYearMonths(entries);
  yearMonthFilter.innerHTML = '<option value="">전체</option>' + list.map(ym => `<option value="${ym}">${ym.replace('-','년 ')}월</option>`).join('');
}

function filteredEntries(){
  const entries = Storage.getDiary();
  const ym = yearMonthFilter.value;
  if(!ym) return entries;
  return entries.filter(e => {
    const d = new Date(e.date);
    const test = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return test === ym;
  });
}

function renderEntries(){
  const items = filteredEntries();
  if(items.length === 0){
    entriesList.innerHTML = `<div class="microcopy">아직 기록이 없습니다. 오늘의 감정을 남겨보세요 😊</div>`;
    return;
  }
  entriesList.innerHTML = "";
  items.forEach(e => {
    const info = plutchikEmotions[e.emotion] || {};
    const wrap = document.createElement('div'); wrap.className = 'entry';
    wrap.innerHTML = `
      <div class="entry-head">
        <div class="entry-left">
          <div class="entry-emoji">${info.emoji||'✨'}</div>
          <div>
            <div class="entry-title">${info.name_kr_full||'감정'} <span class="entry-date">· ${new Date(e.date).toLocaleString()}</span></div>
            ${e.aiTone ? `<div class="microcopy">${aiTones[e.aiTone]?.name || ''}</div>` : ''}
          </div>
        </div>
        <div class="entry-actions">
          <button class="icon-btn" title="수정" data-edit="${e.id}">✎</button>
          <button class="icon-btn" title="삭제" data-del="${e.id}">🗑️</button>
        </div>
      </div>
      ${e.memo ? `<div class="entry-body">${escapeHtml(e.memo)}</div>` : ''}
      ${e.aiResponse ? `<div class="ai-box"><div class="ai-title">AI 응답</div><div class="ai-body">${escapeHtml(e.aiResponse)}</div></div>` : ''}
    `;
    entriesList.appendChild(wrap);
  });
}

$("#clearFilter").addEventListener('click', ()=>{ yearMonthFilter.value=""; renderEntries(); });
yearMonthFilter.addEventListener('change', renderEntries);

// Save diary (Ctrl/Cmd+Enter)
$("#saveDiary").addEventListener('click', saveDiaryEntry);
memoEl.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); saveDiaryEntry(); }
});
$("#clearDiary").addEventListener('click', ()=>{ memoEl.value = ''; selectedEmotionKey=null; selectedBase=null; highlightSelection(); aiBox.hidden = true; });

function saveDiaryEntry(){
  if(!selectedEmotionKey){ toast('오늘의 감정을 먼저 선택해주세요.'); return; }
  const memo = memoEl.value.trim();
  const tone = aiToneEl.value;
  const aiResponse = generateAiResponse(selectedEmotionKey, memo, tone);
  const entry = {
    id: cryptoRandomId(),
    date: new Date().toISOString(),
    emotion: selectedEmotionKey,
    memo,
    aiTone: tone,
    aiResponse
  };
  Storage.addDiary(entry);
  aiBody.textContent = aiResponse;
  aiBox.hidden = false;
  memoEl.value = '';
  selectedEmotionKey=null; selectedBase=null; highlightSelection();
  populateYearMonthFilter();
  renderEntries();
  renderCalendar();
  renderInsights();
  toast('감정이 기록되었습니다! 💾');
}

entriesList.addEventListener('click', (e)=>{
  const editId = e.target.getAttribute('data-edit');
  const delId = e.target.getAttribute('data-del');
  if(editId){ openEditModal(editId); }
  if(delId){ deleteEntry(delId); }
});

function deleteEntry(id){
  const entries = Storage.getDiary();
  const idx = entries.findIndex(x=>x.id===id);
  if(idx === -1) return;
  const removed = entries.splice(idx,1)[0];
  Storage.setDiary(entries);
  renderEntries(); renderCalendar(); renderInsights();
  const undo = confirm('기록을 삭제했습니다. 실행을 취소하시겠습니까?');
  if(undo){
    entries.splice(idx,0,removed);
    Storage.setDiary(entries);
    renderEntries(); renderCalendar(); renderInsights();
    toast('삭제를 취소했어요.');
  } else {
    toast('삭제되었습니다.');
  }
}

/* -------------------- EDIT MODAL -------------------- */
const modal = $("#modal");
const modalClose = $("#modalClose");
const modalCancel = $("#modalCancel");
const modalSave = $("#modalSave");
const modalMemo = $("#modalMemo");
const modalTone = $("#modalTone");
const modalEmotionGrid = $("#modalEmotion");
const modalIntensityRow = $("#modalIntensityRow");
const modalIntensityButtons = $("#modalIntensityButtons");

let editingId = null;
let modalSelectedBase = null;
let modalSelectedEmotionKey = null;

function openEditModal(id){
  const entries = Storage.getDiary();
  const entry = entries.find(x=>x.id===id);
  if(!entry) return;
  editingId = id;
  modalMemo.value = entry.memo || '';
  modalTone.value = entry.aiTone || 'default';
  modalSelectedEmotionKey = entry.emotion;
  modalSelectedBase = plutchikEmotions[entry.emotion]?.base || null;
  modalEmotionGrid.innerHTML = '';
  renderBaseEmotions(modalEmotionGrid, (b)=>{
    modalSelectedBase = b;
    modalIntensityRow.hidden = false;
    renderIntensityButtons(modalSelectedBase, modalIntensityButtons, (key)=>{ modalSelectedEmotionKey = key; openEditModal(id); }, modalSelectedEmotionKey);
  }, modalSelectedBase);
  modalIntensityRow.hidden = false;
  renderIntensityButtons(modalSelectedBase, modalIntensityButtons, (key)=>{ modalSelectedEmotionKey = key; openEditModal(id); }, modalSelectedEmotionKey);
  modal.hidden = false;
}

function closeEditModal(){ modal.hidden = true; editingId = null; }

modalClose.addEventListener('click', closeEditModal);
modalCancel.addEventListener('click', closeEditModal);
modal.addEventListener('click', (e)=>{ if(e.target === modal) closeEditModal(); });

modalSave.addEventListener('click', ()=>{
  const entries = Storage.getDiary();
  const idx = entries.findIndex(x=>x.id===editingId);
  if(idx === -1) return;
  const memo = modalMemo.value.trim();
  const tone = modalTone.value;
  const needRegen = memo !== entries[idx].memo || tone !== entries[idx].aiTone || modalSelectedEmotionKey !== entries[idx].emotion || !entries[idx].aiResponse;
  const aiResponse = needRegen ? generateAiResponse(modalSelectedEmotionKey, memo, tone) : entries[idx].aiResponse;
  entries[idx] = { ...entries[idx], memo, aiTone: tone, emotion: modalSelectedEmotionKey, aiResponse };
  Storage.setDiary(entries);
  closeEditModal();
  renderEntries(); renderCalendar(); renderInsights();
  toast('기록이 수정되었습니다.');
});

/* -------------------- CALENDAR -------------------- */
const calendarTitle = $("#calendarTitle");
const calendarGrid = $("#calendarGrid");
const prevMonthBtn = $("#prevMonth");
const nextMonthBtn = $("#nextMonth");
const dayDetail = $("#calendarDayDetail");
const dayDetailTitle = $("#dayDetailTitle");
const dayEntries = $("#dayEntries");
const closeDayDetail = $("#closeDayDetail");
closeDayDetail.addEventListener('click', ()=> dayDetail.hidden = true);

let currentCal = new Date();
function renderCalendar(){
  const entries = Storage.getDiary();
  const year = currentCal.getFullYear();
  const month = currentCal.getMonth();
  calendarTitle.textContent = `${year}년 ${month+1}월`;
  calendarGrid.innerHTML = "";
  // Build grid start Sunday end Saturday
  const start = new Date(year, month, 1);
  const end = new Date(year, month+1, 0);
  const gridStart = new Date(start); gridStart.setDate(1 - start.getDay()); // to Sunday
  const gridEnd = new Date(end); gridEnd.setDate(end.getDate() + (6 - end.getDay()));
  let d = new Date(gridStart);
  while(d <= gridEnd){
    const cell = document.createElement('div'); cell.className = 'cal-cell';
    if(d.getMonth() !== month) cell.classList.add('dim');
    const nice = `${d.getMonth()+1}/${d.getDate()}`;
    cell.innerHTML = `<div class="date">${nice}</div>`;
    const dayStr = d.toDateString();
    // find latest entry for that day
    const todays = entries.filter(e => (new Date(e.date)).toDateString() === dayStr)
                          .sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(todays[0]){
      const info = plutchikEmotions[todays[0].emotion];
      const em = document.createElement('div'); em.className='emoji'; em.textContent = info?.emoji || '✨';
      cell.appendChild(em);
    }
    cell.addEventListener('click', ()=> openDayDetail(new Date(d)));
    calendarGrid.appendChild(cell);
    d.setDate(d.getDate()+1);
  }
}

function openDayDetail(date){
  const entries = Storage.getDiary();
  const list = entries.filter(e => (new Date(e.date)).toDateString() === date.toDateString());
  dayEntries.innerHTML = "";
  if(list.length === 0){
    dayEntries.innerHTML = `<div class="microcopy">이 날짜에는 기록이 없습니다.</div>`;
  } else {
    list.forEach(e => {
      const info = plutchikEmotions[e.emotion] || {};
      const wrap = document.createElement('div'); wrap.className = 'entry';
      wrap.innerHTML = `
        <div class="entry-head">
          <div class="entry-left">
            <div class="entry-emoji">${info.emoji||'✨'}</div>
            <div>
              <div class="entry-title">${info.name_kr_full||'감정'} <span class="entry-date">· ${new Date(e.date).toLocaleTimeString()}</span></div>
            </div>
          </div>
          <div class="entry-actions">
            <button class="icon-btn" title="수정" data-edit="${e.id}">✎</button>
            <button class="icon-btn" title="삭제" data-del="${e.id}">🗑️</button>
          </div>
        </div>
        ${e.memo ? `<div class="entry-body">${escapeHtml(e.memo)}</div>` : ''}
        ${e.aiResponse ? `<div class="ai-box"><div class="ai-title">AI 응답</div><div class="ai-body">${escapeHtml(e.aiResponse)}</div></div>` : ''}
      `;
      dayEntries.appendChild(wrap);
    });
  }
  dayDetailTitle.textContent = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  dayDetail.hidden = false;
}

prevMonthBtn.addEventListener('click', ()=>{ currentCal.setMonth(currentCal.getMonth()-1); renderCalendar(); });
nextMonthBtn.addEventListener('click', ()=>{ currentCal.setMonth(currentCal.getMonth()+1); renderCalendar(); });

/* -------------------- STATS / INSIGHTS -------------------- */
function calculateLongestStreak(entries){
  if(entries.length === 0) return 0;
  const uniqueDays = Array.from(new Set(entries.map(e => (new Date(e.date)).toDateString())))
    .map(s => new Date(s)).sort((a,b)=>a-b);
  if(uniqueDays.length === 0) return 0;
  let longest = 1, current = 1;
  for(let i=1;i<uniqueDays.length;i++){
    const prev = uniqueDays[i-1], cur = uniqueDays[i];
    const diff = (cur - prev) / (1000*60*60*24);
    if(diff === 1){ current++; } else { longest = Math.max(longest, current); current = 1; }
  }
  return Math.max(longest, current);
}

function calculateCurrentConsecutiveDays(entries){
  if(entries.length === 0) return 0;
  const days = Array.from(new Set(entries.map(e => (new Date(e.date)).toDateString())))
    .map(s => new Date(s)).sort((a,b)=>b-a); // desc
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  if(days.length === 0) return 0;
  const last = new Date(days[0]); last.setHours(0,0,0,0);
  if(last.getTime() !== today.getTime() && last.getTime() !== yesterday.getTime()) return 0;
  let streak = 1;
  for(let i=0;i<days.length-1;i++){
    const cur = new Date(days[i]); cur.setHours(0,0,0,0);
    const next = new Date(days[i+1]); next.setHours(0,0,0,0);
    const expected = new Date(cur); expected.setDate(cur.getDate()-1);
    if(next.getTime() === expected.getTime()){ streak++; } else { break; }
  }
  return streak;
}

function renderInsights(){
  // existing trend chart (session gauge history)
  const canvas = $("#trendChart"), ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.beginPath(); ctx.moveTo(40,10); ctx.lineTo(40,h-30); ctx.lineTo(w-10,h-30); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  for(let i=0;i<5;i++){ const y = 10 + i*(h-40)/4; ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(w-10,y); ctx.stroke(); }
  const sessions = Storage.getSessions().slice(-60);
  if(sessions.length){
    const grad = ctx.createLinearGradient(40,0,w-10,0); grad.addColorStop(0,'#7C83FF'); grad.addColorStop(1,'#9B5DE5');
    ctx.beginPath();
    sessions.forEach((p,i)=>{
      const x = 40 + i * ((w-60)/(sessions.length-1 || 1));
      const y = (h-30) - (p.value/100)*(h-40);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke();
  }

  // tiles from diary
  const entries = Storage.getDiary();
  const tiles = $("#statsTiles"); tiles.innerHTML = "";
  const addTile = (label, value) => {
    const t = document.createElement('div'); t.className = 'tile';
    t.innerHTML = `<div class="t-label">${label}</div><div class="t-value">${value}</div>`;
    tiles.appendChild(t);
  };
  addTile('총 기록 수', entries.length);
  addTile('메모 포함 기록', entries.filter(e=>e.memo && e.memo.trim()!=='').length);
  addTile('현재 연속 기록', calculateCurrentConsecutiveDays(entries) + '일');
  addTile('최장 연속 기록', calculateLongestStreak(entries) + '일');

  // frequency by base emotion (bar via canvas)
  const freqCanvas = $("#freqChart"), fctx = freqCanvas.getContext('2d');
  fctx.clearRect(0,0,freqCanvas.width,freqCanvas.height);
  const baseCounts = baseEmotionOrder.map(base => ({
    base, count: entries.filter(e => plutchikEmotions[e.emotion]?.base === base).length
  })).filter(x=>x.count>0);
  const maxCount = Math.max(1, ...baseCounts.map(x=>x.count));
  const barW = (freqCanvas.width - 80) / Math.max(1, baseCounts.length);
  baseCounts.forEach((item, i)=>{
    const x = 60 + i*barW;
    const h = (freqCanvas.height - 60) * (item.count/maxCount);
    const y = (freqCanvas.height - 40) - h;
    const key = Object.keys(plutchikEmotions).find(k => plutchikEmotions[k].base === item.base && plutchikEmotions[k].intensity === 'medium');
    const color = plutchikEmotions[key]?.color || '#7C83FF';
    fctx.fillStyle = color; fctx.fillRect(x, y, barW*0.7, h);
    fctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#E6E6F0';
    fctx.font = '600 12px Inter'; fctx.fillText(plutchikEmotions[key].name_kr_full.split(' ')[0], x, freqCanvas.height-20);
    fctx.fillText(item.count+'회', x, y-6);
  });

  // 30-day dot map
  const dotWrap = $("#dotMap"); dotWrap.innerHTML = "";
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i=29;i>=0;i--){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const dayEntries = entries.filter(e => (new Date(e.date)).toDateString() === d.toDateString());
    let color = 'rgba(255,255,255,.12)'; let emoji = '';
    if(dayEntries[0]){
      const info = plutchikEmotions[dayEntries[0].emotion]; // latest
      color = hexToRgba(info?.color || '#7C83FF', .9);
      emoji = info?.emoji || '';
    }
    const cell = document.createElement('div'); cell.className = 'dot'; cell.style.background = color;
    cell.innerHTML = `<div class="tip">${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${emoji}</div>`;
    dotWrap.appendChild(cell);
  }
}

function hexToRgba(hex, alpha=1){ 
  const h = hex.replace('#',''); const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------- BACKUP / RESTORE -------------------- */
$("#backupBtn").addEventListener('click', ()=>{
  const entries = Storage.getDiary();
  if(entries.length === 0){ toast('백업할 기록이 없습니다.'); return; }
  const blob = new Blob([JSON.stringify(entries, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `emotion-diary-backup-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('백업 파일을 다운로드했어요.');
});
$("#restoreBtn").addEventListener('click', ()=> $("#restoreInput").click());
$("#restoreInput").addEventListener('change', (evt)=>{
  const file = evt.target.files?.[0]; if(!file){ return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!Array.isArray(data)) throw new Error('형식 오류');
      // simple validation
      const ok = data.every(x => x.id && x.date && x.emotion);
      if(!ok) throw new Error('레코드 구조 오류');
      if(!confirm('현재 기록을 덮어쓰고 복원하시겠습니까?')) return;
      Storage.setDiary(data.sort((a,b)=> new Date(b.date) - new Date(a.date)));
      populateYearMonthFilter(); renderEntries(); renderCalendar(); renderInsights();
      toast('복원했습니다.');
    }catch(err){ console.error(err); toast('복원 중 오류가 발생했습니다.'); }
  };
  reader.readAsText(file);
});

/* -------------------- STUDIO (v1) -------------------- */
// Keyword extraction & emotion analysis (very naive)
const STOPWORDS = new Set(["그리고","하지만","그러나","그래서","오늘","정말","조금","너무","매우","나는","제가","그","이","저","것","에서","으로","하다","합니다","했다","합니다.","the","and","but","or","so","to","a","an","in","on","of","it","is"]);
const POSITIVE = ["행복","기쁨","좋다","사랑","감사","설렘","미소","희망","편안","축복","빛","sunny","happy","love","grateful","smile","hope","calm","peace","joy","excited","delight"];
const NEGATIVE = ["슬픔","외롭","우울","불안","화가","분노","지치","어둠","눈물","상실","그립","pain","sad","lonely","anxious","anger","mad","tired","dark","cry","loss"];

function analyzeEmotion(text){
  const t = text.toLowerCase();
  let score = 0;
  POSITIVE.forEach(w => { if(t.includes(w)) score += 1; });
  NEGATIVE.forEach(w => { if(t.includes(w)) score -= 1; });
  const clamp = (v,min,max)=> Math.min(max, Math.max(min, v));
  let val = clamp(50 + score*12, 0, 100);
  let label = "차분";
  if(val >= 66) label = "기쁨";
  else if(val <= 34) label = "우울";
  else label = "차분";
  return { value: val, label };
}

function extractKeywords(text){
  const tokens = text.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).map(s=>s.trim()).filter(Boolean);
  const counts = new Map();
  tokens.forEach(w => {
    if(w.length<2 || STOPWORDS.has(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);
}

// Gauge
function drawGauge(canvas, value){
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w/2, cy = h/2, r = Math.min(w,h)/2 - 8;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.arc(cx,cy,r, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 10; ctx.stroke();
  const start = -Math.PI/2;
  const end = start + Math.PI*2 * (value/100);
  const grad = ctx.createLinearGradient(0,0,w,h); grad.addColorStop(0, '#7C83FF'); grad.addColorStop(1,'#9B5DE5');
  ctx.beginPath(); ctx.arc(cx,cy,r, start, end); ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#E6E6F0';
  ctx.font = '600 16px Inter, system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(`${Math.round(value)}`, cx, cy);
}

// Poem & Music & Visual engines (from v1)
const Poem = {
  titleFrom(text){
    const keys = extractKeywords(text);
    if(keys[0]) return keys[0] + "에 대하여";
    return (text.trim().split(/[\n\.]/)[0] || "제목 미정").slice(0,22);
  },
  generate(text, style, moodLabel){
    const lines = [];
    const images = ["빛", "그늘", "바람", "창가", "숨결", "파도", "별빛", "거울", "흔적"];
    const pick = (arr)=> arr[Math.floor(Math.random()*arr.length)];
    const moodWord = moodLabel === "기쁨" ? "따스한" : (moodLabel === "우울" ? "서늘한" : "잔잔한");
    const tokens = extractKeywords(text);
    const kw1 = tokens[0] || pick(images), kw2 = tokens[1] || pick(images), kw3 = tokens[2] || pick(images);
    if(style === 'haiku'){
      lines.push(`${kw1} 위에 ${moodWord} 숨`); lines.push(`${kw2} 사이로 흐르는 마음`); lines.push(`${kw3} 한 줌, 나`);
    } else if(style === 'sonnet'){
      const fragments = [
        `나는 ${kw1} 곁에서 하루를 접고,`,
        `${moodWord} 오후가 창에 걸릴 때,`,
        `${kw2}의 기억이 조용히 번지고,`,
        `비워둔 칸에 너의 이름이 흐른다.`,
        ``,
        `밤은 길었고 별은 낮게 떨며,`,
        `우리는 아주 작은 약속이 된다.`,
        `말하지 못한 말들은 문장 밖에서,`,
        `${kw3}처럼 오래 남아 나를 비춘다.`,
        ``,
        `만약 내일이 온다면, 나는 또,`,
        `${kw1}을 쓰다가 너를 떠올릴 테지.`,
        `슬픔도 기쁨도 다 너의 변주라서,`,
        `끝내 한 편의 시가 되어 흐른다.`
      ];
      return fragments.join("\n");
    } else if(style === 'rap'){
      lines.push(`Yo, ${kw1} beat 위에 drop, 마음의 log`);
      lines.push(`감정은 ${moodWord} tone, 올라가 like prog`);
      lines.push(`${kw2} 기억들을 rhyme, 박자에다 sew`);
      lines.push(`오늘의 나를 spit, 내일의 나를 grow`);
      lines.push(`hook: ${kw3} ${kw3} yeah we glow`);
    } else if(style === 'lyric'){
      lines.push(`${kw1} 위로 흩어진 말들,`);
      lines.push(`손끝에 남아, 밤새 반짝인다.`);
      lines.push(`${kw2} 같은 웃음 하나,`);
      lines.push(`멀리서도 내게 돌아오는 길.`);
      lines.push(' ');
      lines.push(`너를 부르면, ${kw3}이 흔들리고,`);
      lines.push(`내 맘의 선율은 조용히 커진다.`);
    } else {
      const fragments = [
        `오늘의 문장 사이, ${kw1} 한 줌을 끼워두고,`,
        `나는 ${moodWord} 호흡으로 하루를 넘겼다.`,
        `${kw2}의 가장자리에서 조금 멈추었다가,`,
        `다시 걷는다, 나를 닮은 속도로.`,
        ``,
        `가끔은 ${kw3}처럼 반짝였고,`,
        `가끔은 환한 빈칸으로 남았다.`,
        `그 모든 사이에서 나는 조금씩,`,
        `내가 된다.`
      ];
      return fragments.join("\n");
    }
    return lines.join("\n");
  }
};

const Music = {
  async render({genre='lofi', mood='차분', seconds=15}){
    const sr = 22050, ch = 1;
    const length = sr * seconds;
    const ctx = new OfflineAudioContext(ch, length, sr);
    const pad = ctx.createOscillator();
    pad.type = (genre==='synth') ? 'sawtooth' : (genre==='piano' ? 'triangle' : 'sine');
    const padGain = ctx.createGain(); padGain.gain.value = 0.0; pad.connect(padGain).connect(ctx.destination);
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.22;
    const fb = ctx.createGain(); fb.gain.value = 0.25; padGain.connect(delay).connect(ctx.destination); delay.connect(fb).connect(delay);
    pad.start(0);
    const baseFreq = (mood==='우울') ? 220.0 : 261.63;
    const chords = (mood==='우울') ? [ [0,3,7], [2,5,9], [3,7,10], [5,8,12] ] : [ [0,4,7], [5,9,12], [7,11,14], [4,7,12] ];
    const chordDur = seconds / chords.length;
    const mel = ctx.createOscillator(); mel.type = genre==='lofi' ? 'triangle' : 'square';
    const melGain = ctx.createGain(); melGain.gain.value = 0.0; mel.connect(melGain).connect(ctx.destination); mel.start(0);
    for(let i=0;i<chords.length;i++){
      const t0 = i*chordDur; const chord = chords[i];
      const avgSemitone = chord.reduce((a,b)=>a+b,0)/chord.length;
      const freq = baseFreq * Math.pow(2, avgSemitone/12);
      pad.frequency.setValueAtTime(freq, t0);
      padGain.gain.cancelScheduledValues(t0);
      padGain.gain.setTargetAtTime(0.22, t0, .3);
      padGain.gain.setTargetAtTime(0.0, t0 + chordDur - 0.35, .25);
      let step = 0.5;
      for(let tt=t0; tt<t0+chordDur; tt+=step){
        const semi = chord[Math.floor(Math.random()*chord.length)] + (Math.random()<0.3 ? 12:0);
        const f = baseFreq * Math.pow(2, semi/12);
        mel.frequency.setValueAtTime(f, tt);
        melGain.gain.cancelScheduledValues(tt);
        melGain.gain.setValueAtTime(0.0, tt);
        melGain.gain.linearRampToValueAtTime(0.22, tt+0.02);
        melGain.gain.exponentialRampToValueAtTime(0.0001, tt + step*0.8);
      }
    }
    const buffer = await ctx.startRendering();
    const wav = audioBufferToWav(buffer);
    return wav;
  }
};

function audioBufferToWav(buffer){
  const numOfChan = buffer.numberOfChannels, sampleRate = buffer.sampleRate;
  const format = 1; const bitDepth = 16;
  const samples = buffer.getChannelData(0);
  const blockAlign = numOfChan * bitDepth/8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bitDepth/8;
  const bufferLen = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferLen);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  function writeString(s){ for(let i=0;i<s.length;i++) view.setUint8(offset+i, s.charCodeAt(i)); offset += s.length; }
  function writeUint32(d){ view.setUint32(offset, d, true); offset += 4; }
  function writeUint16(d){ view.setUint16(offset, d, true); offset += 2; }
  writeString('RIFF'); writeUint32(36 + dataSize); writeString('WAVE'); writeString('fmt ');
  writeUint32(16); writeUint16(format); writeUint16(numOfChan); writeUint32(sampleRate); writeUint32(byteRate); writeUint16(blockAlign); writeUint16(bitDepth);
  writeString('data'); writeUint32(dataSize);
  let idx = 44; const tmp = new Int16Array(arrayBuffer, idx, samples.length);
  for(let i=0;i<samples.length;i++){ let s = Math.max(-1, Math.min(1, samples[i])); tmp[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
  return new Blob([arrayBuffer], {type:'audio/wav'});
}

// Visual Engine
const Visual = {
  draw(canvas, mood="차분", seed=Date.now()){
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0,0,w,h);
    if(mood==='기쁨'){ g.addColorStop(0,'#ff9a9e'); g.addColorStop(1,'#fad0c4'); }
    else if(mood==='우울'){ g.addColorStop(0,'#0f2027'); g.addColorStop(1,'#2c5364'); }
    else { g.addColorStop(0,'#667eea'); g.addColorStop(1,'#764ba2'); }
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    const rng = mulberry32(seed % 0xFFFFFFFF); const orbs = 12;
    for(let i=0;i<orbs;i++){
      const x = rng()*w, y = rng()*h; const r = 40 + rng()*120;
      const hue = mood==='기쁨' ? 40 + rng()*60 : (mood==='우울' ? 200 + rng()*40 : 270 + rng()*30);
      const grd = ctx.createRadialGradient(x,y,0,x,y,r);
      grd.addColorStop(0, `hsla(${hue}, 85%, 70%, .55)`); grd.addColorStop(1, `hsla(${hue}, 85%, 50%, 0)`);
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,.03)';
    for(let y=0;y<h; y+=3) ctx.fillRect(0,y,w,1);
    ctx.globalCompositeOperation = 'source-over';
  }
};

function mulberry32(a){ return function() { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }

/* -------------------- STUDIO UI (v1) -------------------- */
$("#exportProject").addEventListener('click', (e)=>{
  const data = { works: Storage.getWorks(), sessions: Storage.getSessions(), diary: Storage.getDiary() };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  $("#exportProject").href = url;
  toast('프로젝트를 JSON으로 내보냈어요');
});

const diaryEl = $("#diary");
const gaugeCanvas = $("#gauge");
const emoText = $("#emotionText");
const keywordsEl = $("#keywords");

function updateAnalysis(){
  const text = diaryEl.value;
  const emo = analyzeEmotion(text);
  drawGauge(gaugeCanvas, emo.value);
  emoText.textContent = `${emo.label} (${Math.round(emo.value)})`;
  const keys = extractKeywords(text);
  keywordsEl.innerHTML = "";
  keys.forEach(k=>{ const chip = document.createElement('span'); chip.className='chip'; chip.textContent = k; keywordsEl.appendChild(chip); });
  Storage.saveSessions({ value: emo.value, at: Date.now() });
}
diaryEl.addEventListener('input', updateAnalysis);
updateAnalysis();

$("#genPoem").addEventListener('click', () => {
  const text = diaryEl.value.trim();
  if(!text){ toast('먼저 일기를 적어주세요'); return; }
  const emo = analyzeEmotion(text);
  const style = $("#poemStyle").value;
  const poem = Poem.generate(text, style, emo.label);
  const title = Poem.titleFrom(text);
  $("#poemOutput").textContent = poem;
  $("#poemTitle").textContent = title;
  toast('시를 생성했어요 ✨');
});

let lastWavUrl = null;
$("#genMusic").addEventListener('click', async () => {
  try{
    $("#downloadWAV").disabled = true;
    const text = diaryEl.value.trim();
    const emo = analyzeEmotion(text);
    const genre = $("#musicGenre").value;
    const seconds = parseInt($("#musicLen").value, 10) || 15;
    const wavBlob = await Music.render({genre, mood: emo.label, seconds});
    if(lastWavUrl) URL.revokeObjectURL(lastWavUrl);
    lastWavUrl = URL.createObjectURL(wavBlob);
    $("#audioPlayer").src = lastWavUrl;
    $("#downloadWAV").onclick = ()=>{ const a = document.createElement('a'); a.href = lastWavUrl; a.download = 'hearts-melody.wav'; a.click(); };
    toast('음악을 생성했어요 🎵');
  }catch(err){ console.error(err); toast('음악 생성에 실패했어요'); }
  finally { $("#downloadWAV").disabled = false; }
});

$("#genVisual").addEventListener('click', () => {
  const text = diaryEl.value.trim();
  const emo = analyzeEmotion(text);
  const seed = Date.now();
  Visual.draw($("#bgCanvas"), emo.label, seed);
  $("#bgCanvas").dataset.seed = String(seed);
  toast('배경을 생성했어요 🖼️');
});

$("#downloadPNG").addEventListener('click', () => {
  const canvas = $("#bgCanvas");
  const w = canvas.width, h = canvas.height;
  const temp = document.createElement('canvas'); temp.width=w; temp.height=h;
  const ctx = temp.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#e9ecff';
  ctx.font = '700 40px "Playfair Display", Georgia, serif';
  ctx.fillText($("#poemTitle").textContent, 40, h-200);
  ctx.font = '500 20px Inter, system-ui';
  const body = $("#poemOutput").textContent.split('\n');
  let y = h-170;
  body.forEach(line => { ctx.fillText(line, 40, y); y+=24; });
  const url = temp.toDataURL('image/png');
  const a = document.createElement('a'); a.href=url; a.download='hearts-melody.png'; a.click();
  toast('PNG로 내보냈어요');
});

$("#saveWork").addEventListener('click', () => {
  const poem = $("#poemOutput").textContent.trim();
  if(!poem){ toast('시를 먼저 생성해주세요'); return; }
  const title = $("#poemTitle").textContent || '무제';
  const diary = diaryEl.value.trim();
  const { label } = analyzeEmotion(diary);
  const styleLabel = {free:'자유시', haiku:'하이쿠', sonnet:'소네트', lyric:'서정시', rap:'랩'}[$("#poemStyle").value];
  const seed = parseInt($("#bgCanvas").dataset.seed || Date.now(), 10);
  let audioUrl = $("#audioPlayer").src || null;
  Storage.saveWork({ id: cryptoRandomId(), title, poem, diary, mood: label, style: styleLabel, audioUrl, seed, createdAt: Date.now() });
  renderArchive(); toast('작품을 저장했어요 💾');
});

// Voice dictation
(() => {
  const btn = $("#dictateBtn");
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Speech){ btn.disabled = true; btn.textContent='🎙️ 음성 입력(미지원)'; return; }
  const rec = new Speech(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = true;
  let listening = false;
  rec.onresult = (evt) => { let text = ''; for(let i=evt.resultIndex; i<evt.results.length; i++){ text += evt.results[i][0].transcript; } diaryEl.value += (diaryEl.value ? ' ' : '') + text.trim(); updateAnalysis(); };
  rec.onend = () => { listening = false; btn.textContent = '🎙️ 음성 입력'; };
  btn.addEventListener('click', () => { if(!listening){ rec.start(); listening = true; btn.textContent='🛑 중지'; } else { rec.stop(); } });
})();

// Archive initial render & insights
function renderArchive(){
  const grid = $("#worksGrid"); grid.innerHTML = "";
  const works = Storage.getWorks();
  for(const w of works){
    const card = document.createElement('div'); card.className = 'work-card';
    const thumb = document.createElement('div'); thumb.className = 'work-thumb';
    const c = document.createElement('canvas'); c.width = 480; c.height = 270; thumb.appendChild(c);
    Visual.draw(c, w.mood, w.seed || 1);
    const body = document.createElement('div'); body.className = 'work-body';
    const title = document.createElement('div'); title.className = 'work-title'; title.textContent = w.title || '무제';
    const meta = document.createElement('div'); meta.className = 'work-meta'; meta.textContent = new Date(w.createdAt).toLocaleString();
    const act = document.createElement('div'); act.className = 'work-actions';
    const loadBtn = document.createElement('button'); loadBtn.className='pill-btn'; loadBtn.textContent='불러오기';
    const playBtn = document.createElement('button'); playBtn.className='pill-btn'; playBtn.textContent='듣기';
    loadBtn.addEventListener('click', () => {
      $("#poemTitle").textContent = w.title; $("#poemOutput").textContent = w.poem;
      Visual.draw($("#bgCanvas"), w.mood, w.seed || 1); if(w.audioUrl) $("#audioPlayer").src = w.audioUrl; toast('작품을 미리보기로 불러왔어요');
    });
    playBtn.addEventListener('click', ()=>{ if(w.audioUrl){ const a = new Audio(w.audioUrl); a.play(); } else toast('오디오가 없습니다'); });
    act.append(loadBtn, playBtn); body.append(title, meta); card.append(thumb, body, act); grid.appendChild(card);
  }
}
renderArchive();
renderInsights();
renderCalendar();
populateYearMonthFilter();
renderEntries();

// Accessibility
$$('.tab').forEach(tab => tab.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tab.click(); }
}));

// Helpers
function cryptoRandomId(){ return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function escapeHtml(s){ return s.replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// Initial background
Visual.draw($("#bgCanvas"), "차분", Date.now());
