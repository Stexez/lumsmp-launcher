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
  { slug: 'moreculling', name: 'More Culling', category: 'performance', desc: 'Yaprak ve blok yüzlerini akıllıca gizler.' },
  { slug: 'dynamic-fps', name: 'Dynamic FPS', category: 'performance', desc: 'Oyun arka plandayken FPS\'i düşürüp bilgisayarı rahatlatır.' },
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
  { slug: 'bettergrassify', name: 'BetterGrassify', category: 'visual', desc: 'Çimen bloklarının yanlarını da yeşil yapar.' },
  { slug: 'distanthorizons', name: 'Distant Horizons', category: 'visual', desc: 'Çok uzağı düşük detayla gösterip görüş mesafesini büyütür.' },
  { slug: 'bobby', name: 'Bobby', category: 'visual', desc: 'Gezdiğin yerleri hatırlar, sunucunun görüş sınırından uzağı da gösterir.' },
  { slug: 'visuality', name: 'Visuality', category: 'visual', desc: 'Kristal parıltısı, su damlası gibi küçük parçacıklar ekler.' },
  { slug: 'fallingleaves', name: 'Falling Leaves', category: 'visual', desc: 'Ağaçlardan yaprak dökülür.' },
  { slug: 'particle-rain', name: 'Particle Rain', category: 'visual', desc: 'Yağmur ve karı parçacıklarla daha gerçekçi yapar.' },
  { slug: 'wavey-capes', name: 'Wavey Capes', category: 'visual', desc: 'Pelerinler rüzgârda dalgalanır.' },
  { slug: 'capes', name: 'Capes', category: 'visual', desc: 'OptiFine ve diğer servislerin pelerinlerini gösterir.' },
  { slug: 'cubes-without-borders', name: 'Cubes Without Borders', category: 'visual', desc: 'Kenarlıksız tam ekran; alt-tab anında olur.' },
  { slug: 'dark-loading-screen', name: 'Dark Loading Screen', category: 'visual', desc: 'Açılış ekranını koyu renk yapar.' },

  // animasyon
  { slug: 'punchy-fpa', name: 'Punchy!', category: 'animation', desc: 'Birinci şahısta vuruş, yeme ve eşya animasyonları.', conflicts: ['first-person-model'] },
  { slug: 'punchymoves', name: 'Punchy! Moves', category: 'animation', desc: 'Üçüncü şahıs animasyonları ve dinamik kamera.' },
  { slug: 'not-enough-animations', name: 'Not Enough Animations', category: 'animation', desc: 'Harita tutma, yeme, merdiven gibi eksik animasyonlar.' },
  { slug: 'first-person-model', name: 'First-person Model', category: 'animation', desc: 'Aşağı bakınca kendi vücudunu görürsün.', conflicts: ['punchy-fpa'] },

  // harita & bilgi
  { slug: 'xaeros-minimap', name: 'Xaero\'s Minimap', category: 'info', desc: 'Köşede mini harita ve yol noktaları.' },
  { slug: 'xaeros-world-map', name: 'Xaero\'s World Map', category: 'info', desc: 'M tuşuyla açılan tam ekran dünya haritası.' },
  { slug: 'jade', name: 'Jade', category: 'info', desc: 'Baktığın bloğun/yaratığın adını ve bilgisini gösterir.' },
  { slug: 'appleskin', name: 'AppleSkin', category: 'info', desc: 'Yemeklerin ne kadar doyurduğunu ve doygunluğu gösterir.' },
  { slug: 'jei', name: 'Just Enough Items', category: 'info', desc: 'Tüm eşyaları ve tariflerini envanterde gösterir.' },
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
  { slug: 'mouse-tweaks', name: 'Mouse Tweaks', category: 'utility', desc: 'Envanterde sürükleyerek hızlı eşya taşıma.' },
  { slug: 'inventory-profiles-next', name: 'Inventory Profiles Next', category: 'utility', desc: 'Tek tuşla envanter ve sandık düzenleme.' },
  { slug: 'item-highlighter', name: 'Item Highlighter', category: 'utility', desc: 'Yeni aldığın eşyaları envanterde işaretler.' },
  { slug: 'zoomify', name: 'Zoomify', category: 'utility', desc: 'C tuşuyla yakınlaştırma (dürbün gibi).' },
  { slug: 'controlling', name: 'Controlling', category: 'utility', desc: 'Tuş ayarlarında arama ve çakışma uyarısı.' },
  { slug: 'compact-chat', name: 'Compact Chat', category: 'utility', desc: 'Tekrarlanan sohbet mesajlarını birleştirir.' },
  { slug: 'no-chat-reports', name: 'No Chat Reports', category: 'utility', desc: 'Sohbet mesajı imzalamayı kapatır.' },
  { slug: 'replaymod', name: 'Replay Mod', category: 'utility', desc: 'Oyunu kaydedip sonra istediğin açıdan izlersin.' },
  { slug: 'litematica', name: 'Litematica', category: 'utility', desc: 'Şema (schematic) yükleyip yapı inşa etmeyi kolaylaştırır.' },

  // ses
  { slug: 'ambientsounds', name: 'AmbientSounds', category: 'sound', desc: 'Biyoma göre kuş, rüzgâr, mağara sesleri.' },
  { slug: 'sound-physics-remastered', name: 'Sound Physics Remastered', category: 'sound', desc: 'Mağarada yankı, duvar arkasında boğuk ses.' },
  { slug: 'presence-footsteps', name: 'Presence Footsteps', category: 'sound', desc: 'Zemine göre gerçekçi ayak sesleri.' },
  { slug: 'sound-controller', name: 'Sound Controller', category: 'sound', desc: 'Her sesin seviyesini ayrı ayrı ayarlarsın.' },
]);

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

module.exports = { CATALOG, CATEGORIES, BY_SLUG, DEFAULT_SELECTED, sanitizeSelection };
