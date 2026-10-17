# Материалы и лицензии

Проверено 2026-10-17. Все используемые файлы находятся в public/assets/;
изображения WebP, шрифты WOFF2, без внешних запросов при посещении сайта.

- `hero-640.webp`, `hero-1280.webp`: Antoni Shkraba,
  https://www.pexels.com/photo/person-holding-coffee-beans-in-hands-7175974/
  Исходник https://images.pexels.com/photos/7175974/pexels-photo-7175974.jpeg
  [Pexels License](https://www.pexels.com/license/): бесплатное использование
  и адаптация, атрибуция необязательна. Не подразумеваем одобрение бренда.
- `hands.webp`: William Figueroa,
  https://unsplash.com/photos/hands-hold-a-bag-of-roasted-coffee-beans-VuGcrUL0zzo
  [Unsplash License](https://unsplash.com/license): бесплатное коммерческое
  использование и адаптация; запрещены продажа неизменённой копии и создание
  конкурирующей библиотеки. Это иллюстративное фото процесса, не основатели.
- `packaging.webp`, четыре продуктовых кадра и правая часть `og.jpg`:
  сгенерированы встроенным Imagegen 2026-10-17. Промпт ниже.
  Иллюстративная упаковка вымышленного бренда, не фото реального товара.
  Деривативы кадрированы и оптимизированы Pillow по заданию.
- `oswald.woff2`: Oswald (variable), https://github.com/google/fonts/tree/main/ofl/oswald
- `manrope.woff2`: Manrope (variable), https://github.com/google/fonts/tree/main/ofl/manrope
  Оба шрифта SIL Open Font License 1.1. Полные лицензии рядом в *-OFL.txt.
  Созданы WOFF2 подмножества Latin, Cyrillic и нужной пунктуации FontTools.
- favicon и текстовый логотип — исходная векторная/HTML графика проекта.
- Шаблон номера BY в `public/phone.js`:
  https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml
  Авторское право The Libphonenumber Authors, Apache-2.0;
  https://www.apache.org/licenses/LICENSE-2.0 (копия в libphonenumber-LICENSE.txt).
  Снимок 2026-10-17. Только fixedLine/mobile/VoIP для обратного звонка;
  короткие, платные и сервисные номера не принимаются. Проверка диапазона,
  длины и синтаксиса не подтверждает существование абонента.

## Imagegen prompt (built-in tool)

Use case: product-mockup. Warm editorial product photograph for a small
Belarusian coffee roastery brand «кварта». One continuous wide 3:2 still life,
not a collage: four products across a worn honey-colored wooden workshop
table. Three natural kraft stand-up coffee pouches with cream, terracotta
and forest-green label accents, and an open kraft box of white drip sachets.
Only the lowercase Cyrillic word «кварта» on each label. Off-white ceramic
coffee cup, scattered beans, leafy branch, amber window light, dark blurred
workshop background, tactile paper folds. No people, no website layout,
no watermark. Illustrative generated packaging, not actual product photos.

Исходный PNG создан встроенным инструментом в каталоге generated_images
пользователя; все используемые оптимизированные результаты скопированы в
проект. Публичный сайт не зависит от этого внешнего пути.

## Обновление визуала 2026-10-17

- `hero-workshop-1672.webp`, `hero-workshop-800.webp`: предоставленный
  пользователем `kvarta-hero-photo.png` (1672 × 941), сгенерированный встроенным
  ImageGen. Ручная фасовка кофе, естественный свет, свободное место слева.
  Исходный файл: `Documents/Codex/2026-10-17/jw/outputs/kvarta-hero-photo.png`.
- `workshop.webp`: встроенный ImageGen, иллюстративная мастерская и два
  вымышленных обжарщика у ростера. Это не фотография реальных основателей.
  Промпт: documentary portrait 4:5, woman checking roasted beans in cooling
  tray, man using sample scoop beside compact roaster, natural window light,
  olive aprons and linen shirts, candid working scene, no text or watermark.
- `ethiopia-studio.webp`, `colombia-studio.webp`, `brazil-studio.webp`,
  `drips-studio.webp`: кадры одного сгенерированного ImageGen предметного
  фото. Промпт: four evenly spaced kraft products on seamless pale ivory
  studio background, frontal view, equal scale, soft daylight, no props;
  cream labels, condensed Cyrillic typography inspired by Oswald, lowercase
  «кварта» and eight-spoke star, readable variety names and weight;
  ochre / terracotta / green accent stripes. Три пачки по 250 г и коробка
  из 10 дрип-пакетов.
- `subscription-pair.webp`: встроенный ImageGen. Промпт: exactly two kraft
  250g pouches, «кварта», «ИРГАЧЕФФЕ / ЭФИОПИЯ» and «УИЛА / КОЛУМБИЯ»,
  condensed Cyrillic type, cream labels with ochre and terracotta stripes,
  limestone tabletop, olive wall, natural morning light, no other products.

Новые PNG сохранены ImageGen в пользовательском `generated_images`.
Опубликованные локальные WebP подготовлены Sharp (кадрирование, уменьшение,
сжатие без метаданных). Sharp использован разово, зависимостей проекта нет.
Прежние исходные assets и сведения об их лицензиях сохранены;
`og.jpg` пока использует прежнюю иллюстрацию упаковки.

- `og-workshop-v2.jpg`: новая карточка для мессенджеров, 1200 × 630.
  Предоставленное пользователем фото фасовки из нового hero, логотип со
  SVG-знаком и текст шрифтами Oswald/Manrope. Композиция свёрстана в HTML/CSS,
  отрендерена Chrome через Playwright и сохранена в JPEG через Sharp.
  Старый `og.jpg` сохранён; актуальные Open Graph / Twitter метаданные
  ссылаются на `og-workshop-v2.jpg`.
