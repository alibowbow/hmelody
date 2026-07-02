/**
 * Heart's Melody — Emotion diary + creative studio (vanilla JS, no deps)
 *
 * Sections:
 *   1. Small helpers (DOM, toast, ids, escaping)
 *   2. Safe localStorage store
 *   3. Emotion model (Plutchik) + reusable EmotionPicker component
 *   4. Local AI response generator
 *   5. Diary (compose / list / edit / delete-with-undo)
 *   6. Calendar
 *   7. Insights (trend, tiles, frequency, dot-map, written insights)
 *   8. Backup / restore + project export
 *   9. Studio engines (analysis, poem, music, visual) + UI
 *  10. Theme, tabs, bootstrap
 *
 * Everything is local: no network calls, AI text is generated on-device.
 */

/* ===================== 1. Helpers ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let toastTimer;
/** Show a transient toast. Optional action renders a button (e.g. undo). */
function toast(message, action) {
  const el = $("#toast");
  el.innerHTML = "";
  el.appendChild(document.createTextNode(message));
  if (action && typeof action.onClick === "function") {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = action.label || "실행 취소";
    btn.addEventListener("click", () => {
      hideToast();
      action.onClick();
    });
    el.appendChild(btn);
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 1800);
}
function hideToast() {
  clearTimeout(toastTimer);
  $("#toast").classList.remove("show");
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function ymKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/* ===================== 2. Storage ===================== */
const Store = {
  KEYS: {
    works: "hm_works",
    sessions: "hm_sessions",
    diary: "hm_diary_entries_v1",
    theme: "hm_theme",
  },
  MAX_SESSIONS: 300,

  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn(`Store.read(${key}) failed`, err);
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`Store.write(${key}) failed`, err);
      return false;
    }
  },

  // Diary
  getDiary() {
    const arr = this.read(this.KEYS.diary, []);
    return Array.isArray(arr) ? arr : [];
  },
  setDiary(entries) {
    return this.write(this.KEYS.diary, entries);
  },
  addDiary(entry) {
    const arr = this.getDiary();
    arr.unshift(entry);
    this.setDiary(arr);
  },

  // Works (studio)
  getWorks() {
    const arr = this.read(this.KEYS.works, []);
    return Array.isArray(arr) ? arr : [];
  },
  setWorks(works) {
    return this.write(this.KEYS.works, works);
  },
  /** Returns true on success, false if storage rejected (e.g. quota). */
  addWork(work) {
    const arr = this.getWorks();
    arr.unshift(work);
    return this.setWorks(arr);
  },
  deleteWork(id) {
    this.setWorks(this.getWorks().filter((w) => w.id !== id));
  },

  // Studio session history (mood gauge over time)
  getSessions() {
    const arr = this.read(this.KEYS.sessions, []);
    return Array.isArray(arr) ? arr : [];
  },
  pushSession(point) {
    const arr = this.getSessions();
    arr.push(point);
    if (arr.length > this.MAX_SESSIONS) arr.splice(0, arr.length - this.MAX_SESSIONS);
    this.write(this.KEYS.sessions, arr);
  },
};

/* ===================== 3. Emotion model ===================== */
const plutchikEmotions = {
  joy_serenity:    { base: "joy",          intensity: "low",    name: "평온",   full: "평온 (기쁨)",   color: "#FACC15", emoji: "😌", intensityKr: "낮음" },
  joy_joy:         { base: "joy",          intensity: "medium", name: "기쁨",   full: "기쁨",          color: "#FACC15", emoji: "😊", intensityKr: "중간" },
  joy_ecstasy:     { base: "joy",          intensity: "high",   name: "황홀",   full: "황홀 (기쁨)",   color: "#D97706", emoji: "🤩", intensityKr: "높음" },

  trust_acceptance:{ base: "trust",        intensity: "low",    name: "수용",   full: "수용 (신뢰)",   color: "#4ADE80", emoji: "🙂", intensityKr: "낮음" },
  trust_trust:     { base: "trust",        intensity: "medium", name: "신뢰",   full: "신뢰",          color: "#4ADE80", emoji: "🤝", intensityKr: "중간" },
  trust_admiration:{ base: "trust",        intensity: "high",   name: "감탄",   full: "감탄 (신뢰)",   color: "#16A34A", emoji: "😍", intensityKr: "높음" },

  fear_apprehension:{ base: "fear",        intensity: "low",    name: "불안",   full: "불안 (두려움)", color: "#818CF8", emoji: "😟", intensityKr: "낮음" },
  fear_fear:       { base: "fear",         intensity: "medium", name: "두려움", full: "두려움",        color: "#818CF8", emoji: "😨", intensityKr: "중간" },
  fear_terror:     { base: "fear",         intensity: "high",   name: "공포",   full: "공포 (두려움)", color: "#4F46E5", emoji: "😱", intensityKr: "높음" },

  surprise_distraction:{ base: "surprise", intensity: "low",    name: "산만",   full: "산만 (놀람)",   color: "#38BDF8", emoji: "🫤", intensityKr: "낮음" },
  surprise_surprise:{ base: "surprise",    intensity: "medium", name: "놀람",   full: "놀람",          color: "#38BDF8", emoji: "😮", intensityKr: "중간" },
  surprise_amazement:{ base: "surprise",   intensity: "high",   name: "경탄",   full: "경탄 (놀람)",   color: "#0284C7", emoji: "😲", intensityKr: "높음" },

  sadness_pensiveness:{ base: "sadness",   intensity: "low",    name: "우울",   full: "우울 (슬픔)",   color: "#60A5FA", emoji: "😔", intensityKr: "낮음" },
  sadness_sadness: { base: "sadness",      intensity: "medium", name: "슬픔",   full: "슬픔",          color: "#60A5FA", emoji: "😢", intensityKr: "중간" },
  sadness_grief:   { base: "sadness",      intensity: "high",   name: "비탄",   full: "비탄 (슬픔)",   color: "#2563EB", emoji: "😭", intensityKr: "높음" },

  disgust_boredom: { base: "disgust",      intensity: "low",    name: "지루함", full: "지루함 (혐오)", color: "#A78BFA", emoji: "😒", intensityKr: "낮음" },
  disgust_disgust: { base: "disgust",      intensity: "medium", name: "혐오",   full: "혐오",          color: "#A78BFA", emoji: "🤢", intensityKr: "중간" },
  disgust_loathing:{ base: "disgust",      intensity: "high",   name: "증오",   full: "증오 (혐오)",   color: "#7C3AED", emoji: "🤮", intensityKr: "높음" },

  anger_annoyance: { base: "anger",        intensity: "low",    name: "짜증",   full: "짜증 (분노)",   color: "#F87171", emoji: "😠", intensityKr: "낮음" },
  anger_anger:     { base: "anger",        intensity: "medium", name: "분노",   full: "분노",          color: "#F87171", emoji: "😡", intensityKr: "중간" },
  anger_rage:      { base: "anger",        intensity: "high",   name: "격노",   full: "격노 (분노)",   color: "#DC2626", emoji: "🤬", intensityKr: "높음" },

  anticipation_interest:{ base: "anticipation", intensity: "low",    name: "관심", full: "관심 (기대)", color: "#2DD4BF", emoji: "🧐", intensityKr: "낮음" },
  anticipation_anticipation:{ base: "anticipation", intensity: "medium", name: "기대", full: "기대",     color: "#2DD4BF", emoji: "🤔", intensityKr: "중간" },
  anticipation_vigilance:{ base: "anticipation", intensity: "high",   name: "경계", full: "경계 (기대)", color: "#0D9488", emoji: "🕵️", intensityKr: "높음" },
};

const baseEmotionOrder = ["joy", "trust", "fear", "surprise", "sadness", "disgust", "anger", "anticipation"];
const baseLabelKr = {
  joy: "기쁨", trust: "신뢰", fear: "두려움", surprise: "놀람",
  sadness: "슬픔", disgust: "혐오", anger: "분노", anticipation: "기대",
};
const intensityOrder = ["low", "medium", "high"];

/** Key of the representative (medium) emotion for a base. */
function mediumKeyOf(base) {
  return Object.keys(plutchikEmotions).find(
    (k) => plutchikEmotions[k].base === base && plutchikEmotions[k].intensity === "medium"
  );
}
function keyFor(base, intensity) {
  return Object.keys(plutchikEmotions).find(
    (k) => plutchikEmotions[k].base === base && plutchikEmotions[k].intensity === intensity
  );
}

/**
 * Reusable, self-contained emotion picker.
 * Renders 8 base emotions; selecting one reveals 3 intensity options.
 * No recursive re-rendering — buttons use event delegation + data attrs.
 */
class EmotionPicker {
  constructor({ grid, intensityRow, intensityButtons, onChange } = {}) {
    this.grid = grid;
    this.intensityRow = intensityRow;
    this.intensityButtons = intensityButtons;
    this.onChange = onChange || (() => {});
    this.base = null;
    this.key = null;

    this.grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-base]");
      if (!btn) return;
      this.base = btn.dataset.base;
      // keep current key only if it belongs to the newly selected base
      if (!this.key || plutchikEmotions[this.key].base !== this.base) this.key = null;
      this._renderBase();
      this._renderIntensity();
      this.onChange(this.key, this.base);
    });
    this.intensityButtons.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-key]");
      if (!btn) return;
      this.key = btn.dataset.key;
      this.base = plutchikEmotions[this.key].base;
      this._renderBase();
      this._renderIntensity();
      this.onChange(this.key, this.base);
    });

    this._renderBase();
    this._renderIntensity();
  }

  get value() { return this.key; }

  /** Programmatically set selection (e.g. when editing an entry). */
  set(emotionKey) {
    if (emotionKey && plutchikEmotions[emotionKey]) {
      this.key = emotionKey;
      this.base = plutchikEmotions[emotionKey].base;
    } else {
      this.key = null;
      this.base = null;
    }
    this._renderBase();
    this._renderIntensity();
  }
  clear() { this.set(null); }

  _renderBase() {
    this.grid.innerHTML = "";
    baseEmotionOrder.forEach((base) => {
      const info = plutchikEmotions[mediumKeyOf(base)];
      const selected = base === this.base;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emotion-btn" + (selected ? " selected" : "");
      btn.dataset.base = base;
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      if (selected) {
        // tint the selection with the emotion's own color
        btn.style.boxShadow = `0 0 0 2px ${info.color}, 0 6px 18px ${hexToRgba(info.color, 0.35)}`;
        btn.style.background = hexToRgba(info.color, 0.14);
        btn.style.borderColor = "transparent";
      }
      btn.innerHTML =
        `<span class="emotion-emoji" aria-hidden="true">${info.emoji}</span>` +
        `<span class="emotion-name">${baseLabelKr[base]}</span>`;
      this.grid.appendChild(btn);
    });
  }

  _renderIntensity() {
    if (!this.base) {
      this.intensityRow.hidden = true;
      this.intensityButtons.innerHTML = "";
      return;
    }
    this.intensityRow.hidden = false;
    this.intensityButtons.innerHTML = "";
    intensityOrder.forEach((inten) => {
      const k = keyFor(this.base, inten);
      const info = plutchikEmotions[k];
      const selected = this.key === k;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "intensity-btn" + (selected ? " selected" : "");
      btn.dataset.key = k;
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      if (selected) btn.style.background = info.color;
      btn.textContent = `${info.name} (${info.intensityKr})`;
      this.intensityButtons.appendChild(btn);
    });
  }
}

/* ===================== 4. Local AI response ===================== */
const aiTones = {
  default: { name: "알아서 골라줘" },
  warm: { name: "따뜻하게" },
  encouraging: { name: "힘이 나게" },
  humorous: { name: "재치있게" },
  insightful: { name: "깊이 있게" },
};

const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Response banks — 8 emotions × 3 openings, intensity coloring,
   3+3 middles, 5 tones × 3 closings. Combinations keep replies fresh
   across hundreds of entries without any server. */
const AI_OPENINGS = {
  joy: [
    "마음에 환한 빛이 스며든 하루였네요 {e}",
    "오늘의 기쁨이 화면 너머까지 전해져요 {e}",
    "좋은 일은 마음에 오래 담아둘수록 더 커진대요 {e}",
  ],
  trust: [
    "누군가를, 그리고 스스로를 믿는 마음이 느껴져요 {e}",
    "신뢰는 하루아침에 생기지 않죠. 그래서 더 귀한 감정이에요 {e}",
    "기댈 수 있는 무언가가 있다는 건 정말 큰 힘이에요 {e}",
  ],
  fear: [
    "불안한 마음을 안고도 오늘을 살아낸 당신, 그걸로 충분해요 {e}",
    "두려움은 소중한 것을 지키고 싶다는 마음의 신호이기도 해요 {e}",
    "무서울 땐 숨을 천천히. 지금 이 순간의 당신은 안전해요 {e}",
  ],
  surprise: [
    "예상 밖의 파도가 하루를 스쳐 지나갔군요 {e}",
    "놀란 마음은 천천히 가라앉혀도 괜찮아요 {e}",
    "뜻밖의 일은 때로 새로운 문을 열어주기도 해요 {e}",
  ],
  sadness: [
    "마음이 무거운 날엔, 무거운 채로 있어도 괜찮아요 {e}",
    "슬픔을 기록할 수 있다는 건 이미 자신을 돌보고 있다는 뜻이에요 {e}",
    "눈물도 마음이 스스로를 씻어내는 방법 중 하나예요 {e}",
  ],
  disgust: [
    "거슬리는 마음이 들 땐, 거리를 두는 것도 지혜예요 {e}",
    "싫은 건 싫다고 느껴도 돼요. 감정에는 늘 이유가 있으니까요 {e}",
    "불편함을 알아차렸다는 건 당신의 기준이 분명하다는 증거예요 {e}",
  ],
  anger: [
    "분노는 지켜야 할 경계가 침범당했다는 신호예요 {e}",
    "화가 났다는 건 그만큼 당신에게 중요한 일이었다는 뜻이죠 {e}",
    "뜨거운 마음을 글로 옮긴 것만으로도 이미 한 걸음 물러선 거예요 {e}",
  ],
  anticipation: [
    "설레는 기대가 잔잔히 차오르고 있네요 {e}",
    "내일을 기다리는 마음, 그 자체로 이미 선물이에요 {e}",
    "기대는 마음이 미래를 향해 내미는 손이에요 {e}",
  ],
};

const AI_INTENSITY = {
  low: "잔잔하게 스며든 감정이지만, 작은 물결도 소중해요.",
  high: "이렇게 강하게 느껴진 감정은, 그만큼 큰 의미가 있다는 뜻이에요.",
};

const AI_MIDDLES_WITH_NOTE = [
  "남겨주신 글을 읽었어요 — “{note}”. 그렇게 느끼는 건 아주 자연스러운 일이에요.",
  "“{note}” — 이 문장 안에 오늘의 당신이 고스란히 담겨 있네요.",
  "적어주신 이야기를 곱씹어 봤어요. “{note}” … 충분히 그럴 만한 하루였어요.",
];
const AI_MIDDLES_NO_NOTE = [
  "짧게라도 마음을 적어두면, 나중의 나에게 좋은 단서가 되어 줘요.",
  "오늘은 감정만 남겨도 충분해요. 기록했다는 사실이 중요하니까요.",
  "말로 다 못 한 마음이 있다면, 다음엔 딱 한 줄만 더 남겨봐요.",
];

const AI_CLOSINGS = {
  warm: [
    "오늘은 스스로에게 조금 더 다정해도 좋아요. 따뜻한 차 한 잔과 함께 쉬어가요.",
    "충분히 잘하고 있어요. 오늘 하루는 이불 속에서 살살 접어두세요.",
    "당신의 마음이 편안한 밤을 보내길 바라요. 내일 또 만나요.",
  ],
  encouraging: [
    "한 걸음이면 충분해요. 오늘의 기록이 내일의 나를 바꿉니다!",
    "지금의 속도로 충분해요. 멈추지 않는 게 가장 어려운 일이거든요.",
    "이렇게 자신을 들여다보는 사람은 반드시 앞으로 나아가요. 응원할게요!",
  ],
  humorous: [
    "마음 날씨가 흐려도 우산은 챙겼잖아요 ☔️ 내일 맑음 확률, 대략 73%!",
    "감정 근육 운동 오늘 한 세트 완료! 내일도 마음 헬스장에서 만나요 💪",
    "오늘의 감정 스탬프 적립 완료. 열 개 모으면… 더 단단한 내가 온대요 😎",
  ],
  insightful: [
    "감정은 방향을 알려주는 나침반이에요. 오늘의 신호를 기억해 두면 다음 선택이 선명해져요.",
    "기록은 감정을 없애는 일이 아니라, 감정과 나 사이에 공간을 만드는 일이에요.",
    "지금의 감정은 지나가지만, 오늘 알아차린 것은 남아요. 그게 자라는 거예요.",
  ],
  default: [
    "오늘의 감정을 잘 기록하셨어요. 기록이 쌓이면 당신만의 지도가 됩니다.",
    "감정을 알아차리는 것만으로도 절반은 돌본 거예요. 잘하셨어요.",
    "꾸준한 기록이 마음의 근력을 만들어요. 오늘도 한 칸을 채웠네요.",
  ],
};

function generateAiResponse(emotionKey, memo, toneKey = "default") {
  const emo = plutchikEmotions[emotionKey];
  const base = emo?.base || "joy";
  const emoji = emo?.emoji || "✨";
  const note = (memo || "").trim().slice(0, 240);

  const parts = [pickFrom(AI_OPENINGS[base]).replace("{e}", emoji)];
  if (emo && AI_INTENSITY[emo.intensity]) parts.push(AI_INTENSITY[emo.intensity]);
  parts.push(
    note
      ? pickFrom(AI_MIDDLES_WITH_NOTE).replace("{note}", note)
      : pickFrom(AI_MIDDLES_NO_NOTE)
  );
  parts.push(pickFrom(AI_CLOSINGS[toneKey] || AI_CLOSINGS.default));
  return parts.join("\n");
}

/* ===================== 5. Diary ===================== */
const yearMonthFilter = $("#yearMonthFilter");
const entriesList = $("#entriesList");
const memoEl = $("#memo");
const aiToneEl = $("#aiTone");
const aiBox = $("#aiResponseBox");
const aiBody = $("#aiResponse");

/* Short Plutchik-based descriptions shown under the emotion grid. */
const emotionDescriptions = {
  joy: "기쁨 — 마음이 밝아지고 에너지가 차오르는 감정. 좋은 것을 더 가까이하고 싶게 해요.",
  trust: "신뢰 — 사람이나 상황에 안심하고 기댈 수 있다는 느낌. 관계를 단단하게 만들어요.",
  fear: "두려움 — 위험으로부터 나를 지키려는 감정. 조심하라는 마음의 경보예요.",
  surprise: "놀람 — 예상 밖의 일에 주의를 모으는 감정. 새로움의 문턱이기도 해요.",
  sadness: "슬픔 — 잃어버린 것을 애도하고 회복을 준비하는 감정. 쉼이 필요하다는 신호예요.",
  disgust: "혐오 — 해로운 것을 밀어내려는 감정. 나의 기준과 경계를 알려줘요.",
  anger: "분노 — 부당함에 맞서고 경계를 지키려는 감정. 무엇이 중요한지 알려줘요.",
  anticipation: "기대 — 다가올 일을 준비하며 설레는 감정. 마음이 미래를 향해 움직이고 있어요.",
};

const emotionDescEl = $("#emotionDesc");
const composerPicker = new EmotionPicker({
  grid: $("#emotionSelector"),
  intensityRow: $("#intensityRow"),
  intensityButtons: $("#intensityButtons"),
  onChange: (key, base) => {
    if (!base) { emotionDescEl.textContent = ""; return; }
    const desc = emotionDescriptions[base] || "";
    emotionDescEl.textContent = key ? `${plutchikEmotions[key].full} · ${desc}` : desc;
  },
});

/* ----- 오늘의 글감 (writing prompts) ----- */
const WRITING_PROMPTS = [
  "오늘 나를 가장 웃게 한 순간은 언제였나요?",
  "지금 머릿속을 가장 많이 차지하는 생각은 무엇인가요?",
  "오늘의 나에게 점수를 준다면 몇 점? 그 이유는요?",
  "요즘 가장 고마운 사람은 누구인가요?",
  "오늘 몸이 보낸 신호가 있었나요? 피곤함, 설렘, 긴장 같은 것들요.",
  "만약 오늘을 다시 산다면 무엇을 바꾸고 싶나요?",
  "최근에 나를 놀라게 한 일은 무엇인가요?",
  "지금 창밖 풍경은 어떤가요? 그걸 보며 드는 생각은?",
  "오늘 가장 오래 머문 감정에 이름을 붙인다면?",
  "내일의 나에게 한 문장을 남긴다면?",
  "요즘 나를 지치게 하는 것과 채워주는 것은 무엇인가요?",
  "오늘 들은 말 중 마음에 남은 한마디는?",
  "지금 가장 하고 싶은 일 한 가지는 무엇인가요?",
  "최근에 포기한 것이 있나요? 그 선택은 어땠나요?",
  "오늘의 날씨와 내 마음의 날씨는 닮았나요?",
  "어릴 적의 내가 지금의 나를 본다면 뭐라고 할까요?",
  "반복되는 걱정 중에, 정말 내 힘으로 바꿀 수 있는 건 무엇일까요?",
  "오늘 스쳐 지나간 사소한 행복이 있었나요?",
  "지금 내 에너지는 몇 퍼센트인가요? 충전이 필요한 곳은 어디일까요?",
  "최근 나를 성장시킨 실수는 무엇인가요?",
  "오늘 누군가에게 하지 못한 말이 있나요?",
  "일주일 뒤의 나는 오늘을 어떻게 기억할까요?",
];

const promptTextEl = $("#promptText");
function showRandomPrompt() {
  const next = pickFrom(WRITING_PROMPTS.filter((p) => p !== promptTextEl.textContent));
  promptTextEl.textContent = next;
}
$("#promptRefresh").addEventListener("click", showRandomPrompt);
promptTextEl.addEventListener("click", () => {
  memoEl.value = (memoEl.value ? memoEl.value.trimEnd() + "\n\n" : "") + promptTextEl.textContent + "\n";
  memoEl.focus();
  toast("글감을 노트에 담았어요 ✍️");
});
showRandomPrompt();

function entryCardHtml(e, { withTone = true } = {}) {
  const info = plutchikEmotions[e.emotion] || {};
  const when = withTone ? new Date(e.date).toLocaleString() : new Date(e.date).toLocaleTimeString();
  return `
    <div class="entry-head">
      <div class="entry-left">
        <div class="entry-emoji" aria-hidden="true">${info.emoji || "✨"}</div>
        <div>
          <div class="entry-title">${escapeHtml(info.full || "감정")} <span class="entry-date">· ${escapeHtml(when)}</span></div>
          ${withTone && e.aiTone && aiTones[e.aiTone] ? `<div class="microcopy">${escapeHtml(aiTones[e.aiTone].name)}</div>` : ""}
        </div>
      </div>
      <div class="entry-actions">
        <button class="icon-btn" title="수정" aria-label="기록 수정" data-edit="${e.id}">✎</button>
        <button class="icon-btn" title="삭제" aria-label="기록 삭제" data-del="${e.id}">🗑️</button>
      </div>
    </div>
    ${e.memo ? `<div class="entry-body">${escapeHtml(e.memo)}</div>` : ""}
    ${e.aiResponse ? `<div class="ai-box"><div class="ai-title">🕯️ 마음 친구의 답장</div><div class="ai-body">${escapeHtml(e.aiResponse)}</div></div>` : ""}
  `;
}

function availableYearMonths(entries) {
  return Array.from(new Set(entries.map((e) => ymKey(e.date)))).sort().reverse();
}

function populateYearMonthFilter() {
  const current = yearMonthFilter.value;
  const list = availableYearMonths(Store.getDiary());
  yearMonthFilter.innerHTML =
    '<option value="">전체</option>' +
    list.map((ym) => `<option value="${ym}">${ym.replace("-", "년 ")}월</option>`).join("");
  if (list.includes(current)) yearMonthFilter.value = current;
}

function filteredEntries() {
  const entries = Store.getDiary();
  const ym = yearMonthFilter.value;
  return ym ? entries.filter((e) => ymKey(e.date) === ym) : entries;
}

function renderEntries() {
  const items = filteredEntries();
  if (items.length === 0) {
    entriesList.innerHTML = `<div class="empty">아직 기록이 없어요.<br>오늘의 마음을 첫 페이지에 남겨보세요 🌙</div>`;
    return;
  }
  entriesList.innerHTML = "";
  items.forEach((e) => {
    const wrap = document.createElement("div");
    wrap.className = "entry";
    wrap.innerHTML = entryCardHtml(e);
    entriesList.appendChild(wrap);
  });
}

function saveDiaryEntry() {
  const emotion = composerPicker.value;
  if (!emotion) {
    toast("오늘의 감정을 먼저 선택해주세요.");
    return;
  }
  const memo = memoEl.value.trim();
  const tone = aiToneEl.value;
  const aiResponse = generateAiResponse(emotion, memo, tone);
  Store.addDiary({ id: uid(), date: new Date().toISOString(), emotion, memo, aiTone: tone, aiResponse });

  aiBody.textContent = aiResponse;
  aiBox.hidden = false;
  memoEl.value = "";
  composerPicker.clear();
  emotionDescEl.textContent = "";
  refreshDiaryViews();
  toast("오늘의 마음을 기록했어요 💌");
}

function deleteEntry(id) {
  const entries = Store.getDiary();
  const idx = entries.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const [removed] = entries.splice(idx, 1);
  Store.setDiary(entries);
  refreshDiaryViews();
  toast("기록을 삭제했어요.", {
    label: "실행 취소",
    onClick: () => {
      const arr = Store.getDiary();
      arr.splice(Math.min(idx, arr.length), 0, removed);
      Store.setDiary(arr);
      refreshDiaryViews();
      toast("삭제를 취소했어요.");
    },
  });
}

/** Re-render every view that depends on diary data. */
function refreshDiaryViews() {
  populateYearMonthFilter();
  renderEntries();
  renderCalendar();
  renderInsights();
}

$("#saveDiary").addEventListener("click", saveDiaryEntry);
memoEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    saveDiaryEntry();
  }
});
$("#clearDiary").addEventListener("click", () => {
  memoEl.value = "";
  composerPicker.clear();
  emotionDescEl.textContent = "";
  aiBox.hidden = true;
});
$("#clearFilter").addEventListener("click", () => {
  yearMonthFilter.value = "";
  renderEntries();
});
yearMonthFilter.addEventListener("change", renderEntries);

// Edit / delete via delegation (works for both diary list and calendar detail)
function wireEntryActions(container) {
  container.addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) openEditModal(editId);
    if (delId) deleteEntry(delId);
  });
}
wireEntryActions(entriesList);

/* ----- Edit modal ----- */
const modal = $("#modal");
const modalMemo = $("#modalMemo");
const modalTone = $("#modalTone");
let editingId = null;

const modalPicker = new EmotionPicker({
  grid: $("#modalEmotion"),
  intensityRow: $("#modalIntensityRow"),
  intensityButtons: $("#modalIntensityButtons"),
});

function openEditModal(id) {
  const entry = Store.getDiary().find((x) => x.id === id);
  if (!entry) return;
  editingId = id;
  modalMemo.value = entry.memo || "";
  modalTone.value = entry.aiTone || "default";
  modalPicker.set(entry.emotion);
  modal.hidden = false;
  modalMemo.focus();
}
function closeEditModal() {
  modal.hidden = true;
  editingId = null;
}

$("#modalClose").addEventListener("click", closeEditModal);
$("#modalCancel").addEventListener("click", closeEditModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeEditModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeEditModal();
});

$("#modalSave").addEventListener("click", () => {
  const emotion = modalPicker.value;
  if (!emotion) {
    toast("감정을 선택해주세요.");
    return;
  }
  const entries = Store.getDiary();
  const idx = entries.findIndex((x) => x.id === editingId);
  if (idx === -1) return closeEditModal();

  const memo = modalMemo.value.trim();
  const tone = modalTone.value;
  const prev = entries[idx];
  const changed =
    memo !== prev.memo || tone !== prev.aiTone || emotion !== prev.emotion || !prev.aiResponse;
  const aiResponse = changed ? generateAiResponse(emotion, memo, tone) : prev.aiResponse;

  entries[idx] = { ...prev, memo, aiTone: tone, emotion, aiResponse };
  Store.setDiary(entries);
  closeEditModal();
  refreshDiaryViews();
  toast("기록이 수정되었습니다.");
});

/* ===================== 6. Calendar ===================== */
const calendarTitle = $("#calendarTitle");
const calendarGrid = $("#calendarGrid");
const dayDetail = $("#calendarDayDetail");
const dayDetailTitle = $("#dayDetailTitle");
const dayEntries = $("#dayEntries");

let currentCal = new Date();

function renderCalendar() {
  const entries = Store.getDiary();
  const year = currentCal.getFullYear();
  const month = currentCal.getMonth();
  calendarTitle.textContent = `${year}년 ${month + 1}월`;
  calendarGrid.innerHTML = "";

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const gridStart = new Date(start);
  gridStart.setDate(1 - start.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(end.getDate() + (6 - end.getDay()));
  const todayStr = new Date().toDateString();

  const d = new Date(gridStart);
  while (d <= gridEnd) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-cell";
    if (d.getMonth() !== month) cell.classList.add("dim");
    if (d.toDateString() === todayStr) cell.classList.add("today");
    cell.innerHTML = `<div class="date">${d.getMonth() + 1}/${d.getDate()}</div>`;

    const dayStr = d.toDateString();
    const todays = entries
      .filter((e) => new Date(e.date).toDateString() === dayStr)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (todays[0]) {
      const info = plutchikEmotions[todays[0].emotion];
      const em = document.createElement("div");
      em.className = "emoji";
      em.textContent = info?.emoji || "✨";
      cell.appendChild(em);
      if (todays.length > 1) {
        const c = document.createElement("div");
        c.className = "count";
        c.textContent = `×${todays.length}`;
        cell.appendChild(c);
      }
    }
    const captured = new Date(d);
    cell.addEventListener("click", () => openDayDetail(captured));
    calendarGrid.appendChild(cell);
    d.setDate(d.getDate() + 1);
  }
}

function openDayDetail(date) {
  const list = Store.getDiary()
    .filter((e) => isSameDay(e.date, date))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  dayEntries.innerHTML = "";
  if (list.length === 0) {
    dayEntries.innerHTML = `<div class="empty">이 날짜에는 기록이 없습니다.</div>`;
  } else {
    list.forEach((e) => {
      const wrap = document.createElement("div");
      wrap.className = "entry";
      wrap.innerHTML = entryCardHtml(e, { withTone: false });
      dayEntries.appendChild(wrap);
    });
  }
  dayDetailTitle.textContent =
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  dayDetail.hidden = false;
  dayDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

wireEntryActions(dayEntries);
$("#closeDayDetail").addEventListener("click", () => (dayDetail.hidden = true));
$("#prevMonth").addEventListener("click", () => {
  currentCal.setMonth(currentCal.getMonth() - 1);
  renderCalendar();
});
$("#nextMonth").addEventListener("click", () => {
  currentCal.setMonth(currentCal.getMonth() + 1);
  renderCalendar();
});

/* ===================== 7. Insights ===================== */
function uniqueDays(entries) {
  return Array.from(new Set(entries.map((e) => new Date(e.date).toDateString())))
    .map((s) => new Date(s))
    .sort((a, b) => a - b);
}

function longestStreak(entries) {
  const days = uniqueDays(entries);
  if (days.length === 0) return 0;
  let longest = 1, current = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (days[i] - days[i - 1]) / 86400000;
    if (diff === 1) current++;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function currentStreak(entries) {
  const days = uniqueDays(entries).sort((a, b) => b - a);
  if (days.length === 0) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const last = new Date(days[0]); last.setHours(0, 0, 0, 0);
  if (last.getTime() !== today.getTime() && last.getTime() !== yesterday.getTime()) return 0;
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    const cur = new Date(days[i]); cur.setHours(0, 0, 0, 0);
    const next = new Date(days[i + 1]); next.setHours(0, 0, 0, 0);
    const expected = new Date(cur); expected.setDate(cur.getDate() - 1);
    if (next.getTime() === expected.getTime()) streak++;
    else break;
  }
  return streak;
}

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawTrend(entries) {
  const canvas = $("#trendChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const axis = cssVar("--border", "rgba(255,255,255,.2)");
  ctx.strokeStyle = axis;
  ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(40, h - 30); ctx.lineTo(w - 10, h - 30); ctx.stroke();
  ctx.strokeStyle = cssVar("--border-soft", "rgba(255,255,255,.08)");
  for (let i = 0; i < 5; i++) {
    const y = 10 + (i * (h - 40)) / 4;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 10, y); ctx.stroke();
  }
  const sessions = Store.getSessions().slice(-60);
  if (sessions.length >= 2) {
    ctx.beginPath();
    sessions.forEach((p, i) => {
      const x = 40 + i * ((w - 60) / (sessions.length - 1));
      const y = (h - 30) - (p.value / 100) * (h - 40);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = cssVar("--accent", "#2E6B54"); ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.fillStyle = cssVar("--muted", "#888");
    ctx.font = "500 14px Pretendard, sans-serif";
    ctx.fillText("스튜디오에서 글을 쓰면 마음의 흐름이 이곳에 그려져요.", 56, h / 2);
  }
}

function drawFrequency(entries) {
  const canvas = $("#freqChart");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const counts = baseEmotionOrder
    .map((base) => ({ base, count: entries.filter((e) => plutchikEmotions[e.emotion]?.base === base).length }))
    .filter((x) => x.count > 0);
  if (counts.length === 0) {
    ctx.fillStyle = cssVar("--muted", "#888");
    ctx.font = "500 14px Pretendard, sans-serif";
    ctx.fillText("감정을 기록하면 자주 만나는 감정이 여기에 보여요.", 56, H / 2);
    return;
  }
  const maxCount = Math.max(1, ...counts.map((x) => x.count));
  const barW = (W - 80) / counts.length;
  const textColor = cssVar("--text", "#E6E6F0");
  counts.forEach((item, i) => {
    const x = 60 + i * barW;
    const barH = (H - 60) * (item.count / maxCount);
    const y = (H - 40) - barH;
    ctx.fillStyle = plutchikEmotions[mediumKeyOf(item.base)]?.color || "#7C83FF";
    ctx.fillRect(x, y, barW * 0.7, barH);
    ctx.fillStyle = textColor;
    ctx.font = "600 12px Pretendard, sans-serif";
    ctx.fillText(baseLabelKr[item.base], x, H - 20);
    ctx.fillText(`${item.count}회`, x, y - 6);
  });
}

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawDotMap(entries) {
  const wrap = $("#dotMap");
  wrap.innerHTML = "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const dayEntries = entries
      .filter((e) => isSameDay(e.date, d))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    let color = cssVar("--surface-strong", "rgba(255,255,255,.12)");
    let emoji = "";
    if (dayEntries[0]) {
      const info = plutchikEmotions[dayEntries[0].emotion];
      color = hexToRgba(info?.color || "#7C83FF", 0.9);
      emoji = info?.emoji || "";
    }
    const cell = document.createElement("div");
    cell.className = "dot";
    cell.style.background = color;
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${emoji}`;
    cell.innerHTML = `<div class="tip">${label}</div>`;
    wrap.appendChild(cell);
  }
}

function writtenInsights(entries) {
  const ul = $("#insightList");
  ul.innerHTML = "";
  const items = [];

  if (entries.length === 0) {
    items.push(["🌱", "아직 이야기가 쌓이지 않았어요. 감정을 기록하기 시작하면, 이곳에서 당신만의 패턴을 읽어드릴게요."]);
  } else {
    // Most frequent base emotion
    const tally = {};
    entries.forEach((e) => {
      const base = plutchikEmotions[e.emotion]?.base;
      if (base) tally[base] = (tally[base] || 0) + 1;
    });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const pct = Math.round((top[1] / entries.length) * 100);
      items.push(["💡", `최근 기록 중 가장 자주 나타난 감정은 <strong>${baseLabelKr[top[0]]}</strong> 계열이에요 (${pct}%).`]);
    }

    // Streak
    const streak = currentStreak(entries);
    if (streak >= 2) items.push(["🔥", `${streak}일 연속 기록 중! 꾸준함이 멋져요.`]);
    else items.push(["📝", "오늘도 한 줄 남겨보세요. 기록은 쌓일수록 힘이 됩니다."]);

    // Positivity ratio (Plutchik base valence, rough)
    const positive = new Set(["joy", "trust", "anticipation"]);
    const negative = new Set(["fear", "sadness", "disgust", "anger"]);
    let pos = 0, neg = 0;
    entries.forEach((e) => {
      const base = plutchikEmotions[e.emotion]?.base;
      if (positive.has(base)) pos++;
      else if (negative.has(base)) neg++;
    });
    if (pos + neg > 0) {
      const ratio = Math.round((pos / (pos + neg)) * 100);
      items.push(["⚖️", `긍정 계열 비율은 약 <strong>${ratio}%</strong>예요. 감정의 균형을 살펴보세요.`]);
    }

    // Journaling habit (with memo)
    const withMemo = entries.filter((e) => e.memo && e.memo.trim()).length;
    if (withMemo > 0) {
      const pct = Math.round((withMemo / entries.length) * 100);
      items.push(["🖋️", `기록의 ${pct}%에 메모를 함께 남겼어요. 맥락이 풍부할수록 회고가 깊어집니다.`]);
    }

    // Rhythm: which weekday / time of day you tend to journal
    if (entries.length >= 5) {
      const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
      const byDay = new Array(7).fill(0);
      const bySlot = { 아침: 0, 낮: 0, 저녁: 0, 밤: 0 };
      entries.forEach((e) => {
        const d = new Date(e.date);
        byDay[d.getDay()]++;
        const h = d.getHours();
        if (h >= 5 && h < 12) bySlot["아침"]++;
        else if (h < 17) bySlot["낮"]++;
        else if (h < 22) bySlot["저녁"]++;
        else bySlot["밤"]++;
      });
      const topDay = byDay.indexOf(Math.max(...byDay));
      const topSlot = Object.entries(bySlot).sort((a, b) => b[1] - a[1])[0][0];
      items.push(["🕰️", `주로 <strong>${dayNames[topDay]}요일</strong>, <strong>${topSlot}</strong> 시간에 마음을 정리하는 편이에요.`]);
    }
  }

  // Works created
  const works = Store.getWorks().length;
  if (works > 0) items.push(["🎨", `스튜디오에서 만든 작품이 ${works}개 저장되어 있어요.`]);

  items.forEach(([ic, text]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ic" aria-hidden="true">${ic}</span><span>${text}</span>`;
    ul.appendChild(li);
  });
}

function renderInsights() {
  const entries = Store.getDiary();
  drawTrend(entries);

  const tiles = $("#statsTiles");
  tiles.innerHTML = "";
  const addTile = (label, value) => {
    const t = document.createElement("div");
    t.className = "tile";
    t.innerHTML = `<div class="t-label">${label}</div><div class="t-value">${value}</div>`;
    tiles.appendChild(t);
  };
  addTile("총 기록 수", entries.length);
  addTile("메모 포함 기록", entries.filter((e) => e.memo && e.memo.trim()).length);
  addTile("현재 연속 기록", currentStreak(entries) + "일");
  addTile("최장 연속 기록", longestStreak(entries) + "일");

  drawFrequency(entries);
  drawDotMap(entries);
  writtenInsights(entries);
}

/* ===================== 8. Backup / restore / export ===================== */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

$("#backupBtn").addEventListener("click", () => {
  const entries = Store.getDiary();
  if (entries.length === 0) {
    toast("백업할 기록이 없습니다.");
    return;
  }
  downloadBlob(
    new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" }),
    `emotion-diary-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
  toast("백업 파일을 다운로드했어요.");
});

$("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
$("#restoreInput").addEventListener("change", (evt) => {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error("형식 오류");
      if (!data.every((x) => x && x.id && x.date && x.emotion)) throw new Error("레코드 구조 오류");
      if (!confirm("현재 기록을 덮어쓰고 복원하시겠습니까?")) return;
      Store.setDiary(data.slice().sort((a, b) => new Date(b.date) - new Date(a.date)));
      refreshDiaryViews();
      toast("복원했습니다.");
    } catch (err) {
      console.error(err);
      toast("복원 중 오류가 발생했습니다.");
    } finally {
      evt.target.value = "";
    }
  };
  reader.readAsText(file);
});

$("#exportProject").addEventListener("click", () => {
  const data = { works: Store.getWorks(), sessions: Store.getSessions(), diary: Store.getDiary() };
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    "hearts-melody-project.json"
  );
  toast("프로젝트를 JSON으로 내보냈어요.");
});

/* ===================== 9. Studio ===================== */
const STOPWORDS = new Set([
  "그리고", "하지만", "그러나", "그래서", "오늘", "정말", "조금", "너무", "매우", "나는", "제가",
  "그", "이", "저", "것", "에서", "으로", "하다", "합니다", "했다", "the", "and", "but", "or",
  "so", "to", "a", "an", "in", "on", "of", "it", "is",
]);
const POSITIVE = ["행복", "기쁨", "좋다", "사랑", "감사", "설렘", "미소", "희망", "편안", "축복", "빛", "happy", "love", "grateful", "smile", "hope", "calm", "peace", "joy", "excited", "delight"];
const NEGATIVE = ["슬픔", "외롭", "우울", "불안", "화가", "분노", "지치", "어둠", "눈물", "상실", "그립", "pain", "sad", "lonely", "anxious", "anger", "mad", "tired", "dark", "cry", "loss"];

function analyzeEmotion(text) {
  const t = (text || "").toLowerCase();
  let score = 0;
  POSITIVE.forEach((w) => { if (t.includes(w)) score += 1; });
  NEGATIVE.forEach((w) => { if (t.includes(w)) score -= 1; });
  const value = Math.min(100, Math.max(0, 50 + score * 12));
  const label = value >= 66 ? "기쁨" : value <= 34 ? "우울" : "차분";
  return { value, label };
}

function extractKeywords(text) {
  const tokens = (text || "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const counts = new Map();
  tokens.forEach((w) => {
    if (w.length < 2 || STOPWORDS.has(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
}

function drawGauge(canvas, value) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = cssVar("--border", "rgba(255,255,255,.15)"); ctx.lineWidth = 10; ctx.stroke();
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * (value / 100);
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = cssVar("--accent", "#2E6B54"); ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.stroke();
  ctx.fillStyle = cssVar("--text", "#E6E6F0");
  ctx.font = "600 16px Pretendard, system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(value)}`, cx, cy);
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
}

const Poem = {
  titleFrom(text) {
    const keys = extractKeywords(text);
    if (keys[0]) return keys[0] + "에 대하여";
    return (text.trim().split(/[\n.]/)[0] || "제목 미정").slice(0, 22);
  },
  generate(text, style, moodLabel) {
    const images = [
      "빛", "그늘", "바람", "창가", "숨결", "파도", "별빛", "거울", "흔적",
      "노을", "골목", "계절", "물결", "새벽", "온기", "달빛", "우산", "엽서",
    ];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const moodWord = moodLabel === "기쁨" ? "따스한" : moodLabel === "우울" ? "서늘한" : "잔잔한";
    const tokens = extractKeywords(text);
    const kw1 = tokens[0] || pick(images), kw2 = tokens[1] || pick(images), kw3 = tokens[2] || pick(images);
    const lines = [];
    if (style === "haiku") {
      lines.push(`${kw1} 위에 ${moodWord} 숨`, `${kw2} 사이로 흐르는 마음`, `${kw3} 한 줌, 나`);
    } else if (style === "sonnet") {
      return [
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
        `끝내 한 편의 시가 되어 흐른다.`,
      ].join("\n");
    } else if (style === "rap") {
      lines.push(
        `Yo, ${kw1} beat 위에 drop, 마음의 log`,
        `감정은 ${moodWord} tone, 올라가 like prog`,
        `${kw2} 기억들을 rhyme, 박자에다 sew`,
        `오늘의 나를 spit, 내일의 나를 grow`,
        `hook: ${kw3} ${kw3} yeah we glow`
      );
    } else if (style === "lyric") {
      lines.push(
        `${kw1} 위로 흩어진 말들,`,
        `손끝에 남아, 밤새 반짝인다.`,
        `${kw2} 같은 웃음 하나,`,
        `멀리서도 내게 돌아오는 길.`,
        ` `,
        `너를 부르면, ${kw3}이 흔들리고,`,
        `내 맘의 선율은 조용히 커진다.`
      );
    } else {
      return [
        `오늘의 문장 사이, ${kw1} 한 줌을 끼워두고,`,
        `나는 ${moodWord} 호흡으로 하루를 넘겼다.`,
        `${kw2}의 가장자리에서 조금 멈추었다가,`,
        `다시 걷는다, 나를 닮은 속도로.`,
        ``,
        `가끔은 ${kw3}처럼 반짝였고,`,
        `가끔은 환한 빈칸으로 남았다.`,
        `그 모든 사이에서 나는 조금씩,`,
        `내가 된다.`,
      ].join("\n");
    }
    return lines.join("\n");
  },
};

const Music = {
  async render({ genre = "lofi", mood = "차분", seconds = 15 }) {
    const sr = 22050, ch = 1;
    const length = sr * seconds;
    const ctx = new OfflineAudioContext(ch, length, sr);
    const pad = ctx.createOscillator();
    pad.type = genre === "synth" ? "sawtooth" : genre === "piano" ? "triangle" : "sine";
    const padGain = ctx.createGain(); padGain.gain.value = 0.0;
    pad.connect(padGain).connect(ctx.destination);
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.22;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    padGain.connect(delay).connect(ctx.destination); delay.connect(fb).connect(delay);
    pad.start(0);
    const baseFreq = mood === "우울" ? 220.0 : 261.63;
    const chords = mood === "우울"
      ? [[0, 3, 7], [2, 5, 9], [3, 7, 10], [5, 8, 12]]
      : [[0, 4, 7], [5, 9, 12], [7, 11, 14], [4, 7, 12]];
    const chordDur = seconds / chords.length;
    const mel = ctx.createOscillator(); mel.type = genre === "lofi" ? "triangle" : "square";
    const melGain = ctx.createGain(); melGain.gain.value = 0.0;
    mel.connect(melGain).connect(ctx.destination); mel.start(0);
    for (let i = 0; i < chords.length; i++) {
      const t0 = i * chordDur, chord = chords[i];
      const avg = chord.reduce((a, b) => a + b, 0) / chord.length;
      pad.frequency.setValueAtTime(baseFreq * Math.pow(2, avg / 12), t0);
      padGain.gain.cancelScheduledValues(t0);
      padGain.gain.setTargetAtTime(0.22, t0, 0.3);
      padGain.gain.setTargetAtTime(0.0, t0 + chordDur - 0.35, 0.25);
      const step = 0.5;
      for (let tt = t0; tt < t0 + chordDur; tt += step) {
        const semi = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.3 ? 12 : 0);
        mel.frequency.setValueAtTime(baseFreq * Math.pow(2, semi / 12), tt);
        melGain.gain.cancelScheduledValues(tt);
        melGain.gain.setValueAtTime(0.0, tt);
        melGain.gain.linearRampToValueAtTime(0.22, tt + 0.02);
        melGain.gain.exponentialRampToValueAtTime(0.0001, tt + step * 0.8);
      }
    }
    return audioBufferToWav(await ctx.startRendering());
  },
};

function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels, sampleRate = buffer.sampleRate;
  const bitDepth = 16, format = 1;
  const samples = buffer.getChannelData(0);
  const blockAlign = (numOfChan * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = (samples.length * bitDepth) / 8;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const writeString = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); offset += s.length; };
  const writeUint32 = (d) => { view.setUint32(offset, d, true); offset += 4; };
  const writeUint16 = (d) => { view.setUint16(offset, d, true); offset += 2; };
  writeString("RIFF"); writeUint32(36 + dataSize); writeString("WAVE"); writeString("fmt ");
  writeUint32(16); writeUint16(format); writeUint16(numOfChan); writeUint32(sampleRate);
  writeUint32(byteRate); writeUint16(blockAlign); writeUint16(bitDepth);
  writeString("data"); writeUint32(dataSize);
  const tmp = new Int16Array(arrayBuffer, 44, samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    tmp[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Visual = {
  // Restrained "ink-wash" palettes per mood — muted, editorial tones.
  draw(canvas, mood = "차분", seed = 1) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    if (mood === "기쁨") { g.addColorStop(0, "#E9C46A"); g.addColorStop(1, "#D96C47"); }
    else if (mood === "우울") { g.addColorStop(0, "#1E2A38"); g.addColorStop(1, "#41556B"); }
    else { g.addColorStop(0, "#4A5568"); g.addColorStop(1, "#8E9AAF"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rng = mulberry32(Math.floor(seed) % 0xffffffff);
    for (let i = 0; i < 12; i++) {
      const x = rng() * w, y = rng() * h, r = 40 + rng() * 130;
      const hue = mood === "기쁨" ? 22 + rng() * 40 : mood === "우울" ? 205 + rng() * 30 : 200 + rng() * 40;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `hsla(${hue}, 55%, 68%, .4)`);
      grd.addColorStop(1, `hsla(${hue}, 55%, 50%, 0)`);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,255,255,.025)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.globalCompositeOperation = "source-over";
  },
};

/* ----- Studio UI ----- */
const diaryEl = $("#diary");
const gaugeCanvas = $("#gauge");
const emoText = $("#emotionText");
const keywordsEl = $("#keywords");

// Persist a mood data point at most once every few seconds while typing,
// instead of on every keystroke (which previously bloated localStorage).
const persistSession = debounce((value) => Store.pushSession({ value, at: Date.now() }), 2500);

function updateAnalysis({ persist = true } = {}) {
  const text = diaryEl.value;
  const emo = analyzeEmotion(text);
  drawGauge(gaugeCanvas, emo.value);
  emoText.textContent = `${emo.label} (${Math.round(emo.value)})`;
  keywordsEl.innerHTML = "";
  extractKeywords(text).forEach((k) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = k;
    keywordsEl.appendChild(chip);
  });
  if (persist && text.trim()) persistSession(emo.value);
}
diaryEl.addEventListener("input", () => updateAnalysis());

$("#genPoem").addEventListener("click", () => {
  const text = diaryEl.value.trim();
  if (!text) { toast("먼저 일기를 적어주세요"); return; }
  const emo = analyzeEmotion(text);
  const out = $("#poemOutput");
  out.textContent = Poem.generate(text, $("#poemStyle").value, emo.label);
  out.dataset.generated = "1";
  $("#poemTitle").textContent = Poem.titleFrom(text);
  toast("당신의 하루가 시가 되었어요 ✒️");
});

let lastWavBlob = null;
let lastWavUrl = null;
$("#genMusic").addEventListener("click", async () => {
  const btn = $("#genMusic");
  btn.disabled = true;
  $("#downloadWAV").disabled = true;
  try {
    const emo = analyzeEmotion(diaryEl.value.trim());
    const genre = $("#musicGenre").value;
    const seconds = Math.min(30, Math.max(5, parseInt($("#musicLen").value, 10) || 15));
    lastWavBlob = await Music.render({ genre, mood: emo.label, seconds });
    if (lastWavUrl) URL.revokeObjectURL(lastWavUrl);
    lastWavUrl = URL.createObjectURL(lastWavBlob);
    $("#audioPlayer").src = lastWavUrl;
    $("#downloadWAV").disabled = false;
    toast("음악을 생성했어요 🎵");
  } catch (err) {
    console.error(err);
    toast("음악 생성에 실패했어요");
  } finally {
    btn.disabled = false;
  }
});

$("#downloadWAV").addEventListener("click", () => {
  if (!lastWavBlob) { toast("먼저 음악을 생성해주세요"); return; }
  downloadBlob(lastWavBlob, "hearts-melody.wav");
});

$("#genVisual").addEventListener("click", () => {
  const emo = analyzeEmotion(diaryEl.value.trim());
  const seed = Date.now();
  Visual.draw($("#bgCanvas"), emo.label, seed);
  $("#bgCanvas").dataset.seed = String(seed);
  toast("배경을 생성했어요 🖼️");
});

$("#downloadPNG").addEventListener("click", () => {
  const canvas = $("#bgCanvas");
  const w = canvas.width, h = canvas.height;
  const temp = document.createElement("canvas");
  temp.width = w; temp.height = h;
  const ctx = temp.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e9ecff";
  ctx.font = '600 40px "Noto Serif KR", Georgia, serif';
  ctx.fillText($("#poemTitle").textContent, 40, h - 200);
  ctx.font = "500 20px Pretendard, system-ui";
  let y = h - 170;
  $("#poemOutput").textContent.split("\n").forEach((line) => { ctx.fillText(line, 40, y); y += 24; });
  const a = document.createElement("a");
  a.href = temp.toDataURL("image/png");
  a.download = "hearts-melody.png";
  a.click();
  toast("PNG로 내보냈어요");
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

$("#saveWork").addEventListener("click", async () => {
  const poem = $("#poemOutput").textContent.trim();
  if (!poem || $("#poemOutput").dataset.generated !== "1") { toast("시를 먼저 지어주세요"); return; }
  const title = $("#poemTitle").textContent || "무제";
  const diary = diaryEl.value.trim();
  const { label } = analyzeEmotion(diary);
  const styleLabel = { free: "자유시", haiku: "하이쿠", sonnet: "소네트", lyric: "서정시", rap: "랩" }[$("#poemStyle").value];
  const seed = parseInt($("#bgCanvas").dataset.seed || Date.now(), 10);

  // Persist audio as a data URL so it survives page reload (blob URLs do not).
  let audio = null;
  if (lastWavBlob) {
    try { audio = await blobToDataUrl(lastWavBlob); } catch { audio = null; }
  }

  const work = { id: uid(), title, poem, diary, mood: label, style: styleLabel, audio, seed, createdAt: Date.now() };
  let ok = Store.addWork(work);
  let droppedAudio = false;
  if (!ok && audio) {
    // Likely a quota issue — retry without the heavy audio payload.
    work.audio = null;
    ok = Store.addWork(work);
    droppedAudio = ok;
  }
  if (!ok) { toast("저장에 실패했어요 (저장 공간 부족)."); return; }
  renderArchive();
  renderInsights();
  toast(droppedAudio ? "저장 공간이 부족해 오디오는 제외하고 저장했어요." : "작품을 저장했어요 💾");
});

// Voice dictation (graceful if unsupported)
(() => {
  const btn = $("#dictateBtn");
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) { btn.disabled = true; btn.textContent = "🎙️ 음성 입력(미지원)"; return; }
  const rec = new Speech();
  rec.lang = "ko-KR"; rec.interimResults = true; rec.continuous = true;
  let listening = false;
  rec.onresult = (evt) => {
    let text = "";
    for (let i = evt.resultIndex; i < evt.results.length; i++) text += evt.results[i][0].transcript;
    diaryEl.value += (diaryEl.value ? " " : "") + text.trim();
    updateAnalysis();
  };
  rec.onerror = () => { listening = false; btn.textContent = "🎙️ 음성 입력"; };
  rec.onend = () => { listening = false; btn.textContent = "🎙️ 음성 입력"; };
  btn.addEventListener("click", () => {
    if (!listening) { try { rec.start(); listening = true; btn.textContent = "🛑 중지"; } catch {} }
    else rec.stop();
  });
})();

/* ----- Archive ----- */
function renderArchive() {
  const grid = $("#worksGrid");
  grid.innerHTML = "";
  const works = Store.getWorks();
  if (works.length === 0) {
    grid.innerHTML = `<div class="empty">전시관이 아직 비어 있어요.<br>스튜디오에서 시와 음악, 배경을 만들어 첫 작품을 걸어보세요 🖼️</div>`;
    return;
  }
  works.forEach((w) => {
    const card = document.createElement("div");
    card.className = "work-card";

    const thumb = document.createElement("div");
    thumb.className = "work-thumb";
    const c = document.createElement("canvas");
    c.width = 480; c.height = 270;
    thumb.appendChild(c);
    Visual.draw(c, w.mood, w.seed || 1);

    const body = document.createElement("div");
    body.className = "work-body";
    const title = document.createElement("div");
    title.className = "work-title";
    title.textContent = w.title || "무제";
    const meta = document.createElement("div");
    meta.className = "work-meta";
    meta.textContent = `${w.style || ""} · ${new Date(w.createdAt).toLocaleString()}`;
    body.append(title, meta);

    const act = document.createElement("div");
    act.className = "work-actions";
    const loadBtn = document.createElement("button");
    loadBtn.className = "pill-btn small"; loadBtn.textContent = "불러오기";
    loadBtn.addEventListener("click", () => {
      $("#poemTitle").textContent = w.title;
      $("#poemOutput").textContent = w.poem;
      $("#poemOutput").dataset.generated = "1";
      Visual.draw($("#bgCanvas"), w.mood, w.seed || 1);
      $("#bgCanvas").dataset.seed = String(w.seed || 1);
      if (w.audio) { $("#audioPlayer").src = w.audio; $("#downloadWAV").disabled = true; }
      $$(".tab").find((t) => t.dataset.target === "#studio")?.click();
      toast("작품을 스튜디오로 불러왔어요");
    });
    const playBtn = document.createElement("button");
    playBtn.className = "pill-btn small"; playBtn.textContent = "듣기";
    playBtn.addEventListener("click", () => {
      if (w.audio) new Audio(w.audio).play().catch(() => toast("재생할 수 없어요"));
      else toast("오디오가 없습니다");
    });
    const delBtn = document.createElement("button");
    delBtn.className = "pill-btn small danger"; delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      Store.deleteWork(w.id);
      renderArchive();
      renderInsights();
      toast("작품을 삭제했어요.");
    });

    act.append(loadBtn, playBtn, delBtn);
    card.append(thumb, body, act);
    grid.appendChild(card);
  });
}

/* ===================== 10. Theme, tabs, bootstrap ===================== */
// Theme: data-theme attribute on <html>, persisted, with system-pref default.
(() => {
  const btn = $("#themeToggle");
  const apply = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    btn.setAttribute("aria-label", theme === "dark" ? "라이트 테마로 전환" : "다크 테마로 전환");
  };
  const saved = Store.read(Store.KEYS.theme, null);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  apply(saved || (prefersDark ? "dark" : "light"));
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
    Store.write(Store.KEYS.theme, next);
    // Redraw theme-aware canvases
    renderInsights();
    updateAnalysis({ persist: false });
  });
})();

// Tabs: toggle panels, aria-selected, lazy-render heavy views.
const renderers = {
  "#insights": renderInsights,
  "#calendar": renderCalendar,
  "#diary": () => { populateYearMonthFilter(); renderEntries(); },
  "#archive": renderArchive,
};
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    const id = tab.dataset.target;
    $$(".panel").forEach((p) => p.classList.toggle("active", "#" + p.id === id));
    renderers[id]?.();
  });
  tab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tab.click(); }
  });
});

// Initial paint
$("#footYear").textContent = new Date().getFullYear();
updateAnalysis({ persist: false });
Visual.draw($("#bgCanvas"), "차분", 1);
refreshDiaryViews();
renderArchive();
