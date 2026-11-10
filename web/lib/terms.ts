import { siteConfig } from "@/site-config";
import { PLANS, TRIAL_DAYS } from "./subscription";

/** Texts the bot must answer with (Telegram rules for selling digital goods: /terms, /paysupport). */
export const TERMS_TEXT = [
  "<b>Условия подписки Deal Radar</b>",
  "",
  `• Новый пользователь получает ${TRIAL_DAYS} дня полного доступа бесплатно.`,
  `• Месяц — ${PLANS.month.stars} ⭐, продлевается автоматически каждые 30 дней. Отменить продление можно в любой момент в профиле Deal Radar или в настройках Telegram; доступ сохраняется до конца оплаченного периода.`,
  `• Год — ${PLANS.year.stars} ⭐ одним платежом за 365 дней, без автопродления.`,
  "• Оплата — только в Telegram Stars через Telegram.",
  "• Deal Radar показывает объявления Marktplaats и оценку их рыночной стоимости по независимым источникам. Это информация, а не гарантия прибыли: цены объявлений — цены предложений, а не завершённых сделок. Проверяйте товар и продавца перед покупкой.",
  "• Если сервис не работал по нашей вине или оплата прошла по ошибке, напишите /paysupport — разберём и при необходимости вернём Stars.",
  "",
  "Оплачивая подписку, вы подтверждаете, что прочитали эти условия.",
].join("\n");

export const PAYSUPPORT_TEXT = [
  "<b>Поддержка по оплате</b>",
  "",
  "Опишите проблему ответным сообщением или напишите напрямую:",
  siteConfig.contactEmail ? "• E-mail: " + siteConfig.contactEmail : "",
  siteConfig.telegramLabel ? "• Telegram: " + siteConfig.telegramLabel : "",
  "",
  "Укажите дату оплаты и тариф. Отвечаем в течение 2 рабочих дней.",
].filter((line, index, all) => line || all[index - 1]).join("\n");
