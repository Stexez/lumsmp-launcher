'use strict';

// Oyuncunun launcher'da tikleyip açabileceği istemci modları (Modrinth slug'ları).
// Sunucu Paper olduğu için sadece istemci tarafında çalışan modlar listede; hile sayılabilecek
// modlar (freecam, x-ray, radar vb.) bilerek eklenmedi.
const CATEGORIES = Object.freeze([
  ['performance', 'Performans'],
  ['visual', 'Görsel'],
  ['animation', 'Animasyon'],
  ['info', 'Harita & Bilgi'],
  ['utility', 'Kolaylık'],
  ['sound', 'Ses'],
]);

const CATALOG = Object.freeze([
  // performans
  { slug: 'sodium', name: 'Sodium', category: 'performance', desc: 'FPS\'i katlayan yeni render motoru. Neredeyse herkes kullanır.', default: true },
  { slug: 'lithium', name: 'Lithium', category: 'performance', desc: 'Oyun mantığını hızlandırır, takılmaları azaltır.', default: true },
  { slug: 'ferrite-core', name: 'FerriteCore', category: 'performance', desc: 'RAM kullanımını ciddi ölçüde düşürür.', default: true },
  { slug: 'entityculling', name: 'Entity Culling', category: 'performance', desc: 'Görünmeyen varlıkları ve sandıkları çizmez.', default: true },
  { slug: 'immediatelyfast', name: 'ImmediatelyFast', category: 'performance', desc: 'Arayüz, yazı ve harita çizimini hızlandırır.', default: true },
  { slug: 'moreculling', name: 'More Culling', category: 'performance', desc: 'Yaprak ve blok yüzlerini akıllıca gizler.', conflicts: ['cull-leaves'] },
  { slug: 'dynamic-fps', name: 'Dynamic FPS', category: 'performance', desc: 'Oyun arka plandayken FPS\'i düşürüp bilgisayarı rahatlatır.', conflicts: ['fps-reducer'] },
  { slug: 'krypton', name: 'Krypton', category: 'performance', desc: 'Ağ kodunu hızlandırır; kalabalık yerlerde gecikmeyi azaltır.', default: true },
  { slug: 'debugify', name: 'Debugify', category: 'performance', desc: 'Mojang\'ın düzeltmediği yüzlerce küçük hatayı giderir.' },
  { slug: 'scalablelux', name: 'ScalableLux', category: 'performance', desc: 'Işık hesabını çok çekirdekli yapar; chunk yüklenirken takılma azalır.' },
  { slug: 'particle-core', name: 'Particle Core', category: 'performance', desc: 'Parçacıkları (patlama, büyü, duman) çok daha az kasarak çizer.' },
  { slug: 'cull-leaves', name: 'Cull Leaves', category: 'performance', desc: 'Ormanlarda yaprakların içini çizmeyip FPS kazandırır.', conflicts: ['moreculling'] },
  { slug: 'fps-reducer', name: 'FPS Reducer', category: 'performance', desc: 'Klavyeye dokunmayınca FPS\'i düşürür; dizüstünde pil ve fan için iyi.', conflicts: ['dynamic-fps'] },
  { slug: 'badoptimizations', name: 'BadOptimizations', category: 'performance', desc: 'Işık, gökyüzü ve sis hesaplamalarını önbelleğe alır.' },
  { slug: 'sodium-extra', name: 'Sodium Extra', category: 'performance', desc: 'Sodium\'a parçacık, animasyon ve FPS göstergesi ayarları ekler.' },
  { slug: 'reeses-sodium-options', name: 'Reese\'s Sodium Options', category: 'performance', desc: 'Sodium ayar ekranını sekmeli ve düzenli hale getirir.' },
  { slug: 'language-reload', name: 'Language Reload', category: 'performance', desc: 'Dil değiştirmeyi ve oyunun açılışını hızlandırır.' },
  { slug: 'fastquit', name: 'FastQuit', category: 'performance', desc: 'Dünyadan çıkarken kayıt ekranında bekletmez.' },

  // görsel
  { slug: 'iris', name: 'Iris Shaders', category: 'visual', desc: 'Shader paketleri (BSL, Complementary vb.) kullanmanı sağlar.' },
  { slug: 'continuity', name: 'Continuity', category: 'visual', desc: 'Cam ve kitaplık gibi bloklarda bağlantılı dokular.' },
  { slug: 'lambdynamiclights', name: 'LambDynamicLights', category: 'visual', desc: 'Elindeki meşale etrafını aydınlatır.' },
  { slug: 'entity-model-features', name: 'Entity Model Features', category: 'visual', desc: 'Kaynak paketlerindeki özel yaratık modellerini gösterir.' },
  { slug: 'entitytexturefeatures', name: 'Entity Texture Features', category: 'visual', desc: 'Rastgele ve parlayan yaratık dokularını destekler.' },
  { slug: '3dskinlayers', name: '3D Skin Layers', category: 'visual', desc: 'Skinlerin dış katmanını 3 boyutlu gösterir.' },
  { slug: 'lambdabettergrass', name: 'LambdaBetterGrass', category: 'visual', desc: "BetterGrassify'a alternatif: çimen ve kar kenarları daha doğal.", conflicts: ['bettergrassify'] },
  { slug: 'bettergrassify', name: 'BetterGrassify', category: 'visual', desc: 'Çimen bloklarının yanlarını da yeşil yapar.', conflicts: ['lambdabettergrass'] },
  { slug: 'voxy', name: 'Voxy', category: 'visual', desc: "Distant Horizons'a alternatif: uzak arazi için hafif LOD çizimi.", conflicts: ['distanthorizons'] },
  { slug: 'distanthorizons', name: 'Distant Horizons', category: 'visual', desc: 'Çok uzağı düşük detayla gösterip görüş mesafesini büyütür.', conflicts: ['voxy'] },
  { slug: 'bobby', name: 'Bobby', category: 'visual', desc: 'Gezdiğin yerleri hatırlar, sunucunun görüş sınırından uzağı da gösterir.' },
  { slug: 'visuality', name: 'Visuality', category: 'visual', desc: 'Kristal parıltısı, su damlası gibi küçük parçacıklar ekler.' },
  { slug: 'fallingleaves', name: 'Falling Leaves', category: 'visual', desc: 'Ağaçlardan yaprak dökülür.' },
  { slug: 'particle-rain', name: 'Particle Rain', category: 'visual', desc: 'Yağmur ve karı parçacıklarla daha gerçekçi yapar.' },
  { slug: 'wavey-capes', name: 'Wavey Capes', category: 'visual', desc: 'Pelerinler rüzgârda dalgalanır.' },
  { slug: 'capes', name: 'Capes', category: 'visual', desc: 'OptiFine ve diğer servislerin pelerinlerini gösterir.' },
  { slug: 'cubes-without-borders', name: 'Cubes Without Borders', category: 'visual', desc: 'Kenarlıksız tam ekran; alt-tab anında olur.' },
  { slug: 'better-clouds', name: 'Better Clouds', category: 'visual', desc: 'Vanilla tarzında daha hacimli, güzel bulutlar.' },
  { slug: 'dynamiccrosshair', name: 'Dynamic Crosshair', category: 'visual', desc: 'Nişangâhı duruma göre gizler veya değiştirir.' },
  { slug: 'legendary-tooltips', name: 'Legendary Tooltips', category: 'visual', desc: 'Nadir eşyalara süslü açıklama kutuları.' },
  { slug: 'polytone', name: 'Polytone', category: 'visual', desc: 'Kaynak paketlerinin blok rengi, biyom rengi ve ses özelleştirmelerini açar.' },
  { slug: 'dark-loading-screen', name: 'Dark Loading Screen', category: 'visual', desc: 'Açılış ekranını koyu renk yapar.' },

  // animasyon
  { slug: 'punchy-fpa', name: 'Punchy!', category: 'animation', desc: 'Birinci şahısta vuruş, yeme ve eşya animasyonları.', conflicts: ['first-person-model'] },
  { slug: 'punchymoves', name: 'Punchy! Moves', category: 'animation', desc: 'Üçüncü şahıs animasyonları ve dinamik kamera.' },
  { slug: 'not-enough-animations', name: 'Not Enough Animations', category: 'animation', desc: 'Harita tutma, yeme, merdiven gibi eksik animasyonlar.' },
  { slug: 'emotecraft', name: 'Emotecraft', category: 'animation', desc: "Dans ve selamlama gibi emote'lar; aynı modu kullananlar birbirini görür." },
  { slug: 'first-person-model', name: 'First-person Model', category: 'animation', desc: 'Aşağı bakınca kendi vücudunu görürsün.', conflicts: ['punchy-fpa'] },

  // harita & bilgi
  { slug: 'xaeros-minimap', name: 'Xaero\'s Minimap', category: 'info', desc: 'Köşede mini harita ve yol noktaları.', conflicts: ['journeymap'] },
  { slug: 'journeymap', name: 'JourneyMap', category: 'info', desc: "Xaero'ya alternatif: mini harita, tam ekran harita ve tarayıcıda harita.", conflicts: ['xaeros-minimap', 'xaeros-world-map'] },
  { slug: 'xaeros-world-map', name: 'Xaero\'s World Map', category: 'info', desc: 'M tuşuyla açılan tam ekran dünya haritası.', conflicts: ['journeymap'] },
  { slug: 'jade', name: 'Jade', category: 'info', desc: 'Baktığın bloğun/yaratığın adını ve bilgisini gösterir.', conflicts: ['wthit'] },
  { slug: 'wthit', name: 'WTHIT', category: 'info', desc: "Jade'e alternatif: baktığın bloğun ve yaratığın bilgisi.", conflicts: ['jade'] },
  { slug: 'appleskin', name: 'AppleSkin', category: 'info', desc: 'Yemeklerin ne kadar doyurduğunu ve doygunluğu gösterir.' },
  { slug: 'jei', name: 'Just Enough Items', category: 'info', desc: 'Tüm eşyaları ve tariflerini envanterde gösterir.', conflicts: ['rei'] },
  { slug: 'rei', name: 'Roughly Enough Items', category: 'info', desc: "JEI'ye alternatif: eşya ve tarif listesi, daha çok ayar.", conflicts: ['jei'] },
  { slug: 'betterf3', name: 'BetterF3', category: 'info', desc: 'F3 ekranını renkli ve okunur yapar.' },
  { slug: 'durability-tooltip', name: 'Durability Tooltip', category: 'info', desc: 'Aletlerin kalan dayanıklılığını sayıyla gösterir.' },
  { slug: 'held-item-info', name: 'Held Item Info', category: 'info', desc: 'Elindeki eşyanın büyülerini ekranda gösterir.' },
  { slug: 'status-effect-bars', name: 'Status Effect Bars', category: 'info', desc: 'İksir etkilerinin kalan süresini çubukla gösterir.' },
  { slug: 'lighty', name: 'Lighty', category: 'info', desc: 'Yaratık doğabilecek karanlık blokları işaretler.' },
  { slug: 'shulkerboxtooltip', name: 'Shulker Box Tooltip', category: 'info', desc: 'Shulker kutusunun içini açmadan gösterir.' },
  { slug: 'chat-heads', name: 'Chat Heads', category: 'info', desc: 'Sohbette oyuncu kafalarını gösterir.' },
  { slug: 'paginatedadvancements', name: 'Paginated Advancements', category: 'info', desc: 'Başarımlar ekranını büyük ve sayfalı yapar.' },

  // kolaylık
  { slug: 'modmenu', name: 'Mod Menu', category: 'utility', desc: 'Oyun içinden modları görüp ayarlarını açarsın.', default: true },
  { slug: 'mouse-tweaks', name: 'Mouse Tweaks', category: 'utility', desc: 'Envanterde sürükleyerek hızlı eşya taşıma.', conflicts: ['item-scroller'] },
  { slug: 'item-scroller', name: 'Item Scroller', category: 'utility', desc: "Mouse Tweaks'e alternatif: tekerlekle ve kısayollarla hızlı eşya taşıma.", conflicts: ['mouse-tweaks'] },
  { slug: 'inventory-profiles-next', name: 'Inventory Profiles Next', category: 'utility', desc: 'Tek tuşla envanter ve sandık düzenleme.' },
  { slug: 'item-highlighter', name: 'Item Highlighter', category: 'utility', desc: 'Yeni aldığın eşyaları envanterde işaretler.' },
  { slug: 'zoomify', name: 'Zoomify', category: 'utility', desc: 'C tuşuyla yakınlaştırma (dürbün gibi).', conflicts: ['ok-zoomer','logical-zoom'] },
  { slug: 'ok-zoomer', name: 'Ok Zoomer', category: 'utility', desc: "Zoomify'a alternatif: ayarlanabilir yakınlaştırma.", conflicts: ['zoomify', 'logical-zoom'] },
  { slug: 'logical-zoom', name: 'Logical Zoom', category: 'utility', desc: 'En sade yakınlaştırma: tek tuş, ayar yok.', conflicts: ['zoomify', 'ok-zoomer'] },
  { slug: 'controlling', name: 'Controlling', category: 'utility', desc: 'Tuş ayarlarında arama ve çakışma uyarısı.' },
  { slug: 'amecs', name: 'Amecs', category: 'utility', desc: 'Tuş atamalarına Ctrl/Shift/Alt kombinasyonları ekler.' },
  { slug: 'chatpatches', name: 'Chat Patches', category: 'utility', desc: "Compact Chat'e alternatif: sohbet geçmişini saklar, tekrarları birleştirir.", conflicts: ['compact-chat'] },
  { slug: 'compact-chat', name: 'Compact Chat', category: 'utility', desc: 'Tekrarlanan sohbet mesajlarını birleştirir.', conflicts: ['chatpatches'] },
  { slug: 'no-chat-reports', name: 'No Chat Reports', category: 'utility', desc: 'Sohbet mesajı imzalamayı kapatır.' },
  { slug: 'replaymod', name: 'Replay Mod', category: 'utility', desc: 'Oyunu kaydedip sonra istediğin açıdan izlersin.', conflicts: ['flashback'] },
  { slug: 'flashback', name: 'Flashback', category: 'utility', desc: "Replay Mod'a alternatif: oyunu kaydet, sinematik video çıkar.", conflicts: ['replaymod'] },
  { slug: 'fabrishot', name: 'Fabrishot', category: 'utility', desc: 'Çok yüksek çözünürlükte ekran görüntüsü alır.' },
  { slug: 'notenoughcrashes', name: 'Not Enough Crashes', category: 'utility', desc: 'Oyun çökünce masaüstüne atmaz, ana menüye döndürür.' },
  { slug: 'litematica', name: 'Litematica', category: 'utility', desc: 'Şema (schematic) yükleyip yapı inşa etmeyi kolaylaştırır.' },

  // ses
  { slug: 'ambientsounds', name: 'AmbientSounds', category: 'sound', desc: 'Biyoma göre kuş, rüzgâr, mağara sesleri.' },
  { slug: 'sound-physics-remastered', name: 'Sound Physics Remastered', category: 'sound', desc: 'Mağarada yankı, duvar arkasında boğuk ses.' },
  { slug: 'presence-footsteps', name: 'Presence Footsteps', category: 'sound', desc: 'Zemine göre gerçekçi ayak sesleri.' },
  { slug: 'sound-controller', name: 'Sound Controller', category: 'sound', desc: 'Her sesin seviyesini ayrı ayrı ayarlarsın.' },
]);

// Kategori paketleri (OneClient tarzı "kategorini seç, kur"): ilk açılıştaki seçim ekranı ve Modlar
// sekmesindeki "Paketi aç" bunları açar. Her paket kendi içinde çakışmasız ve hafif tutuldu.
const CATEGORY_INFO = Object.freeze({
  performance: 'Daha yüksek FPS, daha az takılma ve RAM. Herkese önerilir.',
  visual: 'Dinamik ışık, 3D skin, bağlantılı cam, dalgalanan pelerin.',
  animation: 'Birinci ve üçüncü şahısta daha canlı animasyonlar.',
  info: 'Mini harita, dünya haritası, blok bilgisi, açlık ve dayanıklılık göstergeleri.',
  utility: 'Hızlı envanter, yakınlaştırma, tuş ayarlarında arama.',
  sound: 'Biyom sesleri, mağarada yankı, zemine göre ayak sesi.',
});

const PICKS = Object.freeze({
  performance: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'krypton', 'moreculling', 'dynamic-fps', 'debugify', 'scalablelux'],
  visual: ['continuity', 'lambdynamiclights', '3dskinlayers', 'entity-model-features', 'entitytexturefeatures', 'wavey-capes', 'cubes-without-borders', 'better-clouds'],
  animation: ['punchy-fpa', 'not-enough-animations'],
  info: ['xaeros-minimap', 'xaeros-world-map', 'jade', 'appleskin', 'durability-tooltip', 'shulkerboxtooltip', 'status-effect-bars'],
  utility: ['modmenu', 'mouse-tweaks', 'zoomify', 'controlling', 'inventory-profiles-next'],
  sound: ['ambientsounds', 'sound-physics-remastered', 'presence-footsteps'],
});

const BY_SLUG = new Map(CATALOG.map((mod) => [mod.slug, mod]));
const DEFAULT_SELECTED = Object.freeze(CATALOG.filter((mod) => mod.default).map((mod) => mod.slug));

/** Bilinmeyenleri ve tekrarları atar; çakışan iki mod seçiliyse önce gelen kalır. */
function sanitizeSelection(list) {
  if (!Array.isArray(list)) return [...DEFAULT_SELECTED];
  const out = [];
  for (const slug of list) {
    if (typeof slug !== 'string' || !BY_SLUG.has(slug) || out.includes(slug)) continue;
    if ((BY_SLUG.get(slug).conflicts || []).some((other) => out.includes(other))) continue;
    out.push(slug);
  }
  return out;
}

module.exports = { CATALOG, CATEGORIES, CATEGORY_INFO, PICKS, BY_SLUG, DEFAULT_SELECTED, sanitizeSelection };
