import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import { v4 as uuidv4 } from 'uuid';

const {
  BOT_TOKEN,        // токен бота от @BotFather
  OWNER_ID,         // твой Telegram ID
  GH_TOKEN,         // GitHub fine-grained token (repo contents: read/write)
  GH_OWNER,         // напр. "ermakov777"
  GH_REPO,          // напр. "prip-navip-map"
  GH_BRANCH = 'main',
  GH_PATH = 'data/prips.json',
} = process.env;

if (!BOT_TOKEN || !OWNER_ID || !GH_TOKEN || !GH_OWNER || !GH_REPO) {
  console.error('❌ Не заданы обязательные переменные окружения. См. .env.example');
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

bot.start((ctx)=> ctx.reply('Привет! Команда:\n/add Название | lat | lng | описание'));

// Пример: /add ПРИП у парка | 55.752 | 37.623 | вход со стороны реки
bot.command('add', onlyOwner, async (ctx) => {
  try {
    const raw = ctx.message.text.replace(/^\/add(@\w+)?\s*/i, '');
    const parts = raw.split('|').map(s=>s.trim());
    const [title, latStr, lngStr, ...rest] = parts;

    if (!title || !latStr || !lngStr) {
      return ctx.reply('Формат: /add Название | lat | lng | описание');
    }

    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return ctx.reply('lat/lng должны быть числами');
    }

    // 1) читаем текущий файл
    const { data: file } = await gh.repos.getContent({
      owner: GH_OWNER, repo: GH_REPO, path: GH_PATH, ref: GH_BRANCH
    });

    if (Array.isArray(file)) throw new Error('Ожидался файл, а не директория');

    const sha = file.sha;
    const existing = Buffer.from(file.content, 'base64').toString('utf8');
    let json = [];
    try { json = JSON.parse(existing); } catch {}

    // 2) добавляем ПРИП
    const newPrip = {
      id: uuidv4(),
      title,
      desc: (rest && rest.join(' | ')) || '',
      lat, lng,
      createdAt: new Date().toISOString(),
    };
    json.unshift(newPrip);

    // 3) коммит
    const content = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
    await gh.repos.createOrUpdateFileContents({
      owner: GH_OWNER, repo: GH_REPO, path: GH_PATH, branch: GH_BRANCH,
      message: `add PRIP: ${title}`,
      content, sha
    });

    ctx.reply(`✅ Добавлено: ${title}\n(${lat}, ${lng})`);
  } catch (e) {
    console.error(e);
    ctx.reply('⚠️ Ошибка добавления. Проверь токен/права/путь.');
  }
});

bot.command('help', (ctx)=> ctx.reply('Команда: /add Название | lat | lng | описание'));

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
