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

## Реакции

| Инструмент | Описание |
|------------|----------|
| `telegram-send-reaction` | Поставить реакцию на сообщение |
| `telegram-get-reactions` | Получить реакции на сообщение |
| `telegram-set-default-reaction` | Задать реакцию по умолчанию для вашего аккаунта |
| `telegram-get-top-reactions` | Топовые (популярные) эмодзи-реакции Telegram |
| `telegram-get-recent-reactions` | Ваши недавно использованные реакции |

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

## Бусты и Business

| Инструмент | Описание |
|------------|----------|
| `telegram-get-my-boosts` | Список бустов, выданных вашим аккаунтом |
| `telegram-get-boosts-status` | Статус бустов канала/супергруппы |
| `telegram-get-boosts-list` | Список бустеров канала (админ) |
| `telegram-get-business-chat-links` | Список ваших Business chat links |

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
