# TJK At Yarışı Skor Analizi

TJK'dan canlı veri çekerek her at için istatistiksel skor hesaplayan ve yarış tahmini yapan CLI aracı.

## Özellikler

- TJK sitesinden günlük yarış programını otomatik çeker
- Her at için çok katmanlı skor hesaplar:
  - **Form (%35)** — Son 6 yarış derecesi (ağırlıklı, en yeni 2x)
  - **Piyasa (%30)** — Ganyan oranı + AGF yüzdesi
  - **Handicap (%20)** — TJK'nın HC puanı
  - **Pist geçmişi (%15)** — Atın bu pist tipinde (Çim/Kum/Sentetik) top-3 bitirme oranı
- Pist durumu ve hava bilgisini gösterir (Yumuşak/Normal/Sert)
- Güven seviyesi: YÜKSEK / ORTA / DÜŞÜK / ÇAKIŞMA
- Geçmiş yarışlar üzerinde backtest desteği

## Backtest Sonuçları

181 koşu üzerinde test edildi (son 14 gün):

| | Oran |
|---|---|
| Birinci doğru | %31 |
| İlk ikide | %54 |
| İlk üçte | %63 |

Karşılaştırma: rastgele tahmin ~%10-15 doğruluk verir.

## Kurulum

```bash
git clone https://github.com/mustafaorkuncoskun/tjk-horse-race-scorer.git
cd tjk-horse-race-scorer
npm install
```

## Kullanım

```bash
npm start
```

1. Şehir seçin (numara yazıp Enter)
2. Koşu seçin
3. Skor tablosu gelir

```bash
npm run backtest
```

Son 14 günün sonuçlarını test eder, doğruluk oranını gösterir.

## Örnek Çıktı

```
🏇  4. Koşu  18.00  —  1400m Kum
  Pist durumu: Kum: Normal | Hava: 27°C PARÇALI BULUTLU NEM %33

  Sıra  At İsmi       Son6          HC   Gny    Form  Odds  Pist  Skor  Güven
  ────────────────────────────────────────────────────────────────────────────
  1     BABY ARYA     0-2-1-2-0-1   61   5.65   92    51    56    71    ★ YÜKSEK
  2     ŞAİBESİZ      2-1-5-1-0-4   56   2.70   78    67    57    69    ◆ ORTA
  3     KAPTANPAŞALI  6-4-2-2-2-1   59   3.50   65    70    68    68    ◆ ORTA
```

## Linux Sunucuda Otomatik Telegram Bildirimi

### Kurulum

```bash
# Node.js 20 kur
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Projeyi kur
git clone https://github.com/mustafaorkuncoskun/tjk-horse-race-scorer.git
cd tjk-horse-race-scorer
npm install
```

### Telegram Bot Kurulumu

1. Telegram'da `@BotFather`'a `/newbot` yaz → token al
2. Bota bir mesaj gönder, sonra `https://api.telegram.org/bot<TOKEN>/getUpdates` adresinden `chat_id`'ni bul

### .env Dosyası

```bash
echo "TELEGRAM_TOKEN=your_token_here" > .env
echo "TELEGRAM_CHAT_ID=your_chat_id_here" >> .env
```

### Çalıştır

```bash
npm run auto
```

### Cron ile Otomatik Çalıştırma

```bash
crontab -e
```

Şu satırı ekle (her gün sabah 10:00'da çalışır):

```
0 10 * * * cd /home/kullanici/tjk-horse-race-scorer && npm run auto >> /var/log/tjk.log 2>&1
```

## Notlar

- TJK sitesinin SSL sertifikası macOS sistem CA'sı ile doğrulanamıyor, bu nedenle `rejectUnauthorized: false` kullanılıyor
- Araç yarıştan önce çalıştırılmalı; oranlar kapanışa kadar değişir
- Pist geçmişi her at için ayrı HTTP isteği gerektirir (~10-15 sn)
