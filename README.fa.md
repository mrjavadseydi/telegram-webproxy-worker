<div dir="rtl">

# پروکسی WEB تلگرام روی Cloudflare Workers

[English](README.md) | **فارسی**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrjavadseydi/telegram-webproxy-worker)

⭐ **اگر این پروژه را دوست دارید، با [ستاره دادن](https://github.com/mrjavadseydi/telegram-webproxy-worker) از من حمایت کنید.**

این پروژه سرور نوع جدید پروکسی تلگرام به نام **WEB proxy** است
([`telegramdesktop/tproxy-server`](https://github.com/telegramdesktop/tproxy-server)، پروتکل نسخه ۱)
که کاملاً روی یک Cloudflare Worker اجرا می‌شود. به VPS یا نصب MTProxy نیازی نیست.

</div>

> [!CAUTION]
> **سلب مسئولیت — پیش از استفاده بخوانید**
>
> - **این پروژه صرفاً و فقط برای اهداف آموزشی و پژوهشی منتشر شده است.**
> - **نویسنده هیچ‌گونه استفاده‌ی غیرقانونی، غیرمجاز یا سوءاستفاده از این پروژه را تشویق، تأیید یا حمایت نمی‌کند.**
> - **شما نباید از این پروژه برای نقض هیچ قانون، مقررات، حکم قضایی یا شرایط استفاده‌ای (از جمله شرایط Cloudflare و تلگرام) در کشور خود یا هر کشور دیگری استفاده کنید.**
> - **مسئولیت کامل و انحصاری نحوه‌ی استفاده از این پروژه و هرگونه پیامد آن، از جمله رعایت همه‌ی قوانین مربوط، فقط و فقط با خود شماست.**
> - **این نرم‌افزار «همان‌طور که هست» (AS IS) و بدون هیچ‌گونه ضمانت صریح یا ضمنی ارائه می‌شود. نویسنده هیچ تضمینی درباره‌ی امنیت، پایداری، قانونی بودن یا مناسب بودن آن برای هر هدفی نمی‌دهد.**
> - **تا حداکثر حدی که قانون اجازه می‌دهد، نویسنده در قبال هیچ ادعا، خسارت، زیان، جریمه یا پیامد حقوقی ناشی از استفاده، سوءاستفاده، راه‌اندازی، تغییر یا توزیع این پروژه — چه توسط شما و چه توسط هر شخص دیگری — مسئول نیست.**
> - **با استفاده، راه‌اندازی، کپی یا تغییر این پروژه، شما این شرایط را می‌پذیرید و متعهد می‌شوید نویسنده را در برابر هر ادعایی که از استفاده‌ی شما ناشی شود مصون نگه دارید و خسارت آن را جبران کنید.**
> - **این پروژه هیچ وابستگی‌ای به تلگرام یا Cloudflare ندارد و مورد تأیید یا حمایت آن‌ها نیست. همه‌ی نشان‌های تجاری متعلق به صاحبانشان هستند.**
>
> **اگر با این شرایط موافق نیستید، از این پروژه استفاده نکنید.**

```text
Telegram app ──MTProxy (obfuscated2)──> hidden WebView ──wss──> Worker ──TCP──> Telegram DC
```

<div dir="rtl">

- آدرس `GET /?bridge=<capability>` صفحه‌ی bridge را برمی‌گرداند. مقدار capability از روی نام دامنه و سکرت ساخته می‌شود. هر درخواست دیگری یک سایت ساده‌ی معمولی می‌بیند.
- روش انتقال `websocket-lanes` است: برای هر اتصال TCP تلگرام یک WebSocket جدا. هر lane یک اجرای جداگانه‌ی Worker با یک اتصال خروجی است.
- خود Worker نقش MTProxy را بازی می‌کند: ترافیک obfuscated2 اپ را با سکرت باز می‌کند، دوباره رمز می‌کند و مستقیم به دیتاسنتر تلگرام وصل می‌شود (بدون middle proxy).
- بدون state است: توکن‌ها با HMAC امضا می‌شوند، پس به KV یا Durable Objects نیازی نیست.

## راه‌اندازی

**ساده‌ترین روش: کپی یک فایل (بدون گیت‌هاب، بدون fork، فقط با مرورگر):**

1. در داشبورد Cloudflare به **Workers & Pages → Create → Create Worker** بروید، همان کد «Hello World» را نگه دارید و **Deploy** را بزنید.
2. **Edit code** را بزنید، همه‌ی کد را پاک کنید، کل محتوای فایل [`worker.js`](https://raw.githubusercontent.com/mrjavadseydi/telegram-webproxy-worker/main/worker.js) را جایگذاری کنید و **Deploy** را بزنید.
3. در **Settings → Variables and Secrets → Add** یک متغیر از نوع **Secret** با نام `SECRET` بسازید و مقدار آن را هر رمزی با حداقل ۸ کاراکتر بگذارید. ذخیره و Deploy کنید.
4. آدرس `https://<your-worker>.<your-subdomain>.workers.dev/<your-password>` را باز کنید تا لینک پروکسی‌تان را ببینید.

برای به‌روزرسانی، کافی است `worker.js` جدید را دوباره جایگذاری کنید. مقدار `SECRET` باقی می‌ماند.

**با یک کلیک (یک کپی از این مخزن در گیت‌هاب شما ساخته می‌شود):** دکمه‌ی بالا را بزنید. Cloudflare یک کپی از مخزن در گیت‌هاب شما می‌سازد، مقدار `SECRET` را می‌پرسد (**هر رمزی با حداقل ۸ کاراکتر**؛ هرچه بلندتر، امن‌تر) و Worker را منتشر می‌کند. بعد آدرس `https://<your-worker-host>/<your-password>` را باز کنید تا لینک پروکسی‌تان را ببینید.

مقدار `SECRET` می‌تواند یک رمز باشد (Worker با SHA-256 آن را به سکرت MTProxy تبدیل می‌کند) یا مستقیماً یک سکرت ۳۲ کاراکتری hex، مثلاً خروجی `openssl rand -hex 16`.

**با خط فرمان (CLI):**

</div>

```bash
npm install
SECRET='your password' npm run deploy   # deploys, stores SECRET, prints your full proxy page URL
```

<div dir="rtl">

در انتهای خروجی، آدرس کامل صفحه‌ی مشخصات پروکسی و لینک تلگرام در یک کادر برجسته نشان داده می‌شود. اگر `SECRET=…` را ندهید، فقط deploy می‌کند و آدرس را به شکل `https://<your-worker>/<your SECRET>` نشان می‌دهد.

> **دقت کنید:** اسم سکرت دقیقاً `SECRET` است. دستور `wrangler secret put SECRET` را بزنید و رمز یا مقدار hex را وقتی پرسید وارد کنید. اگر خود مقدار را جای اسم بنویسید، Worker سکرتی پیدا نمی‌کند.

بهتر است یک **دامنه‌ی اختصاصی** به Worker وصل کنید (Workers → Settings → Domains & Routes)، مثلاً `proxy.example.com`. دامنه‌ی `*.workers.dev` هم کار می‌کند ولی در بعضی شبکه‌ها (از جمله ایران) ممکن است مسدود باشد. دامنه باید فقط برای همین Worker باشد، چون base path پشتیبانی نمی‌شود.

## اتصال کلاینت

به کلاینتی نیاز دارید که از WEB proxy پشتیبانی کند (Telegram Desktop نسخه‌ی 7.2 به بالا). یک پروکسی از نوع WEB اضافه کنید:

</div>

```text
Server: proxy.example.com
Secret: 8561944064fc730cbfa4473562d8ec59
```

<div dir="rtl">

یا این لینک را باز کنید یا به اشتراک بگذارید:

</div>

```text
https://t.me/webproxy?server=proxy.example.com&secret=8561944064fc730cbfa4473562d8ec59
```

<div dir="rtl">

خود Worker هم در آدرس `https://proxy.example.com/<SECRET>` (رمز یا مقدار hex شما) صفحه‌ای نشان می‌دهد که سرور، سکرت، لینک‌های `t.me` و `tg://` را با دکمه‌ی کپی و یک دکمه‌ی «Open in Telegram» دارد. بقیه‌ی آدرس‌ها همان سایت معمولی را نشان می‌دهند، پس فقط کسی که سکرت را دارد این صفحه را پیدا می‌کند. این آدرس را جایی منتشر نکنید.

## تست

</div>

```bash
npm test                                                    # crypto / token / capability self-check
echo 'SECRET=8561944064fc730cbfa4473562d8ec59' > .dev.vars
npm run dev                                                 # local worker on :8787
node smoke.mjs http://localhost:8787 8561944064fc730cbfa4473562d8ec59      # -> resPQ OK
node smoke.mjs https://proxy.example.com 8561944064fc730cbfa4473562d8ec59  # deployed
```

<div dir="rtl">

اسکریپت `smoke.mjs` صفحه‌ی bridge را می‌گیرد، session می‌سازد، یک lane باز می‌کند و از طریق Worker درخواست `req_pq_multi` را به یک دیتاسنتر تلگرام می‌فرستد. اگر تلگرام با `resPQ` جواب بدهد، تست موفق است. آرگومان سوم (اختیاری) شماره‌ی دیتاسنتر است (پیش‌فرض `2`).

برای دیدن اتصال‌های زنده هنگام استفاده از تلگرام:

</div>

```bash
npx wrangler tail --format pretty
```

<div dir="rtl">

## محدودیت‌ها

- **مصرف CPU:** پلن رایگان روی کاغذ ۱۰ میلی‌ثانیه CPU برای هر اجرا می‌دهد. در تست ما پیام‌ها و دانلود عکس و ویدیو کار کردند، ولی اگر در `wrangler tail` خطای `Exceeded CPU` دیدید، پلن Paid بگیرید و `[limits] cpu_ms` را در `wrangler.toml` فعال کنید.
- فقط روش `websocket-lanes` پشتیبانی می‌شود. روش‌های `https`، `https-lanes` و `websocket` به state مشترک (Durable Objects) نیاز دارند.
- توکن bootstrap یک‌بارمصرف نیست؛ فقط در عمر ۲ دقیقه‌ای‌اش و فقط توسط کسی که صفحه‌ی bridge را باز کرده قابل استفاده‌ی دوباره است.
- سکرت می‌تواند ساده یا با پیشوند `dd` باشد. سکرت‌های `ee` (fake-TLS) پشتیبانی نمی‌شوند.
- این پروتکل فعلاً آزمایشی (proof of concept) تلگرام است و ممکن است تغییر کند.

</div>
