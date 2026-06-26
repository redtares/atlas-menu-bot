require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { pushToStaging } = require('./deploy');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function handlePhoto({ fileId, type, month, botToken }) {
  // Foto von Telegram herunterladen
  const fileRes = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const filePath = fileRes.data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  const imageRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const imageBase64 = Buffer.from(imageRes.data).toString('base64');
  const mimeType = 'image/jpeg';

  const typeLabel = type === 'lunch' ? 'Mittagskarte' : `Abendkarte (${month})`;
  const context = type === 'lunch'
    ? 'Dies ist die Mittagskarte. Sie gilt für morgen und soll im Mittagskarten-Bereich der Webseite eingefügt werden.'
    : `Dies ist die Abendkarte für den Monat ${month}. Sie soll im Abendkarten-Bereich der Webseite eingefügt werden.`;

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Du bist ein Webentwickler für ein Restaurant. Analysiere diese Speisekarte.

${context}

Extrahiere alle Gerichte mit Namen, Beschreibung und Preis und erstelle sauberes HTML für den entsprechenden Bereich der Webseite.

Antworte NUR mit dem HTML-Code, ohne Erklärungen. Der Code soll direkt in die Webseite eingefügt werden können.
Verwende einfache, semantische HTML-Elemente mit Klassen wie .menu-item, .menu-title, .menu-description, .menu-price.`,
          },
        ],
      },
    ],
  });

  const htmlContent = message.content[0].text;
  const stagingUrl = await pushToStaging({ html: htmlContent, type, month });

  return { stagingUrl };
}

module.exports = { handlePhoto };
