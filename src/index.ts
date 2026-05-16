import * as readline from 'readline';
import chalk from 'chalk';
import { fetchSehirler, fetchKosular, fetchAtPistSkoru } from './scraper';
import { fetchLiderformSiralamasi } from './liderform';
import { skorHesapla, sirala } from './scorer';
import { kosBaslik, skorTablosu } from './display';

function sor(soru: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(soru, (cevap) => {
      rl.close();
      resolve(cevap.trim());
    });
  });
}

async function secimYap<T>(baslik: string, secenekler: T[], isimFn: (s: T) => string): Promise<T> {
  console.log(chalk.bold(`\n${baslik}`));
  secenekler.forEach((s, i) => {
    console.log(`  ${chalk.cyan(String(i + 1).padStart(2))}. ${isimFn(s)}`);
  });
  while (true) {
    const girdi = await sor(chalk.dim(`Seçim (1-${secenekler.length}): `));
    const no = parseInt(girdi);
    if (no >= 1 && no <= secenekler.length) return secenekler[no - 1];
    console.log(chalk.red(`  Lütfen 1-${secenekler.length} arası bir sayı girin.`));
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🏇  TJK At Yarışı Skor Analizi\n'));

  // 1. Şehirleri çek
  process.stdout.write(chalk.dim('Günlük program yükleniyor...'));
  let sehirler;
  try {
    sehirler = await fetchSehirler();
    process.stdout.write(chalk.green(' ✓\n'));
  } catch {
    console.error(chalk.red('\nTJK sitesine bağlanılamadı.'));
    process.exit(1);
  }

  if (sehirler.length === 0) {
    console.log(chalk.yellow('Bugün için yarış bulunamadı.'));
    process.exit(0);
  }

  // 2. Şehir seç
  const secilenSehir = await secimYap('Şehir seçin:', sehirler, (s) => s.isim);

  // 3. Koşuları çek
  process.stdout.write(chalk.dim(`\n${secilenSehir.isim} koşuları yükleniyor...`));
  let kosular;
  try {
    kosular = await fetchKosular(secilenSehir);
    process.stdout.write(chalk.green(` ✓ (${kosular.length} koşu)\n`));
  } catch {
    console.error(chalk.red('\nKoşu bilgileri alınamadı.'));
    process.exit(1);
  }

  if (kosular.length === 0) {
    console.log(chalk.yellow('Koşu bulunamadı.'));
    process.exit(0);
  }

  // 4. Koşu seç
  const secilenKos = await secimYap(
    'Koşu seçin:',
    kosular,
    (k) => `${k.no}. Koşu  ${k.saat}  ${k.mesafe}m ${k.pist}  (${k.atlar.length} at)`
  );

  // 5. Pist skorlarını paralel çek
  process.stdout.write(chalk.dim(`\nAtların ${secilenKos.pist} pist geçmişi çekiliyor...`));
  const pistSkorlari = await Promise.all(
    secilenKos.atlar.map((at) => fetchAtPistSkoru(at.atId, secilenKos.pist))
  );
  process.stdout.write(chalk.green(' ✓\n'));

  // 6. LiderForm (opsiyonel)
  process.stdout.write(chalk.dim('LiderForm tahminleri aranıyor...'));
  const liderformMap = await fetchLiderformSiralamasi(
    secilenSehir.isim,
    secilenKos.no,
    secilenKos.atlar.map((a) => a.isim)
  );
  process.stdout.write(
    liderformMap.size > 0 ? chalk.green(' ✓\n') : chalk.yellow(' (bulunamadı)\n')
  );

  // 7. Skor hesapla + göster
  const toplamAt = secilenKos.atlar.length;
  const skorlar = secilenKos.atlar.map((at, i) =>
    skorHesapla(at, liderformMap.get(at.isim) ?? null, toplamAt, pistSkorlari[i])
  );
  kosBaslik(secilenKos);
  skorTablosu(sirala(skorlar));

  // 7. Başka koşu?
  const devam = await sor(chalk.dim('Başka bir koşu analiz et? (e/h): '));
  if (devam.toLowerCase() === 'e') {
    const digerKosular = kosular.filter((k) => k.id !== secilenKos.id);
    if (digerKosular.length === 0) {
      console.log('Başka koşu yok.');
    } else {
      const secilenKos2 = await secimYap('Koşu seçin:', digerKosular,
        (k) => `${k.no}. Koşu  ${k.saat}  ${k.mesafe}m ${k.pist}  (${k.atlar.length} at)`
      );
      const pistSkorlari2 = await Promise.all(
        secilenKos2.atlar.map((at) => fetchAtPistSkoru(at.atId, secilenKos2.pist))
      );
      const skorlar2 = secilenKos2.atlar.map((at, i) =>
        skorHesapla(at, null, secilenKos2.atlar.length, pistSkorlari2[i])
      );
      kosBaslik(secilenKos2);
      skorTablosu(sirala(skorlar2));
    }
  }

  console.log(chalk.dim('\nİyi yarışlar! 🍀\n'));
}

main().catch((err) => {
  console.error(chalk.red('Hata:'), err.message);
  process.exit(1);
});
