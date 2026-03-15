# World Conquest — v0.2.0

Gerçek zamanlı multiplayer dünya strateji oyunu.

## Proje Yapısı

```
world-conquest/
  index.html     — oyun arayüzü
  style.css      — stiller
  game.js        — frontend oyun mantığı
  countries.js   — 83 ülke GeoJSON verisi (inline, internetsiz çalışır)
  server.js      — Socket.io multiplayer backend
  package.json   — Node.js bağımlılıkları
```

## Solo Oynama (internetsiz)

`index.html` dosyasını tarayıcıda aç → "Bot ile Oyna" veya "Hızlı Demo".

## Multiplayer — Railway Deploy

### 1. GitHub'a yükle
```bash
git init
git add .
git commit -m "World Conquest v0.2.0"
git remote add origin https://github.com/KULLANICI/world-conquest.git
git push -u origin main
```

### 2. Railway'de deploy et
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub Repo
2. Repo'yu seç
3. Railway otomatik `npm start` çalıştırır
4. Settings → Networking → Generate Domain → URL'yi kopyala

### 3. Oyunu başlatma
1. `index.html` aç → "Online Multiplayer"
2. Railway URL'sini gir (örn: `https://world-conquest-production.up.railway.app`)
3. "Oda Kur" → Oda kodu arkadaşlarla paylaş
4. Arkadaşlar aynı URL + oda kodu ile katılır
5. Oda sahibi "Başlat" der

## Aşamalar

- ✅ Aşama 1: Harita + Lobby + Bot oyunu
- ✅ Aşama 2: Komşu kontrolü + Socket.io multiplayer
- 🔜 Aşama 3: Diplomasi + İttifak sistemi
- 🔜 Aşama 4: UI polish + ses efektleri
