import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export async function telegramGonder(mesaj: string): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('TELEGRAM_TOKEN veya TELEGRAM_CHAT_ID eksik (.env dosyasını kontrol et)');
    return;
  }

  await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: chatId, text: mesaj, parse_mode: 'HTML' },
    { timeout: 10000 }
  );
}

export function kosFormatla(
  sehir: string,
  kosNo: number,
  saat: string,
  mesafe: number,
  pist: string,
  pistDurum: string,
  skorlar: Array<{
    isim: string;
    finalSkor: number;
    guven: string;
    ganyan: number | null;
    son6: string;
  }>
): string {
  const guvenEmoji: Record<string, string> = {
    'YÜKSEK': '🟢',
    'ORTA': '🟡',
    'DÜŞÜK': '🔴',
    'ÇAKIŞMA': '⚠️',
  };

  const baslik = `🏇 <b>${sehir} — ${kosNo}. Koşu ${saat}</b>\n${mesafe}m ${pist} ${pistDurum ? '| ' + pistDurum : ''}\n`;

  const satirlar = skorlar.slice(0, 5).map((s, i) => {
    const emoji = guvenEmoji[s.guven] || '⚪';
    const oran = s.ganyan ? ` (${s.ganyan})` : '';
    return `${i + 1}. ${emoji} <b>${s.isim}</b>${oran} — ${s.finalSkor}p`;
  });

  return baslik + satirlar.join('\n');
}
