import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import { v4 as uuidv4 } from 'uuid';
import mammoth from 'mammoth';

const {
  BOT_TOKEN, OWNER_ID, GH_TOKEN, GH_OWNER, GH_REPO,
  GH_BRANCH = 'main', GH_PATH = 'prips.json'
} = process.env;

if (!BOT_TOKEN || !OWNER_ID || !GH_TOKEN || !GH_OWNER || !GH_REPO) {
  console.error('❌ Нет обязательных переменных окружения.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const gh = new Octokit({ auth: GH_TOKEN });

function onlyOwner(ctx, next) {
  if (String(ctx.from?.id) !== String(OWNER_ID)) {
    return ctx.reply('⛔ Только владелец может добавлять ПРИПы.');
  }
  return next();
}

// --- RTF naive
function rtfToText(rtfBuf) {
  let s = rtfBuf.toString('utf8');
  s = s.replace(/\\par[d]?/g, '\n');
  s = s.replace(/\\'[0-9a-fA-F]{2}/g, (m)=> String.fromCharCode(parseInt(m.slice(2),16)));
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

// --- координаты
function parseCoords(text) {
  const t = text.replace(/[,;]/g, ' ').replace(/\s+/g,' ').toUpperCase();
  const re = /(\d{1,3})[°\-:\s]?(\d{1,2})[\'’′\-:\s]?(\d{1,2}(?:\.\d+)?)?["”″]?\s*([СЮSN])\D+(\d{1,3})[°\-:\s]?(\d{1,2})[\'’′\-:\s]?(\d{1,2}(?:\.\d+)?)?["”″]?\s*([ВЗEW])/;
  const m = t.match(re);
  if (!m) return null;
  const d1 = +m[1], m1 = +m[2], s1 = m[3]? +m[3] : 0, h1 = m[4];
  const d2 = +m[5], m2 = +m[6], s2 = m[7]? +m[7] : 0, h2 = m[8];
  const dmsToDec = (d,m,s,hemi,isLat) => {
    let val = d + m/60 + s/3600;
    const neg = (hemi==='Ю'||hemi==='S') || (!isLat && (hemi==='З'||hemi==='W'));
    return neg ? -val : val;
  };
  return { lat: dmsToDec(d1,m1,s1,h1,true), lng: dmsToDec(d2,m2,s2,h2,false) };
}

// --- раздел и номер
function classifySection(title='', body='') {
  const hay = (title + ' ' + body).toUpperCase();
  if (hay.includes('ПРИП ТАГАНРОГ')) return 'ПРИП Таганрог';
  if (hay.includes('ПРИП НОВОРОССИЙСК')) return 'ПРИП Новороссийск';
  return 'Прочее';
}
function extractPripNumber(text='') {
  const m = text.toUpperCase().match(/ПРИП[^0-9\n]*\s(\d{1,5})/);
  return m ? parseInt(m[1],10) : null;
}
// отрезать всё после НННН/NNNN
function cutBeforeNNNN(t='') {
  const parts = t.split(/(^|\n)\s*(НННН|NNNN)\s*($|\n)/i);
  return parts[0].trim();
}

// --- запись
async function commitPrip(obj) {
  const { data: file } = await gh.repos.getContent({
    owner: GH_OWNER, repo: GH_REPO, path: GH_PATH, ref: GH_BRANCH
  });
  if (Array.isArray(file)) throw new Error('Ожидался файл');
  const sha = file.sha;
  const current = Buffer.from(file.content, 'base64').toString('utf8');
  let json = [];
  try { json = JSON.parse(current); } catch {}
  json.unshift({ ...obj, id: uuidv4(), createdAt: new Date().toISOString() });
  const content = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
  await gh.repos.createOrUpdateFileContents({
    owner: GH_OWNER, repo: GH_REPO, path: GH_PATH, branch: GH_BRANCH,
    message: `add PRIP: ${obj.section || ''} ${obj.number ?? ''}`.trim(),
    content, sha
  });
}

function toDMM(val,isLat){
  const hemi = isLat ? (val>=0 ? 'N' : 'S') : (val>=0 ? 'E' : 'W');
  const abs = Math.abs(val); const deg = Math.floor(abs);
  const min = (abs - deg)*60; const minStr = min.toFixed(2).replace('.', ',');
  return `${deg}°${minStr}' ${hemi}`;
}

// --- Команды и хендлеры
bot.start((ctx)=> ctx.reply(
  'Пришли .rtf/.docx или текст с ПРИПом.\n' +
  'Бот найдёт координаты, номер ПРИПа, раздел и добавит точку на карту.'
));

bot.command('add', onlyOwner, async (ctx) => {
  try {
    const raw = ctx.message.text.replace(/^\/add(@\w+)?\s*/i, '');
    const [title, latStr, lngStr, ...rest] = raw.split('|').map(s=>s.trim());
    if (!title || !latStr || !lngStr) return ctx.reply('Формат: /add Название | lat | lng | описание');
    const lat = Number(latStr), lng = Number(lngStr);
    const section = classifySection(title, rest.join(' '));
    const number = extractPripNumber(title);
    const fullText = cutBeforeNNNN(`${title}\n${rest.join(' ')}`);
    await commitPrip({ section, number, title, desc: rest.join(' | '), fullText, lat, lng });
    ctx.reply(`✅ Добавлено: ${section || ''} ${number?('№'+number):''}\n${toDMM(lat,true)}, ${toDMM(lng,false)}`);
  } catch (e) { console.error(e); ctx.reply('⚠️ Ошибка добавления.'); }
});

bot.on('text', onlyOwner, async (ctx) => {
  try {
    const text = ctx.message.text || '';
    const coords = parseCoords(text);
    if (!coords) return; // игнорируем посторонний текст
    const clean = cutBeforeNNNN(text);
    const lines = clean.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const title = lines[0] || 'ПРИП';
    const desc  = lines.slice(1).join(' ').slice(0, 800);
    const section = classifySection(title, clean);
    const number = extractPripNumber(clean);
    await commitPrip({ section, number, title, desc, fullText: clean, lat: coords.lat, lng: coords.lng });
    ctx.reply(`✅ Добавлено из текста: ${section||''} ${number?('№'+number):''}\n${toDMM(coords.lat,true)}, ${toDMM(coords.lng,false)}`);
  } catch (e) { console.error(e); }
});

bot.on('document', onlyOwner, async (ctx) => {
  try {
    const doc = ctx.message.document;
    const ext = (doc.file_name || '').toLowerCase().split('.').pop();
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const resp = await fetch(link.href);
    const buf = Buffer.from(await resp.arrayBuffer());

    let text = '';
    if (ext === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      text = value || '';
    } else if (ext === 'rtf' || ext === 'doc') {
      text = rtfToText(buf);
    } else {
      return ctx.reply('Формат не поддержан. Пришли .rtf или .docx');
    }
    if (!text.trim()) return ctx.reply('Не удалось извлечь текст из файла.');

    const coords = parseCoords(text);
    if (!coords) return ctx.reply('Координаты не найдены в документе.');

    const clean = cutBeforeNNNN(text);
    const lines = clean.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const title = lines[0] || 'ПРИП';
    const desc  = lines.slice(1).join(' ').slice(0, 800);
    const section = classifySection(title, clean);
    const number = extractPripNumber(clean);

    await commitPrip({ section, number, title, desc, fullText: clean, lat: coords.lat, lng: coords.lng });
    ctx.reply(`✅ Добавлено из файла: ${section||''} ${number?('№'+number):''}\n${toDMM(coords.lat,true)}, ${toDMM(coords.lng,false)}`);
  } catch (e) {
    console.error(e);
    ctx.reply('⚠️ Не удалось обработать документ.');
  }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
