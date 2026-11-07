# تنگه هرمز: فرمانروایی آب‌های آزاد
**Strait of Hormuz: Sovereign of the High Seas**

بازی اندرویدی پرتره: تایكون مدیریت کشور (Idle Country Tycoon) + دفاع برجی تاکتیکی در زمان واقعی (Real-Time Tower Defense) روی نقشهٔ واقعی تنگهٔ هرمز.

- اقتصاد نفت و زنجیرهٔ تأمین (نفت → سوخت/فولاد/مهمات)، شبکهٔ برق و چرخهٔ واقعی بندر و نفتکش
- نقشهٔ یکپارچهٔ تئاتر دریایی ایران (خارگ تا جاسک) بر اساس جغرافیای واقعی، با نسخهٔ دوبعدی و نقشهٔ سه‌بعدی تعاملی
- سناریوی جنگی یکتا و سیستم اخبار داخل بازی برای هر نبرد

## مستندات
مستندات رسمی پروژه در پوشهٔ [`strait-of-hormuz-game-docs/`](strait-of-hormuz-game-docs/) است:
- `PRD.md` — سند جامع طراحی و نیازمندی‌های محصول
- `decisions.md` — تصمیم‌های معتبر و دلیلشان
- `status.md` — وضعیت فعلی، کارهای باز و نقطهٔ ادامه
- `how_to_update_docs.md` — راهنمای نگهداری همین مستندات

## فناوری
Next.js 16 + React 19 + TypeScript + Three.js — بسته‌بندی اندروید با Capacitor (پکیج `ir.hormuz.sovereign`).

## ساخت APK
```bash
npm install
node scripts/build-android-web.mjs   # خروجی استاتیک در out/
npx cap sync android
cd android && ./gradlew assembleDebug
```

## نسخه‌ها
فایل‌های APK در بخش **Releases** همین مخزن منتشر می‌شوند (داخل گیت نیستند).
