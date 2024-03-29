import { CalendarEvent } from './types/CalendarEvent';

declare const Calendar: any;
export default class BatchApp {
    public now = new Date();
    public last_completed_at: Date;
    public interval: number;
    private functionName: string;
    constructor(functionName: string, interval?: number) {
        this.functionName = functionName;
        this.interval = interval ? interval : 5;
        const COMPLETED_AT = PropertiesService.getScriptProperties().getProperty('BATCH_COMPLETED_AT') as string;
        this.last_completed_at = COMPLETED_AT && typeof (COMPLETED_AT) === 'string' ? new Date(COMPLETED_AT) : new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate(), this.now.getHours(), this.now.getMinutes() - this.interval);
    }

    public start() {
        this.now = new Date();
    }

    public on<T>(callback: (from: Date, to: Date) => any, option?: T) {
        return callback(this.last_completed_at, this.now);
    }

    public onGmailReceived<T>(search: string, callback: (latestMessage: GoogleAppsScript.Gmail.GmailMessage, option?: T) => any, option?: T) {
        const after = this.last_completed_at.valueOf() / 1000

        const Threads = GmailApp.search(`${search} after:${after}`);
        const rets = Threads.map(Thread => {
            const Messages = Thread.getMessages();
            return Messages.map(Message => {
                if (this.last_completed_at < Message.getDate()) {
                    return callback(Message, option);
                }
            })
        });
        return rets;
    }

    public onCalendarModified<T>(calendarId: string, callback: (CalendarEvents: CalendarEvent, option?: T) => any, option?: T) {
        let pageToken;
        let res: any;
        let Events: CalendarEvent[];
        do {
            try {
                res = Calendar.Events.list(calendarId, {
                    syncToken: PropertiesService.getUserProperties().getProperty('CALENDAR_SYNC_TOKEN'),
                    maxResults: 100
                }) as { items: CalendarEvent[], nextPageToken?: string, nextSyncToken: string }
            } catch (error) {
                if (error.message === 'Sync token is no longer valid, a full sync is required.') {
                    PropertiesService.getUserProperties().deleteProperty('CALENDAR_SYNC_TOKEN');
                    return;
                } else {
                    throw new Error(error.message);
                }
            }
            if (res.items && res.items.length > 0) {
                // 1 - Events found
                Events = [Events, ...res.items];
            } else {
                // 2 - No events found
            }
            pageToken = res.nextPageToken;
        } while (pageToken);
        PropertiesService.getUserProperties().setProperty('CALENDAR_SYNC_TOKEN', res.nextSyncToken);

        return Events.map(event => {
            return callback(event, option);
        })
    }
    public end() {
        try {
            this.stop();
        } catch (error) {
            console.info('No trigger is matched so any trigger is not deleted');
        }
        this.createNextTrigger();

        // Update time that batch completed
        PropertiesService.getScriptProperties().setProperty('BATCH_COMPLETED_AT', this.now.toISOString());
    }

    public stop() {
        const isSuccess = this.deleteCurrentTrigger();
        if (isSuccess) {
            return true;
        } else {
            throw 'No trigger is matched'
        }
    }

    public createNextTrigger() {
        const newTriggerId = ScriptApp.newTrigger(this.functionName).timeBased().after(this.interval * 60 * 1000).create().getUniqueId();
        PropertiesService.getUserProperties().setProperty('TRIGGER_ID',newTriggerId);
        return newTriggerId;
    }
    public deleteCurrentTrigger() {
        return ScriptApp.getProjectTriggers().some(trigger => {
            const triggerId = trigger.getUniqueId();
            if (triggerId === PropertiesService.getUserProperties().getProperty('TRIGGER_ID')) {
                // console.log(`[DELETE TRIGGER] - ${triggerId}`);
                ScriptApp.deleteTrigger(trigger);
                return true;
            }
        });
    }
}
