# Справочник инструментов

MCP Telegram предоставляет расширенный набор инструментов, организованных по категориям. Все инструменты автоматически обнаруживаются через MCP.

## Аутентификация

| Инструмент | Описание |
|------------|----------|
| `telegram-status` | Проверка подключения и информация об аккаунте |
| `telegram-login` | Генерация QR-кода для аутентификации |
| `telegram-logout` | Отзыв сессии на серверах Telegram и удаление локального session-файла |

## Сообщения

| Инструмент | Описание |
|------------|----------|
| `telegram-send-message` | Отправка сообщения в любой чат (включая `quoteText` для цитаты фрагмента и Premium `effect` — анимированный эффект) |
| `telegram-edit-message` | Редактирование отправленного сообщения |
| `telegram-delete-message` | Удаление сообщений |
| `telegram-forward-message` | Пересылка сообщений между чатами |
| `telegram-send-scheduled` | Отложенная отправка сообщения |
| `telegram-send-typing` | Индикатор «печатает…» / «загружает файл» |
| `telegram-translate-message` | Перевод одного или нескольких сообщений (требуется Premium; расходует квоту переводов) |
| `telegram-get-message-link` | Получить публичную t.me-ссылку на сообщение |

## Отложенные

| Инструмент | Описание |
|------------|----------|
| `telegram-get-scheduled` | Список отложенных сообщений в чате |
| `telegram-delete-scheduled` | Удалить одно или несколько отложенных сообщений |

## Чтение

| Инструмент | Описание |
|------------|----------|
| `telegram-list-chats` | Список чатов с фильтрами |
| `telegram-read-messages` | Чтение последних сообщений с пагинацией |
| `telegram-search-messages` | Поиск в конкретном чате по ключевым словам |
| `telegram-search-global` | Поиск по всем чатам сразу |
| `telegram-search-chats` | Поиск чатов по названию |
| `telegram-get-unread` | Чаты с непрочитанными сообщениями |
| `telegram-mark-as-read` | Отметить чат как прочитанный |
| `telegram-get-replies` | Чтение комментариев/реплаев к посту канала |
| `telegram-get-unread-mentions` | Непрочитанные упоминания в чате (помечает их прочитанными на сервере) |
| `telegram-get-unread-reactions` | Непрочитанные реакции на ваши сообщения (помечает их прочитанными на сервере) |
| `telegram-get-saved-dialogs` | Список «папок» внутри «Избранного» (Saved Messages) |

## Черновики

| Инструмент | Описание |
|------------|----------|
| `telegram-save-draft` | Сохранить текстовый черновик в чате (пустой — удаляет черновик) |
| `telegram-get-drafts` | Список всех чатов с сохранёнными черновиками |
| `telegram-clear-drafts` | Очистить черновик чата, либо все черновики во всех чатах (требуется `confirmAllChats: true`) |

## Топики форумов

| Инструмент | Описание |
|------------|----------|
| `telegram-list-topics` | Список топиков в форуме |
| `telegram-read-topic-messages` | Чтение сообщений из конкретного топика |
| `telegram-create-topic` | Создать новый топик |
| `telegram-edit-topic` | Переименовать, закрыть, скрыть или обновить топик |
| `telegram-delete-topic` | Удалить топик вместе с историей |

## Опросы

| Инструмент | Описание |
|------------|----------|
| `telegram-create-poll` | Создание опроса или викторины |

## Голосование в опросах (v1.31.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-vote-poll` | Проголосовать в опросе по индексу варианта. Пустой массив `optionIndexes: []` отзывает голос |
| `telegram-get-poll-results` | Получить сводные результаты: голоса, проценты, правильные ответы в викторинах |
| `telegram-get-poll-voters` | Список проголосовавших по варианту (только публичные опросы, с пагинацией) |
| `telegram-close-poll` | Закрыть опрос навсегда — необратимая операция |

## Реакции

| Инструмент | Описание |
|------------|----------|
| `telegram-send-reaction` | Поставить реакцию на сообщение |
| `telegram-get-reactions` | Получить реакции на сообщение |
| `telegram-set-default-reaction` | Задать реакцию по умолчанию для вашего аккаунта |
| `telegram-get-top-reactions` | Топовые (популярные) эмодзи-реакции Telegram |
| `telegram-get-recent-reactions` | Ваши недавно использованные реакции |

## Платные реакции (v1.31.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-send-paid-reaction` | Отправить ★ звёзды как платную реакцию на пост канала (`count` 1–2500, опциональный `private`) |
| `telegram-toggle-paid-reaction-privacy` | Переключить видимость в таблице лидеров для платной реакции на конкретный пост |
| `telegram-get-paid-reaction-privacy` | Получить текущую настройку приватности платных реакций по умолчанию |

## Транскрипция аудио (v1.31.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-transcribe-audio` | Запустить транскрипцию голосового/видео-сообщения (Telegram Premium). Возвращает `transcriptionId`; при `pending:true` — повторите `telegram-get-transcription` |
| `telegram-get-transcription` | Получить обновлённый статус транскрипции (идемпотентный вызов) |
| `telegram-rate-transcription` | Оценить качество транскрипции как хорошее или плохое |

## Проверка фактов (v1.31.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-get-fact-check` | Получить аннотации фактчекинга для до 100 сообщений канала |
| `telegram-edit-fact-check` | Добавить/обновить аннотацию фактчекинга (требуются привилегии фактчекера) |
| `telegram-delete-fact-check` | Удалить аннотацию фактчекинга (требуются привилегии фактчекера) |

## Стикеры

| Инструмент | Описание |
|------------|----------|
| `telegram-send-sticker` | Отправить стикер |
| `telegram-get-installed-stickers` | Список установленных стикерпаков |
| `telegram-get-recent-stickers` | Недавно использованные стикеры |
| `telegram-get-sticker-set` | Просмотр стикеров в паке |
| `telegram-search-sticker-sets` | Поиск стикерпаков |

## Медиа

| Инструмент | Описание |
|------------|----------|
| `telegram-send-file` | Отправка файла, фото или документа |
| `telegram-download-media` | Скачивание медиа из сообщения |
| `telegram-get-profile-photo` | Получение фото профиля |
| `telegram-get-web-preview` | Превью ссылки (заголовок/описание/сайт) перед отправкой |

## Rich Media (v1.29.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-send-voice` | Голосовое сообщение (OGG/Opus) — показывается с waveform UI |
| `telegram-send-video-note` | Видео-кружочек (MP4, квадратный, ≤60 сек) |
| `telegram-send-location` | Геопозиция — статичная либо live (параметр `livePeriod`, 60–86400 сек) |
| `telegram-send-venue` | Карточка места (title, address, координаты) |
| `telegram-send-contact` | Карточка контакта (phone, firstName, lastName, vCard) |
| `telegram-send-dice` | Анимированный dice/game (🎲🎯🎰🏀⚽🎳); возвращает значение броска |
| `telegram-send-album` | Альбом из 2–10 фото/видео в одном сообщении |

Все `filePath` принимают только абсолютные локальные пути. URL, UNC-шары, `..` и системные псевдо-директории (`/proc`, `/sys`, `/dev`, `/run`) отклоняются.

## Группы

| Инструмент | Описание |
|------------|----------|
| `telegram-create-group` | Создать группу |
| `telegram-edit-group` | Изменить название, описание, фото |
| `telegram-invite-to-group` | Пригласить в группу |
| `telegram-join-chat` | Вступить по инвайт-ссылке |
| `telegram-leave-group` | Покинуть группу |
| `telegram-kick-user` | Кикнуть пользователя |
| `telegram-ban-user` | Забанить пользователя |
| `telegram-unban-user` | Разбанить пользователя |
| `telegram-set-admin` | Назначить администратором |
| `telegram-remove-admin` | Снять права администратора |
| `telegram-get-my-role` | Проверить свою роль и права |
| `telegram-set-chat-permissions` | Установить права по умолчанию для всех участников (опущенные флаги сохраняют текущее значение) |
| `telegram-set-slow-mode` | Задать интервал медленного режима для супергруппы |
| `telegram-get-admin-log` | Журнал модерации/админ-событий |

## Информация о чатах

| Инструмент | Описание |
|------------|----------|
| `telegram-get-chat-info` | Подробная информация о чате |
| `telegram-get-chat-members` | Список участников группы/канала |
| `telegram-get-chat-folders` | Список папок чатов |

## Инвайт-ссылки

| Инструмент | Описание |
|------------|----------|
| `telegram-create-invite-link` | Создать ссылку-приглашение |
| `telegram-get-invite-links` | Список существующих ссылок |
| `telegram-revoke-invite-link` | Отозвать ссылку |

## Контакты

| Инструмент | Описание |
|------------|----------|
| `telegram-get-contacts` | Список контактов |
| `telegram-add-contact` | Добавить контакт |
| `telegram-get-contact-requests` | Входящие запросы на контакт |

## Модерация

| Инструмент | Описание |
|------------|----------|
| `telegram-block-user` | Заблокировать пользователя |
| `telegram-unblock-user` | Разблокировать пользователя |
| `telegram-report-spam` | Пожаловаться на спам |

## Профили

| Инструмент | Описание |
|------------|----------|
| `telegram-get-profile` | Информация о профиле пользователя |
| `telegram-update-profile` | Обновить свой профиль (имя, био, username) |

## Аккаунт

| Инструмент | Описание |
|------------|----------|
| `telegram-get-sessions` | Список активных сессий (устройств) |
| `telegram-terminate-session` | Завершить сессию |
| `telegram-set-privacy` | Настройки приватности |
| `telegram-set-auto-delete` | Таймер автоудаления сообщений |

## Закрепление

| Инструмент | Описание |
|------------|----------|
| `telegram-pin-message` | Закрепить сообщение |
| `telegram-unpin-message` | Открепить сообщение |

## Настройки чата

| Инструмент | Описание |
|------------|----------|
| `telegram-mute-chat` | Замьютить или размьютить уведомления |
| `telegram-archive-chat` | Переместить чат в Архив или обратно |
| `telegram-pin-chat` | Закрепить или открепить диалог в списке чатов |
| `telegram-mark-dialog-unread` | Отметить диалог непрочитанным или снять пометку |

## Настройки администратора и кастомизация

| Инструмент | Описание |
|------------|----------|
| `telegram-toggle-channel-signatures` | Включить/выключить подписи постов в канале |
| `telegram-toggle-anti-spam` | Включить/выключить встроенный антиспам в супергруппе (админ с `ban_users`) |
| `telegram-toggle-forum-mode` | Включить/выключить режим форума (отключение удаляет все темы; требуется `confirm: true`) |
| `telegram-toggle-prehistory-hidden` | Скрыть или показать предысторию для новых участников супергруппы |
| `telegram-set-chat-reactions` | Настроить разрешённые реакции в чате (`all` / `some` / `none`) |
| `telegram-approve-join-request` | Одобрить или отклонить заявку на вступление |

## Статистика

| Инструмент | Описание |
|------------|----------|
| `telegram-get-broadcast-stats` | Статистика канала (`includeGraphs: true` для сырых графиков; может требоваться Premium-админ) |
| `telegram-get-megagroup-stats` | Статистика супергруппы (Telegram ограничивает до ~1 запроса/30 мин на канал) |

## Инлайн-боты и кнопки

| Инструмент | Описание |
|------------|----------|
| `telegram-inline-query` | Инлайн-запрос к боту в контексте чата (TTL queryId ≈ 1 мин) |
| `telegram-inline-query-send` | Отправить результат инлайн-бота по queryId + id результата |
| `telegram-press-button` | Нажать callback-кнопку на сообщении по row/col или raw data |
| `telegram-get-message-buttons` | Перечислить кнопки reply-markup сообщения с индексами и типами |

## Обновления в реальном времени (polling)

Курсоры хранятся на стороне клиента — агент сохраняет `{pts, qts, date}` между вызовами и передаёт их обратно.

| Инструмент | Описание |
|------------|----------|
| `telegram-get-state` | Инициализировать курсор опроса (`pts`, `qts`, `date`, `seq`) |
| `telegram-get-updates` | Получить глобальные обновления по известному курсору (на `DifferenceTooLong` возвращает подсказку про history) |
| `telegram-get-channel-updates` | Получить обновления конкретного канала по его курсору |

## Истории (Stories)

| Инструмент | Описание |
|------------|----------|
| `telegram-get-all-stories` | Список историй по всем контактам с состоянием пагинации |
| `telegram-get-peer-stories` | Список историй одного пира |
| `telegram-get-stories-by-id` | Получить конкретные истории по id |
| `telegram-get-story-views` | Список просмотров ваших историй (для полной статистики нужен Premium) |

## Истории — запись (v1.30.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-send-story` | Опубликовать историю (фото или видео) с настройками приватности, сроком и флагами |
| `telegram-edit-story` | Редактировать историю: заменить медиа, обновить подпись или приватность |
| `telegram-delete-stories` | Удалить одну или несколько историй (необратимо; требует `confirm: true`) |
| `telegram-react-to-story` | Поставить реакцию на историю; `""` убирает реакцию |
| `telegram-export-story-link` | Получить ссылку `t.me/…` на публичную историю |
| `telegram-read-stories` | Отметить истории просмотренными до указанного ID |
| `telegram-toggle-story-pinned` | Закрепить/открепить истории в профиле |
| `telegram-toggle-story-pinned-to-top` | Прикрепить истории в верхнюю строку; `[]` очищает |
| `telegram-activate-stealth-mode` | Скрыть просмотры историй (требует Telegram Premium) |
| `telegram-get-stories-archive` | Получить архив истёкших историй с пагинацией |
| `telegram-report-story` | Пожаловаться на историю через многошаговый flow |

## Обсуждения (v1.30.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-get-discussion-message` | Получить инфо о группе обсуждений для поста канала с комментариями |
| `telegram-get-groups-for-discussion` | Список групп, подходящих для привязки как группу обсуждений |

## Статусы прочтения (v1.30.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-get-message-read-participants` | Кто прочитал сообщение в малой группе (≤100 чел., ≤7 дней) |
| `telegram-get-outbox-read-date` | Когда получатель прочитал ваше исходящее сообщение в личке |

## Профиль (запись, v1.32.0)

| Инструмент | Описание |
|------------|----------|
| `telegram-set-emoji-status` | Установить эмодзи-статус рядом с именем (Premium). Передать `documentId` или `collectibleId`; пропустить оба = очистить |
| `telegram-list-emoji-statuses` | Список доступных статусов: `default`, `recent`, `channel_default`, `collectible` |
| `telegram-clear-recent-emoji-statuses` | Очистить список «недавних» эмодзи-статусов |
| `telegram-set-profile-color` | Цвет имени или фона профиля (Premium для index ≥ 7). `forProfile=false` = имя в чатах, `true` = фон профиля |
| `telegram-set-birthday` | Дата рождения (`day`, `month`; `year` необязателен). `clear=true` = удалить |
| `telegram-set-personal-channel` | Добавить канал на профиль. `clear=true` = убрать |
| `telegram-set-profile-photo` | Загрузить аватар (JPEG/PNG или MP4, квадратное, ≤10с). `fallback=true` = запасной аватар |
| `telegram-delete-profile-photo` | Удалить фото профиля по ID. Возвращает `deleted` и `missing` |

## Telegram Business (v1.32.0)

Требуется подписка **Telegram Business**, кроме отмеченных.

| Инструмент | Описание |
|------------|----------|
| `telegram-get-business-chat-links` | Список Business chat links (без подписки тоже работает) |
| `telegram-create-business-chat-link` | Создать ссылку `t.me/m/...` с предзаполненным сообщением |
| `telegram-edit-business-chat-link` | Изменить ссылку по slug |
| `telegram-delete-business-chat-link` | Удалить ссылку по slug |
| `telegram-resolve-business-chat-link` | Узнать чей чат откроет ссылка и предзаполненное сообщение |
| `telegram-set-business-hours` | Часы работы: `timezone` + массив `{day, openFrom, openTo}` в HH:MM. `clear=true` = убрать |
| `telegram-set-business-location` | Адрес ± геоточка. `clear=true` = убрать |
| `telegram-set-business-greeting` | Авто-ответ для новых чатов. `shortcutId` (из `get-quick-replies`), `audience`, `noActivityDays` |
| `telegram-set-business-away` | Авто-ответ при офлайне. `schedule`: `always`/`outside_hours`/`custom`. `clear=true` = убрать |
| `telegram-set-business-intro` | Карточка-приветствие: `title` (≤32) + `description` (≤70) + опциональный стикер |

## Бусты

| Инструмент | Описание |
|------------|----------|
| `telegram-get-my-boosts` | Список бустов, выданных вашим аккаунтом |
| `telegram-get-boosts-status` | Статус бустов канала/супергруппы |
| `telegram-get-boosts-list` | Список бустеров канала (админ) |

## Opt-in (по env-флагам)

Регистрируются только при выставленном флаге окружения.

| Инструмент | Env-флаг |
|------------|----------|
| `telegram-get-group-call` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-group-call-participants` | `MCP_TELEGRAM_ENABLE_GROUP_CALLS=1` |
| `telegram-get-stars-status` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-stars-transactions` | `MCP_TELEGRAM_ENABLE_STARS=1` |
| `telegram-get-quick-replies` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |
| `telegram-get-quick-reply-messages` | `MCP_TELEGRAM_ENABLE_QUICK_REPLIES=1` |

---

::: tip
Запоминать инструменты не нужно. Просто опишите, что хотите, естественным языком — ваш ИИ-ассистент выберет нужный инструмент автоматически.
:::
