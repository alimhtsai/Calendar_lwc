import { LightningElement, track, wire } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import FullCalendarJS from '@salesforce/resourceUrl/FullCalendarJS';
import createEvent from '@salesforce/apex/CalendarController.createEvent';
import fetchEvents from '@salesforce/apex/CalendarController.fetchEvents';
import deleteEvent from '@salesforce/apex/CalendarController.deleteEvent';
import updateEvent from '@salesforce/apex/CalendarController.updateEvent';

const DEFAULT_EVENT_FORM = {
    title: "",
    start: "",
    end: ""
}

const tzoffset = (new Date()).getTimezoneOffset() * 60000;

/**
 * FullCalendarJs
 * @description Full Calendar JS - Lightning Web Components
 */
export default class FullCalendarJs extends LightningElement {

    // fields to store the event data
    curEvent = DEFAULT_EVENT_FORM;
    title;
    startDate;
    endDate;

    selectedRecordId; // selected event id

    fullCalendarJsInitialised = false; // to avoid the recursion from renderedcallback
    calendarLoaded = false; // check whether calendar is loaded completely
    eventsRendered = false; // to render initial events only once
    openSpinner = false; // to open the spinner in waiting screens
    openModal = false; // to open form

    @track
    events = []; // all calendar events are stored in this field

    eventOriginalData = []; // to store the orignal wire object to use in refreshApex method

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

    /**
     * @description fetch data from server
     */
    @wire(fetchEvents)
    eventList(value) {

        console.log('start fecthing...');

        this.eventOriginalData = value; // to use in refresh cache
        const { data, error } = value;

        if (data) {
            // format as fullcalendar event object
            this.events = data.map(event => {
                return {
                    id: event.Id,
                    title: event.Name,
                    start: event.StartDateTime__c,
                    end: event.EndDateTime__c
                };
            });

            // render the calendar if data is ready
            if (!this.eventsRendered) {
                this.renderCalendar();
            }

            console.log('Finish fetching!');

            // load only on first wire call
            // if events are not rendered, try to remove this 'if' condition and add directly 
            // documentation: https://fullcalendar.io/docs/v3/renderEvents

            // // add events to calendar
            // if (!this.eventsRendered || !this.calendarLoaded) {
            //     this.renderCalendar();
            //     console.log('this.eventsRendered before: ', this.eventsRendered);
            // } else {
            //     const ele = this.template.querySelector("div.fullcalendarjs");
            //     $(ele).fullCalendar('renderEvents', JSON.stringify(this.events), true);
            //     this.eventsRendered = true;
            //     console.log('this.eventsRendered after: ', this.eventsRendered);
            // }

        } else if (error) {
            this.events = [];
            // this.error = 'No events are found';
            console.error('Error occured in fetching', error)
            this.showToast(error.message.body, 'error');
        }
    }

    /**
     * @description Standard lifecyle method 'renderedCallback',
     *              Ensures that the page loads and renders the container before doing anything else
     */
    renderedCallback() {

        // performs this operation only on first render
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
        
        console.log('this.calendarLoaded in renderedCallback: ', this.calendarLoaded);
    }

    /**
     * @description Initialise the calendar configuration
     *              This is where we configure the available options for the calendar.
     *              This is also where we load the Events data.
     */
    initialiseFullCalendarJs() {

        // // Ensure jQuery is loaded
        // if (typeof $ !== 'function') {
        //     console.error('jQuery is not loaded');
        //     return;
        // }

        const ele = this.template.querySelector('div.fullcalendarjs');
        const modal = this.template.querySelector('div.modalclass');

        var self = this;

        $(ele).fullCalendar({
            header: {
                left: 'prev, next today',
                center: 'title',
                right: 'month, agendaWeek, basicDay'
            },
            navLinks: true,
            defaultDate: new Date(), // default day is today
            navLinks: true,
            editable: true,
            selectable: true,
            dragScroll: false,
            weekNumbers: true,

            // ensure FullCalendar uses the local timezone: https://fullcalendar.io/docs/v3/timezone
            timezone: 'local',

            // to select the time period: https://fullcalendar.io/docs/v3/select-method
            select: function (startDate, endDate) {
                self.openActivityForm(startDate, endDate);
            },

            eventLimit: true,
            events: this.events, // all the events that are to be rendered - can be a duplicate statement here
            timeFormat: 'h:mmt',

            // https://fullcalendar.io/docs/v3/eventClick
            eventClick: function(calEvent, jsEvent, view) {
                this.curEvent = calEvent;
                self.editEventClickHandler(calEvent);
            }
        });
    }

    // to open the form with predefined fields
    openActivityForm(stDate, edDate) {        
        let localStartDate = new Date(new Date(stDate) - tzoffset);
        let localEndDate = new Date(new Date(edDate) - tzoffset);
        
        this.curEvent = {
            start: localStartDate.toISOString(),
            end: localEndDate.toISOString()
        }
        this.openModal = true;
    }

    /**
     * @description Save a new event
     * @param {*} event 
     */
    saveEvent() {
        let events = this.events;
        this.openSpinner = true;

        // get all the field values - as of now they all are mandatory to create a standard event
        this.template.querySelectorAll('lightning-input').forEach(ele => {
            if (ele.name === 'title') {
                this.title = ele.value;
            }
            if (ele.name === 'start') {
                this.startDate = new Date(ele.value);
                console.log('this.startDate: ', JSON.stringify(this.startDate));
            }
            if (ele.name === 'end') {
                this.endDate = new Date(ele.value);
            }
        });

        // getTimezoneOffset() returns the difference in minutes
        let utcStartDate = new Date(this.startDate.getTime() + (this.startDate.getTimezoneOffset() * 60000));
        let utcEndDate = new Date(this.endDate.getTime() + (this.endDate.getTimezoneOffset() * 60000));
        console.log('utcStartDate: ', utcStartDate);

        // format as per fullcalendar event object to create and render
        let newevent = {
            title: this.title,
            start: this.startDate,
            end: this.endDate
        };

        this.openModal = false;

        // server call to create the event
        createEvent({ 'event': JSON.stringify(newevent) })
            .then(result => {
                const ele = this.template.querySelector("div.fullcalendarjs");

                // to populate the event on fullcalendar object
                // id should be unique and useful to remove the event from UI - calendar
                newevent.id = result;

                // renderEvent is a fullcalendar method to add the event to calendar on UI
                // documentation: https://fullcalendar.io/docs/v3/renderEvent
                $(ele).fullCalendar('renderEvent', newevent, true);

                // to display on UI with id from server
                this.events.push(newevent);

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
    *  @description open the modal by nullifying the inputs
    */
    addEventHandler() {
        this.openModal = true;
        this.startDate = null;
        this.endDate = null;
        this.title = null;
    }

    /**
     * @description handle removal event
     */
    removeEventHandler(event) {
        this.selectedRecordId = event.target.dataset.recordid;
        console.log('selectedRecordId: ', this.selectedRecordId);
        this.handleConfirm();
    }

    /**
     * @description confirm of a removal event
     */
    async handleConfirm() {
        const result = await LightningConfirm.open({
            message: 'Are you sure you want to delete this event?',
            variant: 'headerless',
            label: 'Delete Confirmation'
        });
        if (result) {
            this.removeEvent();
        }
    }

    /**
    * @description: remove the event with id
    * @documentation: https://fullcalendar.io/docs/v3/removeEvents
    */
    removeEvent(event) {
        this.openSpinner = true;

        // delete the event from server and then remove from UI
        deleteEvent({ 'eventId': this.selectedRecordId })
            .then((result) => {
                const ele = this.template.querySelector("div.fullcalendarjs");
                $(ele).fullCalendar('removeEvents', [this.selectedRecordId]);

                this.showToast('Your event is deleted!', 'success');
                this.openSpinner = false;
                this.selectedRecordId = null;

                // refresh the grid
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on removeEvent', error);
                this.showToast(error.message.body, 'error');
                this.openSpinner = false;
            });
    }

    editEventHandler(event) {
        this.selectedRecordId = event.target.dataset.recordid;
        const eventRecord = this.events.find(item => item.id === this.selectedRecordId);
        this.handleTimeOffset(eventRecord);
    }

    editEventClickHandler(event) {
        this.selectedRecordId = event.id;
        const eventRecord = this.events.find(item => item.id === this.selectedRecordId);
        this.handleTimeOffset(eventRecord);
    }

    handleTimeOffset(eventRecord) {
        let localStartDate = new Date(new Date(eventRecord.start) - tzoffset);
        let localEndDate = new Date(new Date(eventRecord.end) - tzoffset);
        
        this.curEvent = {
            id: eventRecord.id,
            title: eventRecord.title,
            start: localStartDate.toISOString(),
            end: localEndDate.toISOString()
        }
        this.openModal = true;
    }

    /**
    * @description: edit the event with id
    * @documentation: https://fullcalendar.io/docs/v3/updateEvent
    */
    editEvent(eventId) {
        this.openSpinner = true;

        updateEvent({ 'eventId': this.selectedRecordId, 'event': JSON.stringify(this.curEvent) })
            .then((result) => {
                const ele = this.template.querySelector("div.fullcalendarjs");

                // find the event to update
                // documentation: https://fullcalendar.io/docs/v3/clientEvents
                let calendarEvent = $(ele).fullCalendar('clientEvents', this.curEvent.id)[0];

                // update the event properties
                if (calendarEvent) {
                    calendarEvent.id = this.curEvent.id;
                    calendarEvent.title = this.curEvent.title;
                    calendarEvent.start = this.curEvent.start;
                    calendarEvent.end = this.curEvent.end;

                    // update the event in the calendar
                    $(ele).fullCalendar('updateEvent', calendarEvent);

                    // $(ele).fullCalendar('renderEvent', calendarEvent);
                    // console.log('render event: ', JSON.stringify(calendarEvent));
                }

                // Update the local properties
                this.title = this.curEvent.title;
                this.startDate = this.curEvent.start;
                this.endDate = this.curEvent.end;

                // reset selected record ID and close modal
                this.selectedRecordId = null;
                this.openModal = false;
                this.curEvent = DEFAULT_EVENT_FORM;

                // show success toast
                this.showToast('Your event is updated!', 'success');

                this.openSpinner = false;

                // refresh the grid
                this.refresh();
            })
            .catch(error => {
                console.error('Error occured on editEvent', error);
                this.showToast(error.message.body, 'error');
                this.openSpinner = false;
            })
    }

    /**
     * @description handle actions when users click the "Cancel" button
     */
    handleCancel() {
        this.openModal = false;
        this.selectedRecordId = null;
        this.curEvent = DEFAULT_EVENT_FORM;
    }

    /**
     * @description handle actions when users click the "Save" button
     * @param {*} event 
     */
    handleSave(event) {
        event.preventDefault();
        if (this.selectedRecordId) {
            this.editEvent(this.selectedRecordId);
        } else {
            this.saveEvent();
        }
    }

    /**
     * @description handle changes when users modify the form
     * @param {*} event 
     */
    changeHandler(event) {
        const { name, value } = event.target;
        this.curEvent = { ...this.curEvent, [name]: value };
        console.log('this.curEvent id in changeHandler: ', this.curEvent.id);
    }

    /**
     * @description method to show toast events
     */
    showToast(message, variant) {
        const toast = this.template.querySelector('c-notification');
        if (toast) {
            toast.showToast(message, variant);
        };
    }

    /**
     * @description refresh the events
     */
    refresh() {
        return refreshApex(this.eventOriginalData);
    }

    /**
     * @description decide the current modal name based on whether the selectedRecordId is selected or not
     */
    get ModalName() {
        return this.selectedRecordId ? "Update Event" : "Add Event";
    }
}