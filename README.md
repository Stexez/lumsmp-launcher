# LumSMP Launcher

LumSMP'nin resmi Windows launcher'ı.

- **Giriş:** lumcraft.com.tr hesabıyla giriş zorunlu. Hesabı olmayan oyuncu launcher'ı kullanamaz. Ayrıca Minecraft'ın olduğu Microsoft hesabıyla bir kez giriş yapılır.
- **Ad kontrolü:** Site hesabındaki ad ile Minecraft adı aynı olmalıdır.
- **Kurulum:** Minecraft, Fabric, doğru Java sürümü ve sunucunun zorunlu modları otomatik kurulur. Her dosyanın hash'i doğrulanır.
- **Modlar:** Mod listesi admin panelinden yönetilir. Listede olmayan modlar oyuncunun mod klasöründen silinir.
- **Bağlanma:** Oyun açılınca doğrudan sunucuya bağlanır.
- **Güncelleme:** GitHub'da yeni sürüm yayınlanınca launcher açılışta bunu görür, indirir ve kendini günceller.
- **Sunucu koruması:** Sunucu offline modda olduğu için launcher, oyun açılırken siteye bir giriş bileti bırakır. Eklenti `launcher.required: true` ise bileti olmayan, yani launcher'sız giren biri sunucuya alınmaz. Böylece kimse başkasının adıyla giremez.

---

## 1. Microsoft uygulaması (bir kere)

Launcher'ın Microsoft ile giriş yapabilmesi için bir Azure uygulama kimliği gerekir.

1. https://portal.azure.com adresinde **Microsoft Entra ID → Uygulama kayıtları → Yeni kayıt** yolunu aç.
   - Ad: `LumSMP Launcher`
   - Desteklenen hesap türleri: **Yalnızca kişisel Microsoft hesapları**
   - Yeniden yönlendirme URI'si: platform **Ortak istemci/yerel (mobil ve masaüstü)**, adres `https://login.microsoftonline.com/common/oauth2/nativeclient`
2. **Kimlik doğrulama** sayfasında **Ortak istemci akışlarına izin ver** seçeneğini **Evet** yap.
3. **Uygulama (istemci) kimliğini** kopyala ve `launcher.config.json` içindeki `microsoftClientId` alanına yaz.
4. **Mojang onayı:** Yeni Azure uygulamalarının Minecraft girişini kullanabilmesi için Microsoft/Mojang onayı gerekir. Uygulama kimliğinle Minecraft uygulama inceleme formunu doldur: https://aka.ms/mce-reviewappid
   - Onay gelene kadar launcher "uygulama henüz Mojang tarafından onaylanmadı" der.
   - Onay birkaç gün sürebilir.

## 2. GitHub deposu (bir kere)

1. GitHub'da **herkese açık** `Stexez/lumsmp-launcher` deposunu oluştur.
2. Bu klasörü o depoya gönder:
   ```
   git init
   git add .
   git commit -m "LumSMP Launcher 1.0.0"
   git branch -M main
   git remote add origin https://github.com/Stexez/lumsmp-launcher.git
   git push -u origin main
   ```

## 3. Sürüm yayınlamak (her güncellemede)

1. `package.json` içindeki `"version"` değerini artır (ör. `1.0.1`).
2. Commit'le, sonra aynı numarayla tag atıp gönder:
   ```
   git commit -am "1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```
3. GitHub Actions kurulum dosyasını derleyip Release olarak yayınlar. Bu yaklaşık 5 dakika sürer.
4. Oyuncuların launcher'ı bir sonraki açılışta güncellemeyi indirir ve kendini yeniden başlatır.

İndirme linki her zaman aynı kalır:
`https://github.com/Stexez/lumsmp-launcher/releases/latest/download/LumSMP-Launcher-Setup.exe`
Sitedeki `/launcher` sayfası bu linki kullanır.

## 4. Modlar ve ayarlar

Mod ve ayar yönetimi admin panelinin **Launcher** bölümündedir. Launcher güncellemesi gerekmez:

- **Mod yükleme:** Fabric `.jar` dosyalarını (ör. LumPhone) buradan yükle.
- **Sürüm ayarları:** Minecraft ve Fabric loader sürümünü buradan seç. Fabric loader boş bırakılırsa en güncel kararlı sürüm kullanılır.
- **Sunucu adresi:** Oyunun bağlanacağı adres buradan ayarlanır.
- **Duyuru:** Launcher ana ekranında görünecek duyuruyu buradan yazarsın.

## 5. Launcher'ı zorunlu yapmak

Oyuncular launcher'ı kurduktan sonra Lumin eklentisinin `config.yml` dosyasında şu ayarı yap, sonra sunucuyu yeniden başlat:

```yaml
launcher:
  required: true
  fail-open: false     # site cevap vermezse girişi reddet
  bypass: []           # launcher'sız girebilecek isimler (ör. sunucu bilgisayarındaki yönetici)
```

## Geliştirme

```
npm install
npm start          # geliştirme modunda açar (güncelleme kontrolü yapılmaz)
npm run check      # sözdizimi kontrolü
npm test           # birim testleri
npm run dist       # yerelde kurulum dosyası üretir (dist/)
```

Oyun dosyaları `%APPDATA%\.lumsmp` klasörüne kurulur.

Oturum bilgileri `%APPDATA%\LumSMP Launcher\secure.bin` dosyasında Windows'un kendi şifrelemesiyle saklanır.

## Güvenlik notları

- Arayüz izole (sandbox) çalışır ve Node erişimi yoktur. Ana süreçle yalnızca izinli kanallardan konuşur.
- Launcher yalnızca izinli adreslere HTTPS ile bağlanır. Her indirilen dosyanın SHA-1 veya SHA-256 hash'i doğrulanır.
- Dosya yolları klasör dışına çıkamaz (path traversal koruması).
- Minecraft erişim anahtarı diske yazılmaz. Oyun kayıtlarında da `***` olarak maskelenir.
- **Kod imzalama yok:** Kurulum dosyası imzasız olduğu için Windows ilk çalıştırmada "bilinmeyen yayımcı" uyarısı verebilir. Bir kod imzalama sertifikası alınırsa electron-builder ile imzalanabilir.
