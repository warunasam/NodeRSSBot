import {
    getSubscribersByFeedId,
    deleteSubscribersByUserId
} from '../proxies/subscribes';
import logger from './logger';
import sanitize from './sanitize';
import unsanitize from './unsanitize';
import { config } from '../config';
import Telegraf, { ContextMessageUpdate } from 'telegraf';
import { Feed, FeedItem } from '../types/feed';
import { getUserById, migrateUser } from '../proxies/users';
import { isNone } from '../types/option';

/**
 * handle send error log or delete user or migrate user
 * @param e the error that handle
 * @param userId user_id that this error occur
 * @return whether to send again
 */
async function handlerSendError(e: any, userId: number): Promise<boolean> {
    // bot was blocked or chat is deleted
    logger.error(e.description);
    const re = new RegExp(
        'chat not found|bot was blocked by the user|bot was kicked'
    );
    if (config.delete_on_err_send && re.test(e.description)) {
        logger.error(`delete all subscribes for user ${userId}`);
        deleteSubscribersByUserId(userId);
    }
    if (
        e.description ===
        'Bad Request: group chat was upgraded to a supergroup chat'
    ) {
        const from = userId;
        const to = e.parameters.migrate_to_chat_id;
        const user = await getUserById(to);
        if (isNone(user)) {
            await migrateUser(from, to);
            return true;
        } else {
            deleteSubscribersByUserId(from);
        }
    }
    return false;
}

const send = async (
    bot: Telegraf<ContextMessageUpdate>,
    toSend: NonNullable<string | FeedItem[]>,
    feed: Feed
) => {
    const subscribers = await getSubscribersByFeedId(feed.feed_id);
    if (typeof toSend === 'string') {
        subscribers.map(async (subscribe) => {
            const userId = subscribe.user_id;
            try {
                await bot.telegram.sendMessage(userId, toSend, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
            } catch (e) {
                handlerSendError(e, userId);
            }
        });
    } else {
        subscribers.map(async (subscribe) => {
            const userId = subscribe.user_id;
            let text = '';
            if (toSend.length <= 5) {
                for (let i = 0; i < toSend.length; i++) {
                    text = `<b>${unsanitize(toSend[i].title)}</b>\n\n${unsanitize(toSend[i].content)}`;

                    try {
                        await bot.telegram.sendMessage(userId, text, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                    } catch (e) {
                        const resend = handlerSendError(e, userId);
                        if (resend && e.parameters?.migrate_to_chat_id) {
                            await bot.telegram.sendMessage(
                                e.parameters.migrate_to_chat_id,
                                text,
                                {
                                    parse_mode: 'HTML',
                                    disable_web_page_preview: true
                                }
                            );
                        }
                    }
                }
            }
            else{
                text = `<b>${sanitize(feed.feed_title)}</b>`;
                toSend.forEach(function (item) {
                    text += `\n<a href="${item.link.trim()}">${sanitize(
                        item.title
                    )}</a>`;
                });

                try {
                    await bot.telegram.sendMessage(userId, text, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    });
                } catch (e) {
                    const resend = handlerSendError(e, userId);
                    if (resend && e.parameters?.migrate_to_chat_id) {
                        await bot.telegram.sendMessage(
                            e.parameters.migrate_to_chat_id,
                            text,
                            {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true
                            }
                        );
                    }
                }
            }
        });
    }
};

export default send;
