import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9',
};

// At isimlerine göre LiderForm sıralamalarını döner
// Başarısız olursa null map döner (graceful fail)
export async function fetchLiderformSiralamasi(
  sehirIsim: string,
  kosNo: number,
  atIsimleri: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  try {
    const { data } = await axios.get('https://www.liderform.net', {
      headers: HEADERS,
      timeout: 10000,
      httpsAgent,
    });
    const $ = cheerio.load(data);

    // LiderForm'un yapısını anlamak için sayfaya bakıyoruz
    // Tahmin tabloları genellikle at ismi + sıra bilgisi içerir
    // Bu kısım LiderForm'un gerçek yapısına göre güncellenmeli
    // Şimdilik graceful fail ile devam
  } catch {
    // LiderForm erişilemez, sessizce geç
  }
  return result;
}
