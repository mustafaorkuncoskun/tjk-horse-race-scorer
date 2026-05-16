import axios from 'axios';
import https from 'https';
import { load } from 'cheerio';
import chalk from 'chalk';
import { skorHesapla, sirala } from './scorer';
import { At } from './types';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const BASE = 'https://www.tjk.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9',
};

// At ismini normalize et: trim, parantez kaldır, tekli boşluk
function normIsim(s: string): string {
  return s.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Türk hipodromları ID listesi (backteste sadece bunları dahil et)
const TURK_SEHIRLER = [
  { id: '2', isim: 'İzmir' },
  { id: '5', isim: 'Ankara' },
  { id: '8', isim: 'Diyarbakır' },
  { id: '12', isim: 'Bursa' },
  { id: '15', isim: 'Adana' },
  { id: '17', isim: 'Karma' },
  { id: '20', isim: 'İstanbul' },
  { id: '21', isim: 'Şanlıurfa' },
];

interface KosBacktest {
  tarih: string;
  sehir: string;
  kosNo: number;
  mesafe: number;
  pist: string;
  tahminBirinci: string;   // algoritmamızın 1. seçimi
  gercekBirinci: string;   // gerçek kazanan
  gercekIkinci: string;
  gercekUcuncu: string;
  top1: boolean;
  top2: boolean;
  top3: boolean;
  atSayisi: number;
  tahminSkoru: number;
}

function formatTarih(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

async function fetchProgram(sehirId: string, sehirIsim: string, tarih: string): Promise<At[][]> {
  try {
    const url =
      `${BASE}/TR/YarisSever/Info/Sehir/GunlukYarisProgrami` +
      `?SehirId=${sehirId}&QueryParameter_Tarih=${encodeURIComponent(tarih)}&SehirAdi=${encodeURIComponent(sehirIsim)}&Era=today`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000, httpsAgent });
    const $ = load(data);
    const kosular: At[][] = [];

    $('.races-panes > div').each((_, pane) => {
      const div = $(pane);
      const atlar: At[] = [];

      div.find('table.tablesorter tbody tr').each((_, row) => {
        const tr = $(row);
        const atLink = tr.find('td.gunluk-GunlukYarisProgrami-AtAdi a').first();
        const isim = normIsim(atLink.contents().first().text());
        if (!isim || !/[A-ZÇĞİÖŞÜa-zçğışöü]/.test(isim)) return;

        const atHref = atLink.attr('href') || '';
        const atIdMatch = atHref.match(/QueryParameter_AtId=(\d+)/);
        const hcText = tr.find('td.gunluk-GunlukYarisProgrami-Hc').text().trim();
        const son6Html = tr.find('td.gunluk-GunlukYarisProgrami-Son6Yaris').html() || '';
        const ganyanText = tr.find('td.gunluk-GunlukYarisProgrami-Gny span').text().trim();
        const agfText = tr.find('td.gunluk-GunlukYarisProgrami-AGFORAN a').text().trim();

        const ganyan = parseFloat(ganyanText.replace(',', '.')) || null;
        const agfMatch = agfText.match(/([\d.]+)/);

        // Son6 parse
        const $s = load(son6Html);
        const pozlar: string[] = [];
        $s('b').each((_, el) => {
          const v = $s(el).text().trim();
          if (/^\d+$/.test(v)) pozlar.push(v);
        });

        atlar.push({
          no: atlar.length + 1,
          isim,
          atId: atIdMatch ? atIdMatch[1] : '',
          jokey: tr.find('td.gunluk-GunlukYarisProgrami-JokeAdi a').text().trim(),
          hc: parseInt(hcText) || 0,
          son6Yaris: pozlar.join('-'),
          ganyan,
          agfYuzde: agfMatch ? parseFloat(agfMatch[1]) : null,
        });
      });

      if (atlar.length > 0) kosular.push(atlar);
    });

    return kosular;
  } catch {
    return [];
  }
}

async function fetchSonuclar(sehirId: string, sehirIsim: string, tarih: string): Promise<string[][]> {
  try {
    const url =
      `${BASE}/TR/YarisSever/Info/Sehir/GunlukYarisSonuclari` +
      `?SehirId=${sehirId}&QueryParameter_Tarih=${encodeURIComponent(tarih)}&SehirAdi=${encodeURIComponent(sehirIsim)}&Era=today`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000, httpsAgent });
    const $ = load(data);
    const kosular: string[][] = [];

    $('.races-panes > div').each((_, pane) => {
      const div = $(pane);
      // Sıralı bitiş: SONUCNO sütununa göre sırala
      const atSonuclar: { sira: number; isim: string }[] = [];

      div.find('table.tablesorter tbody tr').each((_, row) => {
        const tr = $(row);
        const sira = parseInt(tr.find('td.gunluk-GunlukYarisSonuclari-SONUCNO').text().trim());
        const isimEl = tr.find('td.gunluk-GunlukYarisSonuclari-AtAdi3 a').first();
        // İlk text node'u al — tooltip içeriğini atla
        const isim = normIsim(isimEl.contents().first().text());
        if (isim && !isNaN(sira)) atSonuclar.push({ sira, isim });
      });

      if (atSonuclar.length > 0) {
        atSonuclar.sort((a, b) => a.sira - b.sira);
        kosular.push(atSonuclar.map((a) => a.isim));
      }
    });

    return kosular;
  } catch {
    return [];
  }
}

async function backtestTarih(tarih: string): Promise<KosBacktest[]> {
  const sonuclar: KosBacktest[] = [];

  for (const sehir of TURK_SEHIRLER) {
    const [programKosular, sonucKosular] = await Promise.all([
      fetchProgram(sehir.id, sehir.isim, tarih),
      fetchSonuclar(sehir.id, sehir.isim, tarih),
    ]);

    if (programKosular.length === 0 || sonucKosular.length === 0) continue;

    const minKos = Math.min(programKosular.length, sonucKosular.length);
    for (let i = 0; i < minKos; i++) {
      const atlar = programKosular[i];
      const gercek = sonucKosular[i];
      if (atlar.length < 3 || gercek.length < 1) continue;

      const skorlar = sirala(atlar.map((at) => skorHesapla(at, null, atlar.length)));
      const tahminBirinci = normIsim(skorlar[0].at.isim);
      const gercekBirinci = gercek[0] || '';
      const gercekIkinci = gercek[1] || '';
      const gercekUcuncu = gercek[2] || '';

      sonuclar.push({
        tarih,
        sehir: sehir.isim,
        kosNo: i + 1,
        mesafe: 0,
        pist: '',
        tahminBirinci,
        gercekBirinci,
        gercekIkinci,
        gercekUcuncu,
        top1: tahminBirinci === gercekBirinci,
        top2: tahminBirinci === gercekBirinci || tahminBirinci === gercekIkinci,
        top3: [gercekBirinci, gercekIkinci, gercekUcuncu].includes(tahminBirinci),
        atSayisi: atlar.length,
        tahminSkoru: skorlar[0].finalSkor,
      });
    }
  }

  return sonuclar;
}

async function main() {
  console.log(chalk.bold.cyan('\n🧪 TJK Algoritma Backtest\n'));
  console.log(chalk.dim('Son 14 günün sonuçları test ediliyor...\n'));

  const tumSonuclar: KosBacktest[] = [];
  const bugun = new Date();

  for (let gun = 1; gun <= 14; gun++) {
    const tarih = new Date(bugun);
    tarih.setDate(bugun.getDate() - gun);
    const tarihStr = formatTarih(tarih);

    process.stdout.write(chalk.dim(`${tarihStr} test ediliyor...`));
    const gunSonuclar = await backtestTarih(tarihStr);

    if (gunSonuclar.length > 0) {
      tumSonuclar.push(...gunSonuclar);
      process.stdout.write(chalk.green(` ${gunSonuclar.length} koşu\n`));
    } else {
      process.stdout.write(chalk.dim(' yarış yok\n'));
    }
  }

  if (tumSonuclar.length === 0) {
    console.log(chalk.yellow('\nTest için yeterli geçmiş veri bulunamadı.'));
    return;
  }

  // İstatistikler
  const toplamKos = tumSonuclar.length;
  const top1Sayisi = tumSonuclar.filter((s) => s.top1).length;
  const top2Sayisi = tumSonuclar.filter((s) => s.top2).length;
  const top3Sayisi = tumSonuclar.filter((s) => s.top3).length;

  console.log(chalk.bold('\n─────────────────────────────────────'));
  console.log(chalk.bold('📊 Sonuçlar\n'));
  console.log(`  Test edilen koşu:  ${chalk.cyan(toplamKos)}`);
  console.log('');
  console.log(`  Birinci doğru:     ${chalk.green(top1Sayisi + '/' + toplamKos)}  (${pct(top1Sayisi, toplamKos)}%)`);
  console.log(`  İkinci içinde:     ${chalk.yellow(top2Sayisi + '/' + toplamKos)}  (${pct(top2Sayisi, toplamKos)}%)`);
  console.log(`  Üçüncü içinde:     ${chalk.dim(top3Sayisi + '/' + toplamKos)}  (${pct(top3Sayisi, toplamKos)}%)`);
  console.log('');

  // Başarılı tahminlerin detayı
  console.log(chalk.bold('✅ Doğru tahminler:\n'));
  tumSonuclar
    .filter((s) => s.top1)
    .slice(0, 8)
    .forEach((s) => {
      console.log(`  ${s.tarih} ${s.sehir} K${s.kosNo}: ${chalk.green(s.tahminBirinci)} (${s.tahminSkoru} puan)`);
    });

  // Yanlış tahminlerin örneği
  console.log(chalk.bold('\n❌ Kaçırılan tahminler (örnek):\n'));
  tumSonuclar
    .filter((s) => !s.top1)
    .slice(0, 8)
    .forEach((s) => {
      console.log(
        `  ${s.tarih} ${s.sehir} K${s.kosNo}: ` +
        `tahmin=${chalk.red(s.tahminBirinci)} gerçek=${chalk.green(s.gercekBirinci)}`
      );
    });

  console.log(chalk.bold('\n─────────────────────────────────────'));
  console.log(chalk.dim(`\n* Karşılaştırma: random tahmin %${Math.round(100 / (tumSonuclar[0]?.atSayisi || 10))} ± doğruluk beklenir\n`));
}

function pct(sayi: number, toplam: number): string {
  return toplam === 0 ? '0' : Math.round((sayi / toplam) * 100).toString();
}

main().catch((e) => console.error(chalk.red('Hata:'), e.message));
