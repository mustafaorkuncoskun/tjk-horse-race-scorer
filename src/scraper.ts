import axios from 'axios';
import https from 'https';
import { load, CheerioAPI } from 'cheerio';
import { At, Kos, PistDurumu, Sehir } from './types';

// TJK sertifikası sistem CA'sı ile doğrulanamıyor (bilinen macOS sorunu)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BASE = 'https://www.tjk.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  Referer: `${BASE}/TR/YarisSever/Info/Page/GunlukYarisProgrami`,
};

function bugunTarih(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${now.getFullYear()}`;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// "Çim: Biraz Yumuşak 3,4  Kum: Normal  Hava: 16 C , AÇIK , NEM %42"
function parsePistDurumu(conditionsText: string, pistTipi: string): PistDurumu | null {
  if (!conditionsText) return null;
  const norm = normalizeText(conditionsText);

  // Bugünkü yarışın pist tipine göre durumu bul (Çim / Kum / Sentetik)
  const durumlar: Record<string, string[]> = {
    'Ağır': ['ağır', 'heavy'],
    'Yumuşak': ['yumuşak', 'soft', 'biraz yumuşak'],
    'Normal': ['normal', 'good', 'iyi'],
    'Sert': ['sert', 'firm', 'hard'],
  };

  // pistTipi (Çim/Kum) için durum bilgisini bul
  const pistRegex = new RegExp(`${pistTipi}[:\\s]+([^,\\d]+)`, 'i');
  const pistMatch = norm.match(pistRegex);
  let durum = 'Normal';
  if (pistMatch) {
    const durumText = pistMatch[1].toLowerCase().trim();
    for (const [label, keywords] of Object.entries(durumlar)) {
      if (keywords.some((k) => durumText.includes(k))) {
        durum = label;
        break;
      }
    }
  }

  // Hava bilgisi — "PDF Program" öncesine kadar al
  const havaMatch = norm.match(/Hava[:\s]+(.+?)(?=PDF|$)/i);
  const hava = havaMatch ? havaMatch[1].trim().replace(/\s*\|\s*.*/g, '').trim() : '';

  return { tip: pistTipi, durum, hava };
}

export async function fetchSehirler(): Promise<Sehir[]> {
  const { data } = await axios.get(
    `${BASE}/TR/YarisSever/Info/Page/GunlukYarisProgrami`,
    { headers: HEADERS, timeout: 15000, httpsAgent }
  );
  const $ = load(data);
  const sehirler: Sehir[] = [];

  $('.gunluk-tabs > li > a').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') || '';
    const sehirId = a.attr('data-sehir-id') || '';
    const sehirAdi = a.attr('id') || a.text().split('(')[0].trim();
    if (!sehirId) return;
    const url = href.startsWith('http') ? href : `${BASE}${href}`;
    sehirler.push({ id: sehirId, isim: sehirAdi, url });
  });

  const yabanci = /ABD|Avustralya|G\.Afrika|Guney Afrika|Fransa|İngiltere|Almanya|İtalya|Karma|Park\s|Racecourse|Raceway/i;
  return sehirler.filter((s) => !yabanci.test(s.isim));
}

export async function fetchKosular(sehir: Sehir): Promise<Kos[]> {
  const tarih = bugunTarih();
  const url =
    `${BASE}/TR/YarisSever/Info/Sehir/GunlukYarisProgrami` +
    `?SehirId=${sehir.id}&QueryParameter_Tarih=${encodeURIComponent(tarih)}&SehirAdi=${encodeURIComponent(sehir.isim)}&Era=today`;

  const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000, httpsAgent });
  const $ = load(data);
  const kosular: Kos[] = [];

  // Genel pist/hava durumu (sayfanın başında, tüm koşular için ortak)
  const conditionsText = normalizeText($('.conditions-race').first().text());

  $('.races-panes > div').each((_, pane) => {
    const div = $(pane);
    const kosId = div.attr('id') || '';
    if (!kosId) return;

    const configEl = div.find('.race-details h3.race-config');
    const configNorm = normalizeText(configEl.text());
    const mesafeMatch = configNorm.match(/(\d{3,4})\s*(Çim|Kum|Sentetik|Pist)/i);
    const mesafe = mesafeMatch ? parseInt(mesafeMatch[1]) : 0;
    const pist = mesafeMatch ? mesafeMatch[2] : '';

    const tabLink = $(`a[href="#${kosId}"]`);
    const tabText = normalizeText(tabLink.text());
    const noMatch = tabText.match(/(\d+)\.\s*Koşu/);
    const saatMatch = tabText.match(/(\d{2}[.:]\d{2})/);

    const atlar = parseAtlar($, div);
    if (atlar.length === 0) return;

    kosular.push({
      id: kosId,
      no: noMatch ? parseInt(noMatch[1]) : kosular.length + 1,
      saat: saatMatch ? saatMatch[1] : '',
      mesafe,
      pist,
      kosAdi: configNorm,
      pistDurumu: pist ? parsePistDurumu(conditionsText, pist) : null,
      atlar,
    });
  });

  return kosular;
}

// Her atın pist tipi ve mesafe geçmişini tek çağrıda çeker
export async function fetchAtPistVeMesafeSkoru(
  atId: string,
  pistTipi: string,
  mesafe: number
): Promise<{ pistSkoru: number; mesafeSkoru: number }> {
  if (!atId) return { pistSkoru: 50, mesafeSkoru: 50 };
  try {
    const url =
      `${BASE}/TR/YarisSever/Query/ConnectedPage/AtKosuBilgileri` +
      `?1=1&QueryParameter_AtId=${atId}&Era=today`;
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000, httpsAgent });
    const $ = load(data);

    // Pist skoru: özet satırlarından (Çim / Kum / Sentetik)
    let pistSkoru = 50;
    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      const etiket = tds.eq(0).text().trim();
      if (etiket.toLowerCase() !== pistTipi.toLowerCase()) return;
      const toplam = parseInt(tds.eq(1).text()) || 0;
      if (toplam === 0) return;
      const top3 = (parseInt(tds.eq(2).text()) || 0) + (parseInt(tds.eq(3).text()) || 0) + (parseInt(tds.eq(4).text()) || 0);
      pistSkoru = Math.round(20 + (top3 / toplam) * 80);
    });

    // Mesafe skoru: bireysel koşu satırlarından mesafe kolonunu filtrele
    let mesafeToplam = 0;
    let mesafeTop3 = 0;
    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      const satirMesafe = parseInt(tds.eq(3).text()); // mesafe kolonu
      if (isNaN(satirMesafe)) return;
      // ±100m toleransla eşleştir
      if (Math.abs(satirMesafe - mesafe) > 100) return;
      const derece = parseInt(tds.eq(tds.length - 1).text());
      if (isNaN(derece)) return;
      mesafeToplam++;
      if (derece <= 3) mesafeTop3++;
    });
    const mesafeSkoru = mesafeToplam > 0
      ? Math.round(20 + (mesafeTop3 / mesafeToplam) * 80)
      : 50;

    return { pistSkoru, mesafeSkoru };
  } catch {
    return { pistSkoru: 50, mesafeSkoru: 50 };
  }

}

// Geriye dönük uyumluluk için eski fonksiyon adı
export async function fetchAtPistSkoru(atId: string, pistTipi: string): Promise<number> {
  const { pistSkoru } = await fetchAtPistVeMesafeSkoru(atId, pistTipi, 0);
  return pistSkoru;
}

function parseAtlar($: CheerioAPI, pane: ReturnType<typeof $>): At[] {
  const atlar: At[] = [];

  pane.find('table.tablesorter tbody tr').each((_, row) => {
    const tr = $(row);

    const atLink = tr.find('td.gunluk-GunlukYarisProgrami-AtAdi a').first();
    const isim = atLink.contents().first().text().trim();
    if (!isim || !/[A-ZÇĞİÖŞÜ]/.test(isim)) return;

    const atHref = atLink.attr('href') || '';
    const atIdMatch = atHref.match(/QueryParameter_AtId=(\d+)/);

    const noText = tr.find('td.gunluk-GunlukYarisProgrami-SiraId').text().trim();
    const jokey = normalizeText(
      tr.find('td.gunluk-GunlukYarisProgrami-JokeAdi a').text() ||
      tr.find('td.gunluk-GunlukYarisProgrami-JokeAdi').text()
    );
    const hcText = tr.find('td.gunluk-GunlukYarisProgrami-Hc').text().trim();
    const son6Html = tr.find('td.gunluk-GunlukYarisProgrami-Son6Yaris').html() || '';
    const ganyanText = tr.find('td.gunluk-GunlukYarisProgrami-Gny span').text().trim();
    const agfText = tr.find('td.gunluk-GunlukYarisProgrami-AGFORAN a').text().trim();

    const ganyan = parseFloat(ganyanText.replace(',', '.')) || null;
    const agfMatch = agfText.match(/([\d.]+)/);
    const agfYuzde = agfMatch ? parseFloat(agfMatch[1]) : null;

    atlar.push({
      no: parseInt(noText) || atlar.length + 1,
      isim,
      atId: atIdMatch ? atIdMatch[1] : '',
      jokey,
      hc: parseInt(hcText) || 0,
      son6Yaris: parseSon6(son6Html),
      ganyan,
      agfYuzde,
    });
  });

  return atlar;
}

function parseSon6(html: string): string {
  const $ = load(html);
  const pozisyonlar: string[] = [];
  $('b').each((_, el) => {
    const val = $(el).text().trim();
    if (/^\d+$/.test(val)) pozisyonlar.push(val);
  });
  return pozisyonlar.join('-');
}
