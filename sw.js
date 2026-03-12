/**
 * ============================================================
 * Service Worker - G202 GSM Gate Opener PWA
 * ============================================================
 * يتولى هذا الملف إدارة التخزين المؤقت (Cache) وتمكين
 * التطبيق من العمل بشكل كامل حتى بدون اتصال بالإنترنت.
 */

// اسم وإصدار ذاكرة التخزين المؤقت - غيّر الإصدار عند تحديث الملفات
const CACHE_NAME = 'g202-gate-opener-v1.2';

// قائمة الملفات التي سيتم تخزينها مؤقتاً لتشغيل التطبيق أوفلاين
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  // Tailwind CSS من شبكة توصيل المحتوى (CDN) - سيُخزَّن مؤقتاً عند أول زيارة
  'https://cdn.tailwindcss.com'
];

// ============================================================
// حدث التثبيت (Install Event)
// يُشغَّل مرة واحدة عند تسجيل Service Worker لأول مرة
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 جاري تثبيت Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 📦 جاري تخزين الملفات الأساسية في الكاش...');
      // نستخدم addAll لتخزين الملفات المحلية، ونتجاهل أخطاء CDN
      return cache.addAll(['/index.html', '/manifest.json']).catch((err) => {
        console.warn('[SW] ⚠️ تعذّر تخزين بعض الملفات:', err);
      });
    }).then(() => {
      // تفعيل Service Worker فوراً دون انتظار إغلاق التبويبات القديمة
      return self.skipWaiting();
    })
  );
});

// ============================================================
// حدث التفعيل (Activate Event)
// يُشغَّل بعد التثبيت، ويُستخدم لحذف الكاش القديم
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ تم تفعيل Service Worker بنجاح');

  event.waitUntil(
    // حذف جميع نسخ الكاش القديمة التي لا تتطابق مع الإصدار الحالي
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((oldCache) => {
            console.log('[SW] 🗑️ حذف الكاش القديم:', oldCache);
            return caches.delete(oldCache);
          })
      );
    }).then(() => {
      // التحكم في جميع التبويبات المفتوحة فوراً
      return self.clients.claim();
    })
  );
});

// ============================================================
// حدث اعتراض الطلبات (Fetch Event)
// استراتيجية: Cache First (الكاش أولاً، ثم الشبكة كاحتياط)
// ============================================================
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // تجاهل طلبات chrome-extension وغيرها من البروتوكولات الخاصة
  if (!event.request.url.startsWith('http')) return;

  // تجاهل طلبات POST (SMS links تستخدم GET فقط)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // إذا وُجد الملف في الكاش، أعده مباشرة (أسرع)
      if (cachedResponse) {
        console.log('[SW] 📋 تم استرجاع من الكاش:', requestUrl.pathname);
        return cachedResponse;
      }

      // إذا لم يكن في الكاش، اطلبه من الشبكة ثم خزّنه
      return fetch(event.request).then((networkResponse) => {
        // تأكد من أن الاستجابة صحيحة قبل التخزين
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type !== 'opaque' // لا نخزّن استجابات CORS غير شفافة
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // إذا فشلت الشبكة وليس في الكاش، أعد صفحة index.html كبديل
        console.warn('[SW] 📴 الشبكة غير متاحة، إعادة الصفحة الرئيسية...');
        return caches.match('/index.html');
      });
    })
  );
});

// ============================================================
// استقبال رسائل من التطبيق الرئيسي (Message Event)
// ============================================================
self.addEventListener('message', (event) => {
  // أمر تحديث الكاش عند طلب المستخدم
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] 🔄 تم استلام أمر التحديث الفوري');
    self.skipWaiting();
  }
});
