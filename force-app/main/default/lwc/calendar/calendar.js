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
const timezoneOffset = (new Date()).getTimezoneOffset() * 60000;

export default class FullCalendarJs extends LightningElement {

    @track curEvent = DEFAULT_FORM;
    @track localTime = DEFAULT_LOCAL_TIME;
    @track utcTime = DEFAULT_UTC_TIME;

    @track events = []; // all calendar events are stored in this field
    eventOriginalData = []; // to store the orignal wire object to use in refreshApex method

    selectedId;
    fullCalendarJsInitialised = false;
    calendarLoaded = false
    eventsRendered = false;
    openSpinner = false;
    openModal = false

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
        // load jQuery
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

            console.log('Finish fetching!');

        } else if (error) {
            this.events = [];
            console.error('Error occured in fetching', error)
            this.showToast(error.message.body, 'error');
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
        // const modal = this.template.querySelector('div.modalclass');

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
                this.curEvent = calEvent;
                self.editEventClickHandler(calEvent);
            },

            // https://fullcalendar.io/docs/v3/eventDrop
            eventDrop: function (event, delta, revertFunc) {
                this.curEvent = event;
                self.dropEventHandler(event);
            },

            // https://fullcalendar.io/docs/v3/eventResize
            eventResize: function (event, delta, revertFunc) {
                this.curEvent = event;
                self.resizeEventHandler(event);
            },

            // https://fullcalendar.io/docs/v3/eventRender
            eventRender: function (event, element) {
                // Remove event title from the rendered element
                element.find('.fc-title').remove();
            }
        });
    }

    saveEvent() {
        this.openSpinner = true;
        this.template.querySelectorAll('lightning-input').forEach(ele => {
            if (ele.name === 'start') {
                this.curEvent.start = new Date(ele.value).toISOString();
            }
            if (ele.name === 'end') {
                this.curEvent.end = new Date(ele.value).toISOString();
            }
        });

        // convert time zone for displaying on calendar
        this.convertUtcTime();
        this.calculateWorkingHours();
        this.createTitleBasedOnStartDate();

        let newUtcTimeEvent = {
            title: this.curEvent.title,
            start: this.utcTime.start.toISOString(),
            end: this.utcTime.end.toISOString(),
            hours: this.curEvent.hours
        };

        // for saving back to server
        let newLocalTimeEvent = {
            title: this.curEvent.title,
            start: this.curEvent.start,
            end: this.curEvent.end,
            hours: this.curEvent.hours
        }

        console.log('newUtcTimeEvent.start: ', JSON.stringify(newUtcTimeEvent.start));
        console.log('newLocalTimeEvent.start: ', JSON.stringify(newLocalTimeEvent.start));

        this.openModal = false;

        createEvent({ 'event': JSON.stringify(newLocalTimeEvent) })
            .then(result => {
                newLocalTimeEvent.id = result;

                // add the new event to calendar on UI: https://fullcalendar.io/docs/v3/renderEvent
                const ele = this.template.querySelector("div.fullcalendarjs");
                $(ele).fullCalendar('renderEvent', newUtcTimeEvent, true);

                // to display on UI with id from server
                this.events.push(newLocalTimeEvent);

                this.openSpinner = false;
                this.showToast('Your event is created!', 'success');
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on saveEvent', error);
                this.openSpinner = false;
                this.showToast(error.message.body, 'error');
            })
    }

    /**
    * @description: remove the event with id
    * @documentation: https://fullcalendar.io/docs/v3/removeEvents
    */
    removeEvent() {
        this.openSpinner = true;
        deleteEvent({ 'eventId': this.selectedId })
            .then(() => {
                const ele = this.template.querySelector("div.fullcalendarjs");
                $(ele).fullCalendar('removeEvents', [this.selectedId]);

                this.selectedId = null;
                this.openModal = false;
                this.curEvent = DEFAULT_FORM;

                this.showToast('Your event is deleted!', 'success');
                this.openSpinner = false;
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on removeEvent', error);
                this.showToast(error.message.body, 'error');
                this.openSpinner = false;
                this.openModal = false;
            });
    }

    /**
    * @description: edit the event with id
    * @documentation: https://fullcalendar.io/docs/v3/updateEvent
    */
    editEvent() {
        this.openSpinner = true;
        this.convertUtcTime();
        this.calculateWorkingHours();

        updateEvent({ 'eventId': this.selectedId, 'event': JSON.stringify(this.curEvent) })
            .then(() => {
                const ele = this.template.querySelector("div.fullcalendarjs");

                // find the event to update: https://fullcalendar.io/docs/v3/clientEvents
                let calendarEvent = $(ele).fullCalendar('clientEvents', this.curEvent.id)[0];
                calendarEvent.id = this.curEvent.id;
                calendarEvent.start = this.utcTime.start.toISOString();
                calendarEvent.end = this.utcTime.end.toISOString();
                calendarEvent.hours = this.curEvent.hours;

                // update the event in the calendar
                $(ele).fullCalendar('updateEvent', calendarEvent);

                this.selectedId = null;
                this.openModal = false;
                this.curEvent = DEFAULT_FORM;

                this.showToast('Your event is updated!', 'success');
                this.openSpinner = false;
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on editEvent', error);
                this.showToast(error.message.body, 'error');
                this.openSpinner = false;
            })
    }

    cancelEventHandler() {
        this.openModal = false;
        this.selectedId = null;
        this.curEvent = DEFAULT_FORM;
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
        this.curEvent = { ...this.curEvent, [name]: value };
        this.calculateWorkingHours();
        console.log('this.curEvent: ', JSON.stringify(this.curEvent));
    }

    editEventHandler(event) {
        this.selectedId = event.target.dataset.recordid;
        const eventRecord = this.events.find(item => item.id === this.selectedId);
        this.curEvent.id = eventRecord.id;
        this.openModal = true;
        this.handleTimeOffset(eventRecord);
    }

    editEventClickHandler(event) {
        this.selectedId = event.id;
        const eventRecord = this.events.find(item => item.id === this.selectedId);
        this.curEvent.id = eventRecord.id;
        this.openModal = true;
        this.handleTimeOffset(eventRecord);
    }

    dropEventHandler(event) {
        this.selectedId = event.id;
        const eventRecord = this.events.find(item => item.id === this.selectedId);
        this.curEvent.id = eventRecord.id;
        this.openModal = true;
        this.handleTimeOffset(event);
    }

    resizeEventHandler(event) {
        this.selectedId = event.id;
        const eventRecord = this.events.find(item => item.id === this.selectedId);
        this.curEvent.id = eventRecord.id;
        this.openModal = true;
        this.handleTimeOffset(event);
    }

    handleTimeOffset(event) {
        this.convertLocalTime(event);
        this.curEvent.start = this.localTime.start.toISOString();
        this.curEvent.end = this.localTime.end.toISOString();
        this.createTitleBasedOnStartDate();
        this.calculateWorkingHours();
    }

    addEventHandler() {
        this.openModal = true;
        this.curEvent = DEFAULT_FORM;
        this.localTime = DEFAULT_LOCAL_TIME;
        this.utcTime = DEFAULT_UTC_TIME;
    }

    removeEventHandler() {
        this.selectedId = this.curEvent.id;
        console.log('selectedId: ', this.selectedId);
        this.confirmRemoval();
    }

    async confirmRemoval() {
        const result = await LightningConfirm.open({
            message: 'Are you sure you want to delete this event?',
            variant: 'headerless',
            label: 'Delete Confirmation'
        });
        if (result) {
            this.removeEvent();
        }
    }

    openForm(startDate, endDate) {
        let event = {
            start: startDate,
            end: endDate
        };
        this.convertLocalTime(event);
        this.curEvent.start = this.localTime.start.toISOString();
        this.curEvent.end = this.localTime.end.toISOString();
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
        return this.selectedId ? "Update Event" : "Add Event";
    }

    calculateWorkingHours() {
        const startDate = new Date(this.curEvent.start);
        const endDate = new Date(this.curEvent.end);
        const millisecondsPerHour = 1000 * 60 * 60;
        const hours = (endDate - startDate) / millisecondsPerHour;
        this.curEvent.hours = hours.toFixed(2); // Update the hours with two decimal places
    }

    createTitleBasedOnStartDate() {
        this.curEvent.title = new Date(this.curEvent.start).toISOString().split('T')[0];
        this.curEvent.weekday = this.getWeekdayName(new Date(this.curEvent.title));
        console.log('this.curEvent.weekday: ', this.curEvent.weekday);
    }

    getWeekdayName(date) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', ];
        return days[date.getDay()];
    }

    convertUtcTime() {
        this.utcTime.start = new Date(new Date(this.curEvent.start).getTime() + timezoneOffset);
        this.utcTime.end = new Date(new Date(this.curEvent.end).getTime() + timezoneOffset);
    }

    convertLocalTime(event) {
        this.localTime.start = new Date(new Date(event.start) - timezoneOffset);
        this.localTime.end = new Date(new Date(event.end) - timezoneOffset);
    }

    getWeekNumber(date) {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - startOfYear) / 86400000 + 1;
        return Math.ceil(pastDaysOfYear / 7);
    }

    get groupedEvents() {
        console.log('Calculating grouped events...');
        const grouped = this.events.reduce((acc, event) => {
            const { title, hours } = event;
            const date = new Date(title);
            const weekNumber = this.getWeekNumber(date);
            const weekday = this.getWeekdayName(new Date(title));

            // Initialize week group if not exists
            if (!acc[weekNumber]) {
                acc[weekNumber] = { weekNumber, weeks: [], weeklyTotalHours: 0 };
            }

            // Find or create title group within week
            let weekGroup = acc[weekNumber].weeks.find(group => group.title === title);
            if (!weekGroup) {
                weekGroup = { title, events: [], dailyTotalHours: 0, weekday };
                acc[weekNumber].weeks.push(weekGroup);
            }

            // Add event to title group
            weekGroup.events.push(event);
            weekGroup.dailyTotalHours += hours;
            acc[weekNumber].weeklyTotalHours += hours;
            return acc;
        }, {});

        // Sort each week's title groups by title
        for (let weekNumber in grouped) {
            grouped[weekNumber].weeks.sort((a, b) => a.title.localeCompare(b.title));
        }

        const groupedArray = Object.values(grouped).sort((a, b) => a.weekNumber - b.weekNumber);
        console.log('Grouped events:', JSON.stringify(groupedArray));
        return groupedArray;
    }
}