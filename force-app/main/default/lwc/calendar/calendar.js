import { LightningElement, track } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendarJS from '@salesforce/resourceUrl/FullCalendarJS';
import createEvent from '@salesforce/apex/CalendarController.createEvent';

/**
 * FullCalendarJs
 * @description Full Calendar JS - Lightning Web Components
 */
export default class FullCalendarJs extends LightningElement {

  fullCalendarJsInitialised = false;

  /**
   * @description Standard lifecyle method 'renderedCallback'
   *              Ensures that the page loads and renders the 
   *              container before doing anything else
   */
  renderedCallback() {

    // Performs this operation only on first render
    if (this.fullCalendarJsInitialised) {
      return;
    }
    this.fullCalendarJsInitialised = true;

    // Executes all loadScript and loadStyle promises
    // and only resolves them once all promises are done
    Promise.all([
      loadScript(this, FullCalendarJS + '/jquery.min.js'),
      loadScript(this, FullCalendarJS + '/moment.min.js'),
      loadScript(this, FullCalendarJS + '/fullcalendar.min.js'),
      loadStyle(this, FullCalendarJS + '/fullcalendar.min.css'),
      // loadStyle(this, FullCalendarJS + '/fullcalendar.print.min.css')
    ])
    .then(() => {
      // Initialise the calendar configuration
      this.initialiseFullCalendarJs();
    })
    .catch(error => {
      console.error({
        message: 'Error occured on FullCalendarJS',
        error
      });
    })
  }

  /**
   * @description Initialise the calendar configuration
   *              This is where we configure the available options for the calendar.
   *              This is also where we load the Events data.
   */
  initialiseFullCalendarJs() {
    
    const ele = this.template.querySelector('div.fullcalendarjs');

    // eslint-disable-next-line no-undef
    $(ele).fullCalendar({
      header: {
          left: 'prev,next today',
          center: 'title',
          right: 'month,basicWeek,basicDay'
      },
      defaultDate: new Date(), // default day is today
      navLinks: true, // can click day/week names to navigate views
      editable: true,
      eventLimit: true, // allow "more" link when too many events
      events: [
        {
            title: 'Day 1',
            start: '2024-06-24T09:00:00',
            end: '2024-06-24T15:00:00',
        },
        {
            title: 'Day 2',
            start: '2024-06-25T09:00:00',
            end: '2024-06-25T15:00:00',
        },
        {
            title: 'Day 3',
            start: '2024-06-26T09:00:00',
            end: '2024-06-26T16:00:00',
        },
      ]
    });
  }
}