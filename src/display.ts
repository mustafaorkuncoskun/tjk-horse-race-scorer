import Table from 'cli-table3';
import chalk from 'chalk';
import { AtSkor, Kos } from './types';

const GUVEN_RENK = {
  YÜKSEK: chalk.green,
  ORTA: chalk.yellow,
  DÜŞÜK: chalk.red,
  ÇAKIŞMA: chalk.magenta,
};

const GUVEN_SEMBOL = {
  YÜKSEK: '★',
  ORTA: '◆',
  DÜŞÜK: '▼',
  ÇAKIŞMA: '⚠',
};

type ChalkFn = (text: string) => string;
const DURUM_RENK: Record<string, ChalkFn> = {
  'Ağır': chalk.blue,
  'Yumuşak': chalk.cyan,
  'Normal': chalk.green,
  'Sert': chalk.yellow,
};

export function kosBaslik(kos: Kos): void {
  console.log('');
  console.log(
    chalk.bold.cyan(
      `🏇  ${kos.no}. Koşu  ${kos.saat}  —  ${kos.mesafe}m ${kos.pist}`
    )
  );
  if (kos.pistDurumu) {
    const renkFn = DURUM_RENK[kos.pistDurumu.durum] || chalk.white;
    const durumStr = renkFn(`${kos.pist}: ${kos.pistDurumu.durum}`);
    const havaStr = kos.pistDurumu.hava ? chalk.dim(` | Hava: ${kos.pistDurumu.hava}`) : '';
    console.log(`  Pist durumu: ${durumStr}${havaStr}`);
  }
  console.log(chalk.dim(kos.kosAdi));
  console.log('');
}

export function skorTablosu(skorlar: AtSkor[]): void {
  const tablo = new Table({
    head: [
      chalk.bold('Sıra'),
      chalk.bold('No'),
      chalk.bold('At İsmi'),
      chalk.bold('Jokey'),
      chalk.bold('Son6'),
      chalk.bold('HC'),
      chalk.bold('Gny'),
      chalk.bold('Form'),
      chalk.bold('Odds'),
      chalk.bold('Pist'),
      chalk.bold('Skor'),
      chalk.bold('Güven'),
    ],
    colWidths: [5, 4, 20, 16, 14, 5, 6, 6, 6, 6, 6, 10],
    style: { compact: true },
  });

  skorlar.forEach((s, i) => {
    const renkFn = GUVEN_RENK[s.guven] || chalk.white;
    const sembol = GUVEN_SEMBOL[s.guven];
    const pistStr = String(s.pistSkoru);
    const ganyanStr = s.at.ganyan !== null ? s.at.ganyan.toFixed(2) : '-';
    const isim = i === 0 ? chalk.bold(s.at.isim) : s.at.isim;

    tablo.push([
      renkFn(String(i + 1)),
      String(s.at.no),
      isim,
      s.at.jokey.slice(0, 14),
      s.at.son6Yaris.slice(0, 13),
      String(s.at.hc),
      ganyanStr,
      String(s.formSkoru),
      String(s.oddsSkoru),
      pistStr,
      renkFn(chalk.bold(String(s.finalSkor))),
      renkFn(`${sembol} ${s.guven}`),
    ]);
  });

  console.log(tablo.toString());

  // Özet
  const birinci = skorlar[0];
  const ikinci = skorlar[1];
  console.log('');
  if (birinci.guven === 'ÇAKIŞMA') {
    console.log(
      chalk.magenta(
        `⚠  ÇAKIŞMA: ${birinci.at.isim} istatistik lider ama LiderForm farklı tahmin. Dikkat!`
      )
    );
  } else {
    console.log(
      chalk.green.bold(
        `★  Tavsiye: ${birinci.at.isim} (${birinci.finalSkor} puan) — ${birinci.guven} güven`
      )
    );
  }
  if (ikinci) {
    console.log(
      chalk.yellow(
        `◆  2. seçenek: ${ikinci.at.isim} (${ikinci.finalSkor} puan)`
      )
    );
  }

  // Çakışma uyarıları
  const cakismalar = skorlar.filter((s, i) => i > 0 && s.guven === 'ÇAKIŞMA');
  cakismalar.forEach((s) => {
    console.log(
      chalk.magenta(
        `⚠  ${s.at.isim} — İstatistikler ve LiderForm çelişiyor`
      )
    );
  });
  console.log('');
}
