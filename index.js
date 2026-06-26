require('dotenv').config();
const { bot } = require('./src/bot');

console.log('AtlasMenueBot startet...');

bot.launch({
  allowedUpdates: ['message', 'message_reaction'],
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
