require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const { handlePhoto } = require('./agent');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ALLOWED_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID);

bot.use(session());

bot.use((ctx, next) => {
  if (ctx.chat?.id !== ALLOWED_CHAT_ID) return;
  return next();
});

bot.start((ctx) => {
  ctx.reply('Hallo! Schick mir ein Foto der Speisekarte.');
});

bot.on('photo', async (ctx) => {
  ctx.session ??= {};
  const photo = ctx.message.photo.at(-1);
  ctx.session.fileId = photo.file_id;
  ctx.session.step = 'ask_type';

  await ctx.reply('Handelt es sich um die *Mittagskarte* oder die *Abendkarte*?', {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [['Mittagskarte', 'Abendkarte']],
      one_time_keyboard: true,
      resize_keyboard: true,
    },
  });
});

bot.on('text', async (ctx) => {
  ctx.session ??= {};
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  if (step === 'ask_type') {
    if (text === 'Mittagskarte') {
      ctx.session.type = 'lunch';
      ctx.session.step = 'done';
      await ctx.reply('Verstanden! Die Mittagskarte wird heute um 16:00 Uhr auf der Webseite aktualisiert.', {
        reply_markup: { remove_keyboard: true },
      });
      await processMenu(ctx);
    } else if (text === 'Abendkarte') {
      ctx.session.type = 'dinner';
      ctx.session.step = 'ask_month';
      await ctx.reply('Für welchen Monat gilt diese Abendkarte? (z.B. *Juli 2026*)', {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });
    } else {
      await ctx.reply('Bitte wähle *Mittagskarte* oder *Abendkarte*.', { parse_mode: 'Markdown' });
    }
    return;
  }

  if (step === 'ask_month') {
    ctx.session.month = text;
    ctx.session.step = 'done';
    await ctx.reply('Verstanden! Abendkarte für *' + text + '* wird verarbeitet...', { parse_mode: 'Markdown' });
    await processMenu(ctx);
    return;
  }
});

async function processMenu(ctx) {
  await ctx.reply('Einen Moment, Claude analysiert die Karte und erstellt eine Vorschau...');
  try {
    const { handlePhoto } = require('./agent');
    const { stagingUrl } = await handlePhoto({
      fileId: ctx.session.fileId,
      type: ctx.session.type,
      month: ctx.session.month ?? null,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    });

    await ctx.reply(
      'Vorschau bereit!\n\n' + stagingUrl + '\n\nBitte prüfe die Seite und reagiere:\n👍 zum Bestätigen\n👎 zum Abbrechen'
    );

    ctx.session = {};
  } catch (err) {
    console.error(err);
    await ctx.reply('Fehler bei der Verarbeitung. Bitte schick das Foto erneut.');
    ctx.session = {};
  }
}

bot.on('message_reaction', async (ctx) => {
  const reaction = ctx.update.message_reaction;
  const emoji = reaction?.new_reaction?.[0]?.emoji;

  if (emoji === '👍') {
    await ctx.telegram.sendMessage(ALLOWED_CHAT_ID, 'Wird live gestellt...');
    const { publishLive } = require('./deploy');
    await publishLive();
    await ctx.telegram.sendMessage(ALLOWED_CHAT_ID, 'Die Webseite wurde erfolgreich aktualisiert!');
  } else if (emoji === '👎') {
    await ctx.telegram.sendMessage(ALLOWED_CHAT_ID, 'Abgebrochen. Schick ein neues Foto wenn du bereit bist.');
    const { cancelStaging } = require('./deploy');
    await cancelStaging();
  }
});

module.exports = { bot };
