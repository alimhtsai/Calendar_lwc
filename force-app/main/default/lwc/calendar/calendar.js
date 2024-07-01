import { LightningElement, track, wire } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import FullCalendarJS from '@salesforce/resourceUrl/FullCalendarJS';
import createEvent from '@salesforce/apex/CalendarController.createEvent';
import fetchEvents from '@salesforce/apex/CalendarController.fetchEvents';
import deleteEvent from '@salesforce/apex/CalendarController.deleteEvent';
import updateEvent from '@salesforce/apex/CalendarController.updateEvent';

const DEFAULT_FORM = {
    title: "",
    start: "",
    end: "",
    weekday: "",
    hours: 0
};
const DEFAULT_LOCAL_TIME = {
    start: new Date(),
    end: new Date()
};
const DEFAULT_UTC_TIME = {
    start: new Date(),
    end: new Date()
};
const CONFIRM_REMOVAL = {
    message: 'Are you sure you want to delete this record?',
    variant: 'headerless',
    label: 'Delete Confirmation'
};
const TOAST_MESSAGE = {
    create: 'Your record is created!',
    update: 'Your record is updated!',
    delete: 'Your record is deleted!'
}; 
const TOAST_VARIANT = {
    success: 'success',
    error: 'error'
};
const TIMEZONE_OFFSET = (new Date()).getTimezoneOffset() * 60000;
const START_OF_THE_YEAR = new Date(new Date().getFullYear(), 0, 1);
const MILLISECONDS_PER_HOUR = 1000 * 60 * 60;
const MILLISECONDS_PER_YEAR = 1000 * 60 * 60 * 24;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', ];

export default class FullCalendarJs extends LightningElement {

    @track selectedEvent = DEFAULT_FORM;
    @track events = []; // all calendar events are stored in this field
    @track eventOriginalData = []; // to store the orignal wire object to use in refreshApex method
    localTime = DEFAULT_LOCAL_TIME;
    utcTime = DEFAULT_UTC_TIME;

    selectedId;
    eventRecord;
    fullCalendarJsInitialised = false;
    calendarLoaded = false;
    eventsRendered = false;
    openSpinner = false;
    openModal = false;

    /**
     * @description avoid race condition
     * If $ loads before fetchEvents returns data, no error will appear. Otherwise, if the wire gets done first, 
     * then $ is not defined and you'll get this error. This is known as a "race condition".
     * You'll want a separate method to wait for this.events to be set and $ to be available, 
     * then call that method from both places.
     * https://salesforce.stackexchange.com/questions/391810/fullcalendar-rendering-error-fullcalendar-is-not-a-function
     */
    renderCalendar() {
        if (!this.calendarLoaded || this.events.length === 0) {
            return;
        }
        this.initialiseFullCalendarJs();
    }

    @wire(fetchEvents)
    eventList(value) {

        console.log('start fecthing...');

        this.eventOriginalData = value; // to use in refresh cache
        const { data, error } = value;

        if (data) {

            this.events = [];

            // format as fullcalendar event object
            this.events = data.map(event => {
                return {
                    id: event.Id,
                    title: event.Name,
                    start: event.StartDateTime__c,
                    end: event.EndDateTime__c,
                    hours: event.Hours__c
                };
            });

            // render the calendar if data is ready
            if (!this.eventsRendered) {
                this.renderCalendar();
                this.eventsRendered = true;
            } else {
                // https://fullcalendar.io/docs/v3/renderEvents
                const ele = this.template.querySelector("div.fullcalendarjs");
                $(ele).fullCalendar('removeEvents');
                $(ele).fullCalendar('renderEvents', this.events, true);
            }

        } else if (error) {
            this.events = [];
            console.error('Error occured in fetching', error)
            this.showToast(error.message.body, this.TOAST_VARIANT.error);
        }
    }

    connectedCallback() {
        this.renderedCallback();
    }

    /**
     * @description Standard lifecyle method 'renderedCallback',
     *              Ensures that the page loads and renders the container before doing anything else
     */
    renderedCallback() {

        if (this.fullCalendarJsInitialised) {
            return;
        }

        // Promise.all is here from renderedCallback
        // executes all loadScript and loadStyle promises and only resolves them once all promises are done
        Promise.all([
            loadScript(this, FullCalendarJS + '/jquery.min.js'),
            loadScript(this, FullCalendarJS + '/moment.min.js'),
            loadScript(this, FullCalendarJS + '/fullcalendar.min.js'),
            loadStyle(this, FullCalendarJS + '/fullcalendar.min.css'),
            // loadStyle(this, FullCalendarJS + '/fullcalendar.print.min.css')
        ])
            .then(() => {
                // initialize the full calendar
                this.fullCalendarJsInitialised = true;
                this.calendarLoaded = true;

                // render the calendar if data is ready
                if (this.events.length > 0) {
                    this.renderCalendar();
                }
                this.initialiseFullCalendarJs();
            })
            .catch(error => {
                console.error('Error occured on FullCalendarJS', error);
            })
    }

    /**
     * @description Initialise the calendar configuration
     *              This is where we configure the available options for the calendar.
     *              This is also where we load the Events data.
     */
    initialiseFullCalendarJs() {

        const ele = this.template.querySelector('div.fullcalendarjs');

        var self = this;

        $(ele).fullCalendar({
            header: {
                left: 'prev, next today',
                center: 'title',
                right: 'month, agendaWeek, agendaDay'
            },
            navLinks: true,
            defaultDate: new Date(),
            navLinks: true,
            editable: true,
            selectable: true,
            weekNumbers: true,

            // ensure FullCalendar uses the local timezone: https://fullcalendar.io/docs/v3/timezone
            timezone: 'local',

            // to select the time period: https://fullcalendar.io/docs/v3/select-method
            select: function (startDate, endDate) {
                self.openForm(startDate, endDate);
            },

            eventLimit: true,
            events: this.events,
            timeFormat: 'h:mmt',

            // https://fullcalendar.io/docs/v3/eventClick
            eventClick: function (calEvent, jsEvent, view) {
                this.selectedEvent = calEvent;
                self.editEventClickHandler(calEvent);
            },

            // https://fullcalendar.io/docs/v3/eventDrop
            eventDrop: function (event, delta, revertFunc) {
                this.selectedEvent = event;
                self.dropEventHandler(event);
            },

            // https://fullcalendar.io/docs/v3/eventResize
            eventResize: function (event, delta, revertFunc) {
                this.selectedEvent = event;
                self.resizeEventHandler(event);
            },

            // https://fullcalendar.io/docs/v3/eventRender
            eventRender: function (event, element) {
                // remove event title from the rendered element
                element.find('.fc-title').remove();
            }
        });
    }

    saveEvent() {
        this.openSpinner = true;
        this.template.querySelectorAll('lightning-input').forEach(ele => {
            if (ele.name === 'start') {
                this.selectedEvent.start = new Date(ele.value).toISOString();
            }
            if (ele.name === 'end') {
                this.selectedEvent.end = new Date(ele.value).toISOString();
            }
        });

        this.convertUtcTime();
        this.calculateWorkingHours();
        this.createTitleBasedOnStartDate();

        // convert time zone for displaying on calendar
        const newUtcTimeEvent = {
            title: this.selectedEvent.title,
            start: this.utcTime.start.toISOString(),
            end: this.utcTime.end.toISOString(),
            hours: this.selectedEvent.hours
        };

        const newLocalTimeEvent = {
            title: this.selectedEvent.title,
            start: this.selectedEvent.start,
            end: this.selectedEvent.end,
            hours: this.selectedEvent.hours
        }

        createEvent({ 'event': JSON.stringify(newLocalTimeEvent) })
            .then(result => {
                newLocalTimeEvent.id = result;

                // add the new event to calendar on UI: https://fullcalendar.io/docs/v3/renderEvent
                const ele = this.template.querySelector("div.fullcalendarjs");
                $(ele).fullCalendar('renderEvent', newUtcTimeEvent, true);

                this.events.push(newLocalTimeEvent);
                this.selectedId = null;
                this.selectedEvent = DEFAULT_FORM;

                this.showToast(TOAST_MESSAGE.create, TOAST_VARIANT.success);
                this.openSpinner = false;
                this.openModal = false;
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on saveEvent', error);
                this.showToast(error.message.body, TOAST_VARIANT.error);
                this.openSpinner = false;
                this.openModal = false;
            })
    }

    removeEvent() {
        this.openSpinner = true;
        deleteEvent({ 'eventId': this.selectedId })
            .then(() => {
                const ele = this.template.querySelector("div.fullcalendarjs");

                // remove the event with id: https://fullcalendar.io/docs/v3/removeEvents
                $(ele).fullCalendar('removeEvents', [this.selectedId]);

                this.selectedId = null;
                this.selectedEvent = DEFAULT_FORM;

                this.showToast(TOAST_MESSAGE.delete, TOAST_VARIANT.success);
                this.openSpinner = false;
                this.openModal = false;
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on removeEvent', error);
                this.showToast(error.message.body, TOAST_VARIANT.error);
                this.openSpinner = false;
                this.openModal = false;
            });
    }

    editEvent() {
        this.openSpinner = true;
        this.convertUtcTime();
        this.calculateWorkingHours();

        updateEvent({ 'eventId': this.selectedId, 'event': JSON.stringify(this.selectedEvent) })
            .then(() => {
                const ele = this.template.querySelector("div.fullcalendarjs");

                // find the event object to update: https://fullcalendar.io/docs/v3/clientEvents
                const calendarEvent = $(ele).fullCalendar('clientEvents', this.selectedEvent.id)[0];
                calendarEvent.id = this.selectedEvent.id;
                calendarEvent.start = this.utcTime.start.toISOString();
                calendarEvent.end = this.utcTime.end.toISOString();
                calendarEvent.hours = this.selectedEvent.hours;

                // edit the event object with id: https://fullcalendar.io/docs/v3/updateEvent
                $(ele).fullCalendar('updateEvent', calendarEvent);

                this.selectedId = null;
                this.selectedEvent = DEFAULT_FORM;
                
                this.showToast(TOAST_MESSAGE.update, TOAST_VARIANT.success);
                this.openSpinner = false;
                this.openModal = false;
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on editEvent', error);
                this.showToast(error.message.body, TOAST_VARIANT.error);
                this.openSpinner = false;
                this.openModal = false;
            })
    }

    addEventHandler() {
        this.selectedEvent = DEFAULT_FORM;
        this.openModal = true;
    }

    removeEventHandler() {
        this.selectedId = this.selectedEvent.id;
        this.confirmRemoval();
    }

    cancelEventHandler() {
        this.openModal = false;
        this.selectedId = null;
        this.selectedEvent = DEFAULT_FORM;
    }

    saveEventHandler(event) {
        event.preventDefault();
        if (this.selectedId) {
            this.editEvent();
        } else {
            this.saveEvent();
        }
    }

    changeHandler(event) {
        const { name, value } = event.target;
        this.selectedEvent = { ...this.selectedEvent, [name]: value };
        this.calculateWorkingHours();
    }

    editEventClickHandler(event) {
        this.selectedId = event.id;
        this.findEventRecord();
        this.openModal = true;
        this.handleTimeOffset(this.eventRecord);
    }

    dropEventHandler(event) {
        this.selectedId = event.id;
        this.findEventRecord();
        this.openModal = true;
        this.handleTimeOffset(event);
    }

    resizeEventHandler(event) {
        this.selectedId = event.id;
        this.findEventRecord();
        this.openModal = true;
        this.handleTimeOffset(event);
    }

    findEventRecord() {
        this.eventRecord = this.events.find(item => item.id === this.selectedId);
        this.selectedEvent.id = this.eventRecord.id;
    }

    handleTimeOffset(event) {
        this.convertLocalTime(event);
        this.selectedEvent.start = this.localTime.start.toISOString();
        this.selectedEvent.end = this.localTime.end.toISOString();
        this.createTitleBasedOnStartDate();
        this.calculateWorkingHours();
    }

    async confirmRemoval() {
        const { message, variant, label } = CONFIRM_REMOVAL;
        const confirmRemovalResult = await LightningConfirm.open({
            message: message,
            variant: variant,
            label: label
        });
        if (confirmRemovalResult) {
            this.removeEvent();
        }
    }

    openForm(startDate, endDate) {
        const event = {
            start: startDate,
            end: endDate
        };
        this.convertLocalTime(event);
        this.selectedEvent.start = this.localTime.start.toISOString();
        this.selectedEvent.end = this.localTime.end.toISOString();
        this.calculateWorkingHours();
        this.openModal = true;
    }

    showToast(message, variant) {
        const toast = this.template.querySelector('c-notification');
        if (toast) {
            toast.showToast(message, variant);
        };
    }

    refresh() {
        return refreshApex(this.eventOriginalData);
    }

    get ModalName() {
        return this.selectedId ? "Update Hours" : "Add Hours";
    }

    calculateWorkingHours() {
        let startDate = new Date(this.selectedEvent.start);
        let endDate = new Date(this.selectedEvent.end);
        let hours = (endDate - startDate) / MILLISECONDS_PER_HOUR;
        this.selectedEvent.hours = hours.toFixed(2); // Update the hours with two decimal places
    }

    createTitleBasedOnStartDate() {
        this.selectedEvent.title = new Date(this.selectedEvent.start).toISOString().split('T')[0];
        this.selectedEvent.weekday = this.getWeekdayName(new Date(this.selectedEvent.title));
    }

    getWeekdayName(date) {
        return WEEKDAYS[date.getDay()];
    }

    getWeekNumber(date) {
        let pastDaysOfYear = ((date - START_OF_THE_YEAR) / MILLISECONDS_PER_YEAR) + 1;
        return Math.ceil(pastDaysOfYear / WEEKDAYS.length);
    }

    convertUtcTime() {
        this.utcTime.start = new Date(new Date(this.selectedEvent.start).getTime() + TIMEZONE_OFFSET);
        this.utcTime.end = new Date(new Date(this.selectedEvent.end).getTime() + TIMEZONE_OFFSET);
    }

    convertLocalTime(event) {
        this.localTime.start = new Date(new Date(event.start) - TIMEZONE_OFFSET);
        this.localTime.end = new Date(new Date(event.end) - TIMEZONE_OFFSET);
    }

    get groupedEventsBasedOnWeekNumber() {

        let groupedEvents = {};

        this.events.forEach(event => {
            let { title, hours } = event;
            let date = new Date(title);
            let weekNumber = this.getWeekNumber(date);
            let weekday = this.getWeekdayName(date);

            // initialize week number group if not exists
            if (!groupedEvents[weekNumber]) {
                groupedEvents[weekNumber] = { 
                    weekNumber, 
                    weeks: [], 
                    weeklyTotalHours: 0 
                };
            }

            // find or create week group within week
            let weekGroup = groupedEvents[weekNumber].weeks.find(group => group.title === title);
            if (!weekGroup) {
                weekGroup = { 
                    title, 
                    weekday,
                    events: [], 
                    dailyTotalHours: 0, 
                };
                groupedEvents[weekNumber].weeks.push(weekGroup);
            }

            // add event to week group
            weekGroup.events.push(event);
            weekGroup.dailyTotalHours += hours;
            groupedEvents[weekNumber].weeklyTotalHours += hours;
        });

        // sort each week's title groups by title
        for (let weekNumber in groupedEvents) {
            groupedEvents[weekNumber].weeks.sort((a, b) => a.title.localeCompare(b.title));
        }

        const groupedEventsArray = Object.values(groupedEvents).sort((a, b) => a.weekNumber - b.weekNumber);
        return groupedEventsArray;
    }
}