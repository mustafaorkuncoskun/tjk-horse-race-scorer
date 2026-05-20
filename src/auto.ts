import 'dotenv/config';
import { fetchSehirler, fetchKosular, fetchAtPistSkoru } from './scraper';
import { skorHesapla, sirala } from './scorer';
import { telegramGonder, kosFormatla } from './telegram';

async function main() {
  console.log('TJK auto başladı:', new Date().toLocaleString('tr-TR'));

  const sehirler = await fetchSehirler();
  if (sehirler.length === 0) {
    await telegramGonder('📭 Bugün TJK yarış programı bulunamadı.');
    return;
  }

  let toplamKos = 0;

  for (const sehir of sehirler) {
    let kosular;
    try {
      kosular = await fetchKosular(sehir);
    } catch {
      console.error(`${sehir.isim} koşuları çekilemedi, atlanıyor`);
      continue;
    }

    for (const kos of kosular) {
      try {
        const pistSkorlari = await Promise.all(
          kos.atlar.map((at) => fetchAtPistSkoru(at.atId, kos.pist || 'Kum'))
        );

        const skorlar = sirala(
          kos.atlar.map((at, i) => skorHesapla(at, null, kos.atlar.length, pistSkorlari[i]))
        );

        const mesaj = kosFormatla(
          sehir.isim,
          kos.no,
          kos.saat,
          kos.mesafe,
          kos.pist,
          kos.pistDurumu?.durum || '',
          skorlar.map((s) => ({
            isim: s.at.isim,
            finalSkor: s.finalSkor,
            guven: s.guven,
            ganyan: s.at.ganyan,
            son6: s.at.son6Yaris,
          }))
        );

        await telegramGonder(mesaj);
        toplamKos++;

        await new Promise((r) => setTimeout(r, 500));
      } catch (e: any) {
        console.error(`${sehir.isim} K${kos.no} gönderilemedi:`, e.message);
      }
    }
  }

  if (toplamKos === 0) {
    await telegramGonder('📭 Bugün yarış yok.');
  } else {
    console.log(`Tamamlandı: ${toplamKos} koşu Telegram'a gönderildi.`);
  }
}

main().catch((e) => console.error('auto.ts hata:', e.message));
