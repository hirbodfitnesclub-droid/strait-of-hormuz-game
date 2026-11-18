# ساخت و آمادگی انتشار — 0.7.0

اپ جاری Android با شناسهٔ `ir.hormuz.sovereign`، `versionName=0.7.0`، `versionCode=7`، حداقل API 23 و target/compile API 36 است. React و Three در بستهٔ Capacitor اجرا می‌شوند. انتقال به Unity انجام نشده است. APK آزمایشی و AAB محلی ساخته شده‌اند؛ هیچ انتشار محیط، push، انتشار GitHub Release یا ارسال به فروشگاه در این مأموریت انجام نشده است.

## ساخت قابل تکرار

Node 24، JDK 21، Android SDK platform 36 و build-tools 35.0.0 لازم‌اند. Gradle wrapper 8.11.1 و AGP 8.9.1 در مخزن‌اند. نسخه‌های npm را از lockfile نصب کنید.

```bash
npm ci
npm run verify
npm run build:android
bash android/gradlew -p android assembleDebug bundleRelease :app:lintDebug :app:lintRelease
```

`build:android` خروجی استاتیک می‌سازد، API سروری و manifest PWA را از آن کنار می‌گذارد و با Capacitor همگام می‌کند. فایل‌های سورس در `finally` بازگردانده می‌شوند؛ هم‌زمان با آن build یا typecheck دیگری روی همین checkout اجرا نکنید. تایپ‌های تولیدشدهٔ مسیرهای Next پیش از build بازتولید می‌شوند تا APIهای کنارگذاشته‌شده از cache توسعه وارد typecheck نشوند. `npm run build` نسخهٔ سروری اختیاری است و محصول Android به اجرای آن نیاز ندارد.

SDK با `ANDROID_HOME`/`ANDROID_SDK_ROOT` یا `android/local.properties` معرفی می‌شود؛ مسیر محلی SDK و cache ماشین داخل گیت نیست. پروژهٔ CI در `.github/workflows/quality.yml` بررسی کد، build استاتیک و assembleDebug/lintDebug دارد؛ این workflow ساخته شده ولی اجرای GitHub Actions در این مأموریت ادعا نشده است. هیچ گام انتشار خودکار ندارد.

| خروجی | کاربرد |
|---|---|
| `android/app/build/outputs/apk/debug/app-debug.apk` | نصب آزمایشی؛ امضای debug، مناسب انتشار فروشگاه نیست |
| `android/app/build/outputs/bundle/release/app-release.aab` | bundle انتشار محلی؛ تا معرفی کلید مالک بدون امضاست |
| `android/app/build/reports/lint-results-debug.html` | گزارش lint بومی debug |
| `android/app/build/reports/lint-results-release.html` | گزارش lint بومی release |

خروجی جاری حدود ۱۶۲٫۴ MiB برای APK و ۱۵۸٫۷ MiB برای AAB است؛ اندازهٔ دریافت واقعی Google Play به بسته‌بندی/دستگاه بستگی دارد. فایل‌ها شامل همهٔ مدل‌های بازی‌اند. بررسی ZIP هیچ کتابخانهٔ native با پسوند `.so` در این دو خروجی پیدا نکرد؛ رندر به WebView سیستم متکی است. `aapt` روی APK حداقل ۲۳ و هدف ۳۶ را تأیید کرده است. اندازه، SHA-256 و نتایج نهایی در [validation.json](validation.json) ثبت می‌شوند.

## امضای متعلق به ناشر

چهار متغیر `HORMUZ_KEYSTORE`، `HORMUZ_STORE_PASSWORD`، `HORMUZ_KEY_ALIAS` و `HORMUZ_KEY_PASSWORD` را در محیط امن ساخت قرار دهید؛ مسیر فایل اولی باید به keystore واقعی ناشر اشاره کند. Gradle فقط در صورت وجود این پیکربندی، release را با آن امضا می‌کند. کلید انتشار مالک در این مأموریت ساخته، تعویض یا فرض نشده است. از کلید debug برای انتشار استفاده نکنید؛ اگر اپ قبلاً منتشر شده، شناسه، شمارهٔ نسخه و قرارداد امضای همان اپ باید حفظ شوند.

برای APK release پس از تنظیم کلید، `bash android/gradlew -p android assembleRelease` و برای AAB، `bundleRelease` اجرا شود. با `apksigner verify` برای APK و `jarsigner -verify` برای AAB امضای خروجی را کنترل کنید. هیچ مقدار secret را در فایل نسخه‌بندی‌شده یا خروجی گزارش قرار ندهید.

## موارد وابسته به فروشگاه و مالک

طبق [مقررات رسمی target API گوگل‌پلی](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)، بررسی‌شده در 2026-11-17، ارسال برنامه/به‌روزرسانی جدید تلفن از 2026-08-31 باید Android 16/API 36 یا بالاتر را هدف بگیرد؛ پیکربندی پروژه اکنون ۳۶ است. برآوردن target API به‌تنهایی پذیرش فروشگاه را ثابت نمی‌کند.

کارهای باقی‌مانده‌ای که بدون ناشر/دستگاه واقعی قابل تأیید نیستند:

1. تست همین binary روی گوشی میان‌رده و ضعیف واقعی: ۱۰ دقیقه نبرد شلوغ، ۳۰ دقیقه بازی، حرارت/باتری/حافظه، فریم‌های صدک ۹۵، لمس، حاشیهٔ امن، قطع/بازگشت برنامه، kill/relaunch، صدای بازی، Haptics، Share و انتخاب فایل. روی Android 16 و نمایشگر بزرگ نیز رفتار orientation و edge-to-edge بررسی شود.
2. معرفی کلید و حساب ناشر، شمارهٔ نسخهٔ مجاز و متن/تصویر فروشگاه؛ تکمیل پرسشنامهٔ رده‌بندی محتوای نبرد. اسکرین‌شات توسعه جای اسکرین‌شات واقعی binary فروشگاهی نیست.
3. تکمیل هویت و تماس ناشر در [حریم داده](privacy.md)، میزبانی عمومی سیاست و پاسخ‌گویی Data Safety مطابق همین نسخه؛ بررسی منابع [CREDITS](../CREDITS.md). درآمدزایی و تبلیغ در این نسخه وجود ندارد و نباید در فروشگاه وعده داده شود.
4. بررسی شرایط جاری ارسال در پنل واقعی Myket و Google Play، و اجرای مسیر آزمایشی/پیش‌انتشار هر حساب. دسترسی به پنل Myket و نتیجهٔ review فروشگاه در این مأموریت وجود نداشته است.

آزمون دسکتاپ با SwiftShader نمایندهٔ FPS یا حرارت گوشی نیست. فایل نصب آزمایشی قابل ساخت است، اما عنوان «آمادهٔ انتشار عمومی بدون شرط» تا پایان موارد بالا دقیق نیست. هدف نگهداشت ۹۰٪ نیز به cohort بالغ واقعی نیاز دارد؛ [مرجع سنجش](retention-and-monetization.md) محدودیت گزارش محلی را توضیح می‌دهد.

## پیش‌انتشار آزمایشی با GitHub Actions

نسخهٔ آزمایشی بعدی را در package.json و package-lock.json و versionName اندروید هماهنگ کنید، versionCode را افزایش دهید و یادداشت فارسی را در `release-notes/vX.Y.Z-test.md` اضافه کنید. پس از push، Workflow موجود `android-test-release.yml` را روی ref همان نسخه با ورودی SHA کامل اجرا کنید. Workflow فایل debug را امضا و بررسی می‌کند، آن را به‌صورت Artifact نگه می‌دارد و فقط پس از تأیید SHA-256 فایل در GitHub پیش‌نویس را منتشر می‌کند. پیش‌نویس موجود همان نسخه استفاده می‌شود و پیش‌انتشار منتشرشده بازنویسی نمی‌شود. توکن داخلی Actions برای این مسیر کافی است.
