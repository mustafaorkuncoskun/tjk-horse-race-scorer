import { At, AtSkor } from './types';

function parseDereceler(son6: string): number[] {
  return son6
    .split('-')
    .map((s) => parseInt(s))
    .filter((n) => !isNaN(n) && n > 0 && n <= 30);
}

function formSkoru(son6: string): number {
  const dereceler = parseDereceler(son6);
  if (dereceler.length === 0) return 30;

  const agirliklar = [2, 1.8, 1.5, 1.2, 1, 0.8];
  let toplam = 0;
  let agirlikToplam = 0;

  dereceler.slice(0, 6).forEach((derece, i) => {
    const ag = agirliklar[i] || 0.5;
    const puan = Math.max(20, 115 - derece * 15);
    toplam += puan * ag;
    agirlikToplam += ag;
  });

  return Math.round(toplam / agirlikToplam);
}

function oddsSkoru(ganyan: number | null, agf: number | null): number {
  let skor = 50;
  if (ganyan !== null && ganyan > 0) {
    skor = Math.max(10, Math.min(95, 100 - Math.log(ganyan) * 20));
  }
  if (agf !== null && agf > 0) {
    const agfSkor = Math.min(95, agf * 3);
    skor = ganyan !== null ? (skor * 0.5 + agfSkor * 0.5) : agfSkor;
  }
  return Math.round(skor);
}

function hcSkoru(hc: number): number {
  if (hc <= 0) return 30;
  return Math.min(100, Math.max(10, Math.round(hc * 1.2)));
}

export function skorHesapla(
  at: At,
  liderformSirasi: number | null,
  toplamAt: number,
  pistSkoru: number = 50
): AtSkor {
  const fs = formSkoru(at.son6Yaris);
  const os = oddsSkoru(at.ganyan, at.agfYuzde);
  const hs = hcSkoru(at.hc);

  // Ağırlıklar: form %35, odds %30, hc %20, pist %15
  const istatistikSkoru = Math.round(fs * 0.35 + os * 0.30 + hs * 0.20 + pistSkoru * 0.15);

  let liderformSkoru = 50;
  if (liderformSirasi !== null && toplamAt > 0) {
    liderformSkoru = Math.round(100 - ((liderformSirasi - 1) / (toplamAt - 1)) * 80);
  }

  const finalSkor =
    liderformSirasi !== null
      ? Math.round(istatistikSkoru * 0.5 + liderformSkoru * 0.5)
      : istatistikSkoru;

  let guven: AtSkor['guven'] = 'ORTA';
  if (liderformSirasi !== null) {
    const istatIyi = istatistikSkoru >= 65;
    const liderformIyi = liderformSirasi <= Math.ceil(toplamAt / 3);
    if (istatIyi && liderformIyi) guven = 'YÜKSEK';
    else if (!istatIyi && !liderformIyi) guven = 'DÜŞÜK';
    else guven = 'ÇAKIŞMA';
  } else {
    if (istatistikSkoru >= 70) guven = 'YÜKSEK';
    else if (istatistikSkoru >= 50) guven = 'ORTA';
    else guven = 'DÜŞÜK';
  }

  return { at, formSkoru: fs, oddsSkoru: os, hcSkoru: hs, pistSkoru, istatistikSkoru, liderformSirasi, finalSkor, guven };
}

export function sirala(skorlar: AtSkor[]): AtSkor[] {
  return [...skorlar].sort((a, b) => b.finalSkor - a.finalSkor);
}
