/* Dimau Companion v1.0.2 — original Dimau code. See companion/README.md. */
(() => {
'use strict';
const currentScript = document.currentScript;
if (window.DimauCompanion) return;
const AVATARS = ['turtle', 'bird', 'lantern', 'dove', 'headphones', 'robot', 'ray', 'seed'];

function clampPosition(x, y, width, height, size = 76) {
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const maxX = Math.max(8, finite(width, 360) - size - 8);
  const maxY = Math.max(8, finite(height, 640) - size - 8);
  return { x: Math.max(8, Math.min(maxX, finite(x, maxX))), y: Math.max(8, Math.min(maxY, finite(y, maxY))) };
}

function safePreferences(value) {
  const p = value && typeof value === 'object' ? value : {};
  return {
    avatar: AVATARS.includes(p.avatar) ? p.avatar : null,
    calm: p.calm === true,
    side: p.side === 'left' ? 'left' : 'right',
    x: Number.isFinite(p.x) ? p.x : null,
    y: Number.isFinite(p.y) ? p.y : null,
  };
}

function normaliseProfile(input) {
  if (!input || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.id || '')) throw new TypeError('A stable app id is required.');
  const bound = (text, size) => String(text || '').slice(0, size);
  const topics = Array.isArray(input.topics) ? input.topics.slice(0, 8).map(t => ({
    id: bound(t.id, 80), label: bound(t.label, 100), help: bound(t.help, 1200),
    keywords: bound(t.keywords, 300),
  })).filter(t => t.id && t.label && t.help) : [];
  return {
    id: input.id, app: bound(input.app || input.id, 100), name: bound(input.name || 'Bula', 60),
    role: bound(input.role || 'Your app companion', 120), greeting: bound(input.greeting, 500),
    avatar: AVATARS.includes(input.avatar) ? input.avatar : 'robot',
    theme: /^[a-z-]+$/.test(input.theme || '') ? input.theme : 'ocean',
    topics,
  };
}

function localReply(profile, question) {
  const words = String(question).toLowerCase().match(/[a-z0-9]+/g) || [];
  const useful = words.filter(w => w.length > 2 && !['the', 'and', 'how', 'can', 'you', 'with', 'this', 'for', 'what', 'please'].includes(w));
  const ranked = profile.topics.map(t => {
    const haystack = (t.label + ' ' + t.keywords).toLowerCase().split(/[^a-z0-9]+/);
    return { t, score: useful.filter(w => haystack.includes(w)).length };
  }).sort((a, b) => b.score - a.score);
  if (ranked[0]?.score > 0) return { text: ranked[0].t.help, topicId: ranked[0].t.id };
  return { text: 'I can guide you through ' + profile.app + '. Choose a task below for its steps. Open-ended AI answers are available when this app connects an assistant service.', topicId: null };
}

function validateReply(value) {
  const text = typeof value === 'string' ? value : value?.text;
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('The assistant returned no answer.');
  return text.slice(0, 16000);
}

// Same-origin JSON transport only. Authentication, budgets and knowledge retrieval
// stay in the host service. This helper never accepts a provider key.
function createTransport(endpoint, fetcher = fetch, origin = location.origin) {
  const url = new URL(endpoint, origin);
  if (url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('The companion endpoint must be on this app origin.');
  }
  return async ({ question, appId, context, signal }) => {
    const response = await fetcher(url.href, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ appId, question: String(question).slice(0, 2000), context }),
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sign in to use the app assistant.' : 'The assistant service is unavailable. Try again.');
    return validateReply(await response.json());
  };
}


// Original vector artwork. No upstream character or sprite assets.
const face = '<g class="eyes" fill="#083b49"><ellipse cx="43" cy="48" rx="3" ry="4"/><ellipse cx="58" cy="48" rx="3" ry="4"/></g><path d="M46 57q5 5 10 0" fill="none" stroke="#083b49" stroke-width="2.4" stroke-linecap="round"/>';
const shapes = {
  turtle: '<g class="flippers" fill="#37b6a4"><ellipse cx="23" cy="59" rx="8" ry="17" transform="rotate(40 23 59)"/><ellipse cx="77" cy="59" rx="8" ry="17" transform="rotate(-40 77 59)"/><ellipse cx="31" cy="81" rx="6" ry="11"/><ellipse cx="68" cy="81" rx="6" ry="11"/></g><ellipse cx="50" cy="66" rx="28" ry="25" fill="#087e83"/><path d="m50 45 14 10v17L50 83 36 72V55z" fill="#6be0b2" stroke="#b9f6d4" stroke-width="2"/><circle cx="50" cy="45" r="22" fill="#a5ecd2"/>',
  bird: '<path class="wing" d="M27 47Q-1 38 17 71L38 65M73 47q28-9 10 24L62 65" fill="#1799ca"/><ellipse cx="50" cy="60" rx="29" ry="32" fill="#7bd6ee"/><path d="M32 36Q26 9 48 24Q59 4 64 30" fill="#ffd27d"/><ellipse cx="50" cy="70" rx="17" ry="18" fill="#e8fbff"/><path d="m47 58 5-7 6 7-6 5" fill="#f3a743"/>',
  lantern: '<path d="M36 28v-9q14-17 28 0v9" fill="none" stroke="#e7b56a" stroke-width="6"/><rect x="25" y="26" width="51" height="60" rx="20" fill="#ffcc80"/><rect x="32" y="33" width="37" height="43" rx="14" fill="#fff1c4"/><path d="M22 80h57v9H22zM31 22h39v9H31z" fill="#b97645"/><path class="spark" d="m77 17 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#ffe9b5"/>',
  dove: '<path class="wing" d="M32 62Q1 28 14 17q4 21 28 22M68 62q31-34 18-45-4 21-28 22" fill="#c1d7ff"/><path d="M31 64Q22 88 50 89q28-1 19-25l-4-25Q51 15 36 37z" fill="#fff"/><path d="m50 28 4-10 5 12" fill="#ecbc70"/><path d="m71 69 12-12m-7 8q-5-10-12-6m13 5q8 1 10-7" fill="none" stroke="#69bb8d" stroke-width="3"/>',
  headphones: '<rect x="23" y="27" width="55" height="58" rx="23" fill="#d1b6ff"/><path d="M18 55V43q0-34 33-34t32 34v12" fill="none" stroke="#62408e" stroke-width="8"/><rect x="13" y="45" width="15" height="27" rx="7" fill="#ff91aa"/><rect x="74" y="45" width="15" height="27" rx="7" fill="#ff91aa"/><path d="M29 78q21 24 42 0" fill="#7854b7"/><path class="spark" d="M86 20v15m0-14 9-3v13m-9 4q-8 3-6-3t6 0m9-1q-8 3-6-3t6 0" stroke="#e7caff" fill="none" stroke-width="3"/>',
  robot: '<path d="M50 17V9" stroke="#64d2e0" stroke-width="4"/><circle class="spark" cx="50" cy="8" r="5" fill="#ffb0a3"/><rect x="20" y="24" width="61" height="54" rx="22" fill="#f0fbff"/><rect x="29" y="34" width="43" height="33" rx="13" fill="#6cdbc9"/><path d="M33 82q17 15 34 0" fill="#7e9dce"/><rect x="9" y="42" width="12" height="23" rx="6" fill="#87c8ec"/><rect x="81" y="42" width="12" height="23" rx="6" fill="#87c8ec"/>',
  ray: '<path class="wing" d="M49 35Q17 11 7 47q4 27 36 24l8 24 8-25q30 3 35-24-9-36-42-11" fill="#7baedd"/><path d="M50 27q-30 14-25 36 25 24 51 0 4-23-26-36" fill="#bce8f5"/><path d="m32 34-6-15m42 15 6-15" stroke="#7baedd" stroke-width="6" stroke-linecap="round"/>',
  seed: '<path class="wing" d="M50 37Q7 36 21 11q24 0 29 26M51 36Q87 30 83 9q-24-1-32 27" fill="#6cd997"/><path d="M49 18v25" stroke="#399c64" stroke-width="4"/><path d="M23 47q29-28 56 0v20q-6 26-29 24-24-1-27-25z" fill="#e6bf88"/><path d="M28 72q22 13 45 0" stroke="#bd8e58" stroke-width="3" fill="none"/>',
};
function avatarSvg(name) {
  const key = AVATARS.includes(name) ? name : 'robot';
  return '<svg viewBox="0 0 100 105" aria-hidden="true" focusable="false"><g class="character">' + shapes[key] + face + '</g></svg>';
}

const topic = (id, label, help, keywords = '') => ({ id, label, help, keywords });
const profile = (id, app, name, avatar, theme, role, topics) => ({
  id, app, name, avatar, theme, role, topics,
  greeting: `Bula! I'm ${name}, your ${app} companion. Pick a task and we'll take it one step at a time.`,
});
const learn = [
  topic('lesson', 'Help me learn', 'Open a lesson from the app navigation. Start with its introduction, try the activity, then check your answer before moving on.', 'learn lesson study quiz activity'),
  topic('explain', 'Explain something', 'Use “Add selected text” after highlighting a short passage. A connected assistant can explain that passage; the local guide keeps the selection in this panel until you choose to send it.', 'explain meaning passage text'),
  topic('progress', 'My next step', 'Use the app’s progress or saved-work view to continue. I cannot see private progress unless the app explicitly connects it.', 'progress next continue saved'),
];
const maps = [
  topic('route', 'Plan a journey', 'Choose your destination in the map, open Directions and select walking or driving. Preview the route before starting. GPS tracking needs permission from you in the map.', 'route directions walk walking drive driving journey navigation destination'),
  topic('view', 'Help with the map', 'Use the map’s view controls to switch perspective. If 3D becomes slow, use the available simpler map view. Detailed mapping work belongs in Mapper.', 'map view terrain 3d slow render'),
  topic('location', 'Find my position', 'Use the map’s location control when you want to share GPS with this app. This companion does not read or send your coordinates.', 'location position gps track tracking'),
];
const music = [
  topic('listen', 'Find something to play', 'Browse the available catalogue and start a track with its Play control. This companion does not start audio automatically.', 'music listen song songs play audio catalogue'),
  topic('visuals', 'Explore music visuals', 'Use the player’s visualiser controls when available. Choose a gentle effect for a small phone or turn motion off in companion settings.', 'visual visualiser animation effects'),
  topic('rights', 'Prepare my own content', 'Work with recordings, lyrics and artwork you own or have permission to use. Keep the permission and source with the project before exporting or sharing it.', 'lyrics export upload rights recording content'),
];
const studio = [
  topic('create', 'Plan a creation', 'Start with one scene: subject, setting, camera movement, sound and intended length. Keep the brief with the project so later edits stay consistent.', 'create video image animation scene film prompt camera'),
  topic('edit', 'Improve an edit', 'Review the opening shot first, then pacing, audio balance and captions. Preview a short section before rendering the entire project.', 'edit cut trim timeline captions audio'),
  topic('export', 'Prepare an export', 'Choose the destination size and format in the editor. Preview the result and keep the editable project alongside the final file.', 'export render download format size'),
];
const commerce = [
  topic('find', 'Find the right option', 'Use the app’s catalogue and filters. Compare the actual description, total price and availability before choosing.', 'find search compare catalogue product listing option'),
  topic('enquiry', 'Prepare an enquiry', 'Open the relevant listing and use its contact or enquiry control. Include the item and your question; check the recipient before sending.', 'contact enquiry question seller message'),
  topic('order', 'Check an order', 'Use this app’s authenticated order or booking view. This companion cannot confirm a payment, change an order or reveal customer records.', 'order payment booking purchase checkout'),
];
const business = [
  topic('workflow', 'Walk me through a task', 'Start from the app’s existing task or workspace. Check the source inputs, make one change and review the result before saving.', 'task workflow work record source save'),
  topic('report', 'Review a report', 'Check the reporting period, units, source and missing data before drawing a conclusion. Keep assumptions separate from measured results.', 'report analytics data dashboard metrics'),
  topic('export', 'Prepare my records', 'Use the app’s export function and review the output. Keep customer and financial information inside the authorised workspace.', 'export records download accounting finance'),
];
const culture = [
  topic('explore', 'Explore a collection', 'Choose a collection or gallery from the app navigation. Open an item to read its description and source before moving to the next.', 'explore collection gallery history museum artefact'),
  topic('source', 'Understand a source', 'Look for the item’s creator, date and source record. Distinguish the historical source from later interpretation. A connected assistant should cite the actual catalogue item.', 'source author date evidence provenance book read'),
  topic('continue', 'Continue reading', 'Use the reader’s saved progress or bookmark controls. This companion does not overwrite reading progress or scan your private notes.', 'continue reading bookmark saved progress'),
];
const social = [
  topic('group', 'Find my community', 'Use the app’s existing group directory or search. Check the group description and membership rules before joining.', 'group groups community school village join'),
  topic('chat', 'Start a conversation', 'Open a person or group in the app and use its chat controls. Check who can see the conversation before posting.', 'chat message conversation board post'),
  topic('call', 'Prepare for a call', 'Open the app’s call controls when available. Review the participants, then grant microphone or camera access only when you are ready.', 'call audio video camera microphone'),
];
const profiles = Object.fromEntries([
  profile('fijilearn', 'FijiLearn', 'Lumi', 'bird', 'sky', 'Learning companion', learn),
  profile('fijian-bible', 'Fijian Bible', 'Vola', 'dove', 'indigo', 'Study companion', [
    topic('passage', 'Study a passage', 'Choose a book, chapter and verse in the reader. Read the surrounding passage, compare the available languages and write your own observations.', 'bible passage verse chapter study read'),
    topic('notes', 'Keep a study note', 'Use the reader’s note or save control for a verse. Private notes stay in the app’s existing account system; the companion does not read them automatically.', 'note notes save highlight bookmark'),
    topic('group', 'Study with a group', 'Use the app’s group controls when available. Choose what you want to share and check the audience before posting a reflection.', 'group share reflection fellowship'),
  ]),
  profile('fiji-history-virtual-museum', 'Fiji Living History Museum', 'Lali', 'lantern', 'sand', 'Museum guide', culture),
  profile('fiji-history-library', 'Na Volavola', 'Tale', 'lantern', 'sand', 'Reading companion', culture),
  profile('fiji-3d-living-topography', 'Fiji 3D Maps', 'Tiko', 'turtle', 'ocean', 'Travel companion', maps),
  profile('fiji-navigate', 'Fiji Navigate', 'Sail', 'ray', 'ocean', 'Journey companion', maps),
  profile('mapper', '3D Mapper', 'Atlas', 'ray', 'indigo', 'Mapping companion', [
    topic('survey', 'Plan a map project', 'Set the project extent and intended use before importing data. Record the coordinate reference system, resolution, source and date for each layer.', 'survey project extent import layer crs data terrain'),
    topic('measure', 'Check a measurement', 'Confirm units, coordinate system and data resolution before measuring. Treat terrain-derived distances and areas as estimates unless verified for the intended use.', 'measure measurement distance area elevation units'),
    maps[1],
  ]),
  profile('sere', 'Sere', 'Sere', 'headphones', 'coral', 'Music companion', music),
  profile('fijian-lyrics', 'Fijian Lyrics', 'Sere', 'headphones', 'coral', 'Song companion', music),
  profile('music', 'Dimau Music', 'Riff', 'headphones', 'indigo', 'Listening companion', music),
  profile('dimau-3d-studio', 'Dimau Studios', 'Pixel', 'robot', 'indigo', 'Creative companion', studio),
  profile('dimau-visuals', 'Dimau Visuals', 'Prism', 'ray', 'sky', 'Visual companion', studio),
  profile('dimau-content', 'Dimau Content', 'Pixel', 'robot', 'coral', 'Content companion', studio),
  profile('sota-kece', 'Sota Kece', 'Bula', 'bird', 'coral', 'Community companion', social),
  profile('bulavata', 'Bulavata', 'Bula', 'bird', 'sky', 'Community companion', social),
  profile('villageos', 'Vanua OS', 'Viti', 'seed', 'forest', 'Village companion', [...social.slice(0, 2), business[0]]),
  profile('qele', 'Qele', 'Viti', 'seed', 'forest', 'Land workspace companion', business),
  profile('donovandimau-fiji-agriculture', 'VanuaGrow', 'Bua', 'seed', 'forest', 'Growing companion', [
    topic('crop', 'Plan a growing task', 'Choose your crop and review the recorded season, plot and current observations. Keep dates and actual field notes with the task.', 'crop growing planting farm agriculture season plot'),
    topic('records', 'Review farm records', 'Check the date, units and source for crop, stock and sales records. Compare like periods and note any missing observations.', 'records stock sales harvest report'),
    business[2],
  ]),
  profile('sema-accounting', 'SEMA', 'Tally', 'robot', 'forest', 'Accounting companion', business),
  profile('fiji-analytics', 'Fiji Analytics', 'Prism', 'ray', 'indigo', 'Data companion', business),
  profile('fiji-corpus-desk', 'Fiji Corpus Desk', 'Tale', 'lantern', 'sand', 'Collection companion', culture),
  profile('bula-score', 'Bula Score', 'Bula', 'robot', 'ocean', 'Product guide', business),
  profile('fiji-tap', 'Fiji Tap', 'Tap', 'robot', 'sky', 'Payment app guide', business),
  profile('dimau-fintech', 'Dimau Fintech', 'Bula', 'ray', 'ocean', 'Venture companion', business),
  profile('dimau-group', 'Dimau Group', 'Bula', 'bird', 'ocean', 'Venture companion', business),
  profile('soli-fiji', 'Soli Fiji', 'Soli', 'seed', 'forest', 'Project companion', business),
  profile('mydebtcalculator', 'My Debt Calculator', 'Tally', 'robot', 'ocean', 'Calculator guide', [
    topic('calculate', 'Understand a calculation', 'Enter the balance, interest rate and payment schedule shown on your actual statement. Check units and fees before comparing scenarios. Results depend on these inputs.', 'calculate calculator debt balance interest payment rate'),
    topic('compare', 'Compare scenarios', 'Change one assumption at a time and compare the resulting repayment time and total cost. Keep a copy of the assumptions with the result.', 'compare scenario cost result repayment'),
    business[2],
  ]),
  profile('fhtb-calculator-site', 'FHTB Calculator', 'Tally', 'robot', 'indigo', 'Calculator guide', [
    topic('inputs', 'Check my inputs', 'Use the calculator’s field guidance and current scheme information. Review eligibility, pay and repayment inputs before relying on the estimate.', 'input calculate calculator pay eligibility repayment'),
    topic('result', 'Understand my result', 'Read the assumptions and explanation beside the result. Keep the calculation with its input date and verify current scheme terms through the official source.', 'result estimate report scheme'),
    business[2],
  ]),
  profile('fiji-culture-corner', 'Fiji Culture Corner', 'Lali', 'lantern', 'sand', 'Shop companion', commerce),
  profile('viti-market', 'Viti Market', 'Bula', 'bird', 'coral', 'Marketplace companion', commerce),
  profile('vitiauto', 'VitiAuto', 'Sail', 'ray', 'sky', 'Vehicle companion', commerce),
  profile('dimau-homes', 'Dimau Homes', 'Bua', 'seed', 'forest', 'Home planning companion', commerce),
  profile('myfiji', 'MyFiji', 'Bula', 'turtle', 'ocean', 'Fiji app companion', [...commerce.slice(0, 2), social[0]]),
  profile('fiji-digital', 'Fiji Digital', 'Bula', 'robot', 'sky', 'App companion', business),
  profile('fiji-guide', 'Fiji Apps Guide', 'Bula', 'bird', 'sky', 'Discovery companion', commerce),
  profile('dimau-rating-hub', 'Dimau Rating Hub', 'Prism', 'ray', 'indigo', 'Review companion', business),
  profile('donovan-command-centre', 'Command Centre', 'Ops', 'robot', 'ocean', 'Workspace companion', business),
  profile('dimau-ops', 'Dimau Ops', 'Ops', 'robot', 'ocean', 'Operations companion', [
    topic('projects', 'Find project work', 'Open Projects and select the project card. Compare Live with its latest saved revision and use the exact linked repository and preview.', 'project projects card revision live preview'),
    topic('work', 'Review current work', 'Open Work to check task ownership and active leases. Review the current handover before continuing an existing task.', 'work task lease owner handover continue'),
    topic('research', 'Use research', 'Open the existing research controls in the Room. Check the report’s sources, date and limitations before turning a finding into a task.', 'research sources report room'),
  ]),
].map(p => [p.id, p]));


const instances = new Map();
const template = `
<div class="anchor"><button class="bubble" type="button" aria-expanded="false" aria-controls="companion-panel"><span class="art"></span><span class="badge" aria-hidden="true"></span><span class="sr-only">Open companion</span></button><span class="name-tag"></span></div><button type="button" class="restore" hidden>Show companion</button>
<section class="panel" id="companion-panel" role="dialog" hidden>
  <header><span class="portrait" aria-hidden="true"></span><div class="identity"><strong class="name"></strong><span class="role"></span></div><button type="button" class="icon settings-toggle" aria-label="Companion settings" aria-expanded="false">⚙</button><button type="button" class="icon close" aria-label="Minimise companion">×</button></header>
  <div class="mode"></div>
  <div class="settings" hidden><label>Character<select class="avatar-choice"></select></label><label>Dock side<select class="side-choice"><option value="right">Right</option><option value="left">Left</option></select></label><label class="check"><input type="checkbox" class="calm-choice"> Calm motion</label><button type="button" class="hide">Hide for this visit</button></div>
  <div class="conversation" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Companion conversation"></div>
  <nav class="tasks" aria-label="Suggested tasks"></nav>
  <p class="selection" hidden></p>
  <div class="context-tools"><button type="button" class="attach">Add selected text</button><button type="button" class="clear-context" hidden>Remove text</button><button type="button" class="read">Read reply</button></div>
  <form><label class="sr-only" for="companion-question">Ask your companion</label><div class="composer"><textarea id="companion-question" rows="2" maxlength="2000" placeholder="What would you like help with?"></textarea><button class="send" type="submit">Send</button></div><label class="check context-check"><input type="checkbox" class="include-page"> Include this page title</label></form>
  <footer><span class="status" role="status">Ready</span><button type="button" class="stop" hidden>Stop</button><button type="button" class="clear">Clear chat</button></footer>
</section>`;

class CompanionElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = 'idle';
    this.messages = [];
    this.pending = null;
    this.selection = '';
    this.lastReply = '';
    this.disposed = false;
  }

  initialise(options) {
    this.options = options;
    this.profile = normaliseProfile(options.profile);
    this.ask = typeof options.onAsk === 'function' ? options.onAsk : options.endpoint ? createTransport(options.endpoint) : null;
    this.prefKey = 'dimau-companion:v1:' + this.profile.id;
    let stored;
    try { stored = JSON.parse(localStorage.getItem(this.prefKey)); } catch { stored = null; }
    this.prefs = safePreferences(stored);
    this.events = new AbortController();
    this.shadowRoot.innerHTML = template;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = options.cssURL;
    this.shadowRoot.prepend(link);
    this.ui = Object.fromEntries(['anchor','bubble','art','badge','name-tag','panel','portrait','name','role','mode','settings','settings-toggle','avatar-choice','side-choice','calm-choice','hide','close','conversation','tasks','selection','attach','clear-context','read','send','include-page','status','stop','clear','restore'].map(k => [k, this.shadowRoot.querySelector('.' + k)]));
    this.ui.question = this.shadowRoot.querySelector('textarea');
    this.setAttribute('data-theme', this.profile.theme);
    this.ui.name.textContent = this.profile.name;
    this.ui['name-tag'].textContent = this.profile.name;
    this.ui.role.textContent = this.profile.role;
    this.ui.panel.setAttribute('aria-label', this.profile.name + ' — ' + this.profile.role);
    this.ui.bubble.setAttribute('aria-label', 'Open ' + this.profile.name + ', ' + this.profile.role + '. Drag to move.');
    this.ui.mode.textContent = this.ask ? 'Connected assistant · sends only what you choose' : 'App guide · works locally';
    this.ui.read.disabled = !('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    for (const avatar of AVATARS) {
      const option = document.createElement('option'); option.value = avatar;
      option.textContent = avatar[0].toUpperCase() + avatar.slice(1);
      this.ui['avatar-choice'].append(option);
    }
    this.ui['avatar-choice'].value = this.prefs.avatar || this.profile.avatar;
    this.ui['side-choice'].value = this.prefs.side;
    this.ui['calm-choice'].checked = this.prefs.calm;
    this.applyPreferences();
    this.renderTasks();
    this.appendMessage('assistant', this.profile.greeting || this.profile.role);
    const on = (node, event, fn) => node.addEventListener(event, fn, { signal: this.events.signal });
    on(this.ui.bubble, 'click', () => {
      if (this.moved) { this.moved = false; return; }
      this.toggle();
    });
    on(this.ui.close, 'click', () => this.close());
    on(this.ui.hide, 'click', () => this.hide());
    on(this.ui.restore, 'click', () => { this.show(); this.ui.bubble.focus(); });
    on(this.ui['settings-toggle'], 'click', () => {
      const open = this.ui.settings.hidden;
      this.ui.settings.hidden = !open;
      this.ui['settings-toggle'].setAttribute('aria-expanded', String(open));
    });
    on(this.ui['avatar-choice'], 'change', () => { this.prefs.avatar = this.ui['avatar-choice'].value; this.applyPreferences(); this.persist(); });
    on(this.ui['side-choice'], 'change', () => {
      this.prefs.side = this.ui['side-choice'].value; this.prefs.x = null; this.prefs.y = null;
      this.applyPreferences(); this.persist();
    });
    on(this.ui['calm-choice'], 'change', () => { this.prefs.calm = this.ui['calm-choice'].checked; this.applyPreferences(); this.persist(); });
    on(this.shadowRoot.querySelector('form'), 'submit', e => { e.preventDefault(); void this.submit(); });
    on(this.ui.question, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void this.submit(); } });
    on(this.shadowRoot, 'keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    on(this.ui.stop, 'click', () => this.cancel());
    on(this.ui.clear, 'click', () => {
      this.cancel(); this.messages = []; this.lastReply = ''; this.ui.conversation.replaceChildren();
      this.ui.question.value = ''; this.clearContext(); this.ui['include-page'].checked = false;
      this.appendMessage('assistant', this.profile.greeting || this.profile.role);
    });
    on(this.ui.attach, 'click', () => {
      const selected = String(window.getSelection?.() || '').trim().slice(0, 1200);
      if (!selected) { this.setStatus('Highlight a short passage in the app, then choose Add selected text.'); return; }
      this.selection = selected;
      this.ui.selection.textContent = 'Included when you send: ' + selected;
      this.ui.selection.hidden = false; this.ui['clear-context'].hidden = false;
    });
    on(this.ui['clear-context'], 'click', () => this.clearContext());
    on(this.ui.read, 'click', () => this.readReply());
    on(window, 'resize', () => this.position());
    on(window, 'offline', () => this.setStatus(this.ask ? 'Offline — local task guides still work.' : 'Offline — local guide ready.'));
    on(window, 'online', () => this.setStatus('Ready'));
    on(document, 'visibilitychange', () => {
      this.toggleAttribute('data-paused', document.hidden);
      if (document.hidden) this.stopSpeech();
    });
    this.toggleAttribute('data-paused', document.hidden);
    on(this.ui.bubble, 'pointerdown', e => this.dragStart(e));
    on(this.ui.bubble, 'pointermove', e => this.dragMove(e));
    on(this.ui.bubble, 'pointerup', () => this.dragEnd());
    on(this.ui.bubble, 'pointercancel', () => this.dragEnd());
    on(this.ui.bubble, 'keydown', e => {
      if (!e.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const p = this.currentPosition;
      this.position(p.x + (e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0), p.y + (e.key === 'ArrowUp' ? -16 : e.key === 'ArrowDown' ? 16 : 0));
      this.prefs.x = this.currentPosition.x; this.prefs.y = this.currentPosition.y; this.persist();
    });
    return this;
  }

  applyPreferences() {
    const svg = avatarSvg(this.prefs.avatar || this.profile.avatar);
    this.ui.art.innerHTML = svg; this.ui.portrait.innerHTML = svg;
    this.toggleAttribute('data-calm', this.prefs.calm);
    this.setAttribute('data-side', this.prefs.side);
    this.position();
  }
  position(x = this.prefs.x, y = this.prefs.y) {
    const width = window.innerWidth || 360, height = window.innerHeight || 640;
    const p = clampPosition(x ?? (this.prefs.side === 'left' ? 16 : width - 96), y ?? height - 176, width, height);
    this.currentPosition = p;
    this.ui.anchor.style.left = p.x + 'px'; this.ui.anchor.style.top = p.y + 'px';
  }
  dragStart(e) {
    if (e.button !== 0) return;
    this.drag = { startX: this.currentPosition.x, startY: this.currentPosition.y };
    this.drag.pointerX = e.clientX; this.drag.pointerY = e.clientY;
    this.moved = false;
    this.ui.bubble.setPointerCapture?.(e.pointerId);
  }
  dragMove(e) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.pointerX, dy = e.clientY - this.drag.pointerY;
    if (Math.hypot(dx, dy) < 5 && !this.moved) return;
    this.moved = true;
    this.position(this.drag.startX + dx, this.drag.startY + dy);
  }
  dragEnd() {
    if (!this.drag) return;
    if (this.moved) { this.prefs.x = this.currentPosition.x; this.prefs.y = this.currentPosition.y; this.persist(); }
    this.drag = null;
  }
  persist() { try { localStorage.setItem(this.prefKey, JSON.stringify(this.prefs)); } catch { /* Private mode still works. */ } }
  renderTasks() {
    for (const topic of this.profile.topics) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = topic.label;
      button.addEventListener('click', () => {
        if (this.pending) return;
        this.appendMessage('assistant', topic.help);
        const handler = this.options.actions?.[topic.id];
        if (typeof handler === 'function') {
          try { Promise.resolve(handler({ appId: this.profile.id, topicId: topic.id })).catch(() => this.setStatus('The app could not open this task.', 'error')); }
          catch { this.setStatus('The app could not open this task.', 'error'); }
        }
      }, { signal: this.events.signal });
      this.ui.tasks.append(button);
    }
  }
  appendMessage(role, text) {
    const content = String(text).slice(0, 16000);
    const p = document.createElement('p'); p.className = 'message ' + role;
    p.textContent = content; this.ui.conversation.append(p);
    this.messages.push({ role, text: content });
    while (this.messages.length > 30) { this.messages.shift(); this.ui.conversation.firstElementChild?.remove(); }
    if (role === 'assistant') this.lastReply = content;
    p.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }
  setStatus(text, state = 'idle') {
    this.ui.status.textContent = text; this.state = state; this.setAttribute('data-state', state);
  }
  async submit() {
    const question = this.ui.question.value.trim();
    if (!question || this.pending || this.disposed) return;
    this.stopSpeech();
    this.ui.question.value = ''; this.appendMessage('user', question);
    if (!this.ask) {
      this.appendMessage('assistant', localReply(this.profile, question).text);
      this.setStatus('Local guide · no message was sent'); return;
    }
    const controller = new AbortController(); this.pending = controller;
    this.ui.send.disabled = true; this.ui.stop.hidden = false;
    this.setStatus('Working…', 'working');
    const context = {};
    if (this.selection) context.selectedText = this.selection;
    if (this.ui['include-page'].checked) context.pageTitle = document.title.slice(0, 200);
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs || 30000);
    try {
      // Race with abort even if a custom transport neglects AbortSignal.
      const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }));
      const answer = await Promise.race([Promise.resolve().then(() => this.ask({ appId: this.profile.id, question, context, signal: controller.signal })), aborted]);
      if (this.pending !== controller || this.disposed || controller.signal.aborted) return;
      this.appendMessage('assistant', validateReply(answer)); this.setStatus('Ready', 'success');
    } catch (error) {
      if (this.pending !== controller || this.disposed) return;
      if (controller.signal.aborted) this.setStatus('Stopped. Your question stays in this chat.');
      else this.setStatus(error?.message === 'Sign in to use the app assistant.' ? error.message : 'No answer received. Try again or use a task guide.', 'error');
    } finally {
      clearTimeout(timeout);
      if (this.pending === controller) { this.pending = null; this.ui.send.disabled = false; this.ui.stop.hidden = true; }
    }
  }
  cancel() {
    this.pending?.abort(); this.pending = null;
    if (this.ui) { this.ui.send.disabled = false; this.ui.stop.hidden = true; this.setStatus('Stopped'); }
    this.stopSpeech();
  }
  clearContext() { this.selection = ''; this.ui.selection.textContent = ''; this.ui.selection.hidden = true; this.ui['clear-context'].hidden = true; }
  readReply() {
    if (!this.lastReply || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    this.stopSpeech(); this.utterance = new SpeechSynthesisUtterance(this.lastReply.slice(0, 3000));
    this.setAttribute('data-speaking', '');
    this.utterance.onend = this.utterance.onerror = () => this.removeAttribute('data-speaking');
    speechSynthesis.speak(this.utterance);
  }
  stopSpeech() { if (this.utterance) window.speechSynthesis?.cancel(); this.utterance = null; this.removeAttribute('data-speaking'); }
  toggle() { if (this.ui.panel.hidden) this.open(); else this.close(); }
  open() {
    if (this.disposed) return;
    this.show(); this.ui.panel.hidden = false; this.ui.bubble.setAttribute('aria-expanded', 'true');
    this.ui.question.focus({ preventScroll: true });
  }
  close() { this.ui.panel.hidden = true; this.ui.bubble.setAttribute('aria-expanded', 'false'); this.cancel(); this.ui.bubble.focus({ preventScroll: true }); }
  hide() { this.close(); this.ui.anchor.hidden = true; this.ui.restore.hidden = false; this.ui.restore.focus(); }
  show() { this.hidden = false; this.ui.anchor.hidden = false; this.ui.restore.hidden = true; this.position(); }
  disconnectedCallback() { this.destroy(); }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.cancel(); this.events?.abort();
    if (instances.get(this.profile?.id) === this) instances.delete(this.profile.id);
    this.remove();
  }
}

if (!customElements.get('dimau-companion')) customElements.define('dimau-companion', CompanionElement);
function mount(options = {}) {
  const profile = options.profile || profiles[options.appId];
  if (!profile) throw new TypeError('Unknown app profile.');
  const existing = instances.get(profile.id);
  if (existing && !existing.disposed) return existing;
  const cssURL = options.cssURL || new URL('./dimau-companion.css', options.assetBase || document.baseURI).href;
  const element = document.createElement('dimau-companion');
  element.initialise({ ...options, profile, cssURL });
  instances.set(profile.id, element); document.body.append(element);
  return element;
}
function get(appId) { return instances.get(appId); }

const assetBase = currentScript?.src || document.baseURI;
window.DimauCompanion = { version:'1.0.2', profiles, createTransport, get, mount: options => mount({ assetBase, ...options }) };
const autoApp = currentScript?.dataset.app;
if (autoApp && (window.self === window.top || currentScript?.dataset.companionFrame === 'allow')) { const start = () => window.DimauCompanion.mount({ appId:autoApp }); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start(); }
})();
