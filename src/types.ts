export interface Sehir {
  id: string;
  isim: string;
  url: string;
}

export interface PistDurumu {
  tip: string;    // Çim / Kum / Sentetik
  durum: string;  // Yumuşak / Normal / Sert / Ağır
  hava: string;   // "16°C AÇIK NEM %42" gibi
}

export interface Kos {
  id: string;
  no: number;
  saat: string;
  mesafe: number;
  pist: string;
  kosAdi: string;
  pistDurumu: PistDurumu | null;
  atlar: At[];
}

export interface At {
  no: number;
  isim: string;
  atId: string;
  jokey: string;
  hc: number;
  son6Yaris: string;
  ganyan: number | null;
  agfYuzde: number | null;
}

export interface AtSkor {
  at: At;
  formSkoru: number;
  oddsSkoru: number;
  hcSkoru: number;
  pistSkoru: number;
  istatistikSkoru: number;
  liderformSirasi: number | null;
  finalSkor: number;
  guven: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK' | 'ÇAKIŞMA';
}
