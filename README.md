# تنگه هرمز: فرمانروایی آب‌های آزاد
**Strait of Hormuz: Sovereign of the High Seas**

بازی اندرویدی پرتره: تایكون مدیریت کشور (Idle Country Tycoon) + دفاع برجی تاکتیکی در زمان واقعی (Real-Time Tower Defense) روی نقشهٔ واقعی تنگهٔ هرمز.

- اقتصاد نفت و زنجیرهٔ تأمین (نفت → سوخت/فولاد/مهمات)، شبکهٔ برق و چرخهٔ واقعی بندر و نفتکش
- نقشهٔ یکپارچهٔ تئاتر دریایی ایران (خارگ تا جاسک) بر اساس جغرافیای واقعی، با نسخهٔ دوبعدی و نقشهٔ سه‌بعدی تعاملی
- سناریوی جنگی یکتا و سیستم اخبار داخل بازی برای هر نبرد

## مستندات

مستندات نسخهٔ آزمایشی ۰٫۷٫۲ و رابط «کارگاه بندر» در این پوشه است. [فهرست مستندات](strait-of-hormuz-game-docs/README.md)، [وضعیت واقعی و تست‌ها](strait-of-hormuz-game-docs/status.md)، [ساخت و انتشار](strait-of-hormuz-game-docs/release.md).

## فناوری
Next.js 16 + React 19 + TypeScript + Three.js — بسته‌بندی اندروید با Capacitor (پکیج `ir.hormuz.sovereign`).

## ساخت APK
```bash
npm ci
npm run verify
npm run build:android
bash android/gradlew -p android assembleDebug
```

## نسخه‌ها
ساخت محلی در `android/app/build/outputs/` قرار می‌گیرد؛ خروجی‌ها داخل گیت نیستند. نسخه‌های آزمایشی را گردش‌کار android-test-release.yml از کامیت تعیین‌شده می‌سازد و پس از تأیید فایل و هش در GitHub Releases قرار می‌دهد. APK آزمایشی امضای debug دارد؛ انتشار با کلید مالک و پذیرش دستگاه واقعی انجام می‌شود.
