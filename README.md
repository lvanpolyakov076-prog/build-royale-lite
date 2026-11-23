# Build Royale Lite на Render Free

Архив содержит игру с ботами, сетевые комнаты, дуэль 1 на 1 и Box PvP. Сервер отдаёт игру и обрабатывает лобби по одному HTTPS-адресу.

## 1. Загрузить файлы на GitHub

1. Распакуй архив.
2. Открой https://github.com/new и создай репозиторий `build-royale-lite`. Можно выбрать **Private**.
3. В пустом репозитории нажми **uploading an existing file**. Если файлы уже есть, нажми **Add file → Upload files**.
4. Перетащи из распакованного архива `index.html`, `server.cjs`, `package.json`, `render.yaml` и этот `README.md`. После загрузки проверь, что `render.yaml` находится в корне репозитория рядом с `index.html`.
5. Нажми **Commit changes**.

## 2. Создать сервис на Render

1. Открой https://dashboard.render.com/ и войди через GitHub.
2. Нажми **New → Blueprint**. Выбери репозиторий `build-royale-lite`. Если Render его не видит, в настройках интеграции GitHub дай Render доступ к этому репозиторию.
3. Проверь, что Render предлагает создать один **Web Service**, тариф **Free**, регион **Frankfurt**. Нажми **Deploy Blueprint**.
4. Дождись статуса **Live**. Открой HTTPS-ссылку с окончанием `onrender.com` на странице сервиса. Если Render добавит суффикс к имени, используй адрес из панели.

### Если настраиваешь через New → Web Service

| Поле | Значение |
|---|---|
| Runtime | Node |
| Instance Type | Free |
| Region | Frankfurt |
| Root Directory | Оставь пустым, если файлы в корне |
| Build Command | `npm run check` |
| Start Command | `npm start` |
| Environment Variable | `HOST` = `0.0.0.0` |
| Health Check Path | `/healthz` |

Render сам задаёт `PORT`. Сервер уже использует это значение.

## 3. Проверить игру

1. Открой ссылку Render в двух вкладках. В первой выбери **Мультиплеер → Создать лобби**, выбери **Дуэльная арена** и создай комнату.
2. Во второй выбери **Присоединиться к лобби** и введи код. В обеих вкладках нажми **Готов**. Организатор нажимает **Старт**.
3. После проверки отправь друзьям HTTPS-ссылку Render и код комнаты.

Если хочешь проверить архив на своём ПК, установи Node.js 22, открой терминал в папке игры и запусти `npm start`. Адрес локальной игры — http://127.0.0.1:8080/.

## Что учитывать на Free

После 15 минут без входящих запросов сервис засыпает. Первое открытие после сна может занять около минуты. Лобби хранятся в памяти и исчезают при перезапуске. Тариф имеет лимиты трафика и сборок. Если добавлен способ оплаты, за превышение лимитов Render может начислить плату. Сетевую игру проверяли локально, нагрузку и задержку на Render предстоит проверить после развёртывания.

Документация:
- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/web-services
- https://render.com/docs/free
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
