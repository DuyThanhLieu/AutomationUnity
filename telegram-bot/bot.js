require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Thiếu TELEGRAM_BOT_TOKEN trong file .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const REMIND_MESSAGE = 'Mọi người tập trung làm việc nha! 💪';

bot.onText(/\/remind/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, REMIND_MESSAGE);
});

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

console.log('Bot đang chạy — gõ /remind trong group để gửi nhắc nhở.');
