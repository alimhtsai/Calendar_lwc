public with sharing class CalendarController {

    @AuraEnabled(cacheable=true)
    public static List<MyCalendar__c> fetchEvents() {
        return [SELECT Id, Name, StartDateTime__c, EndDateTime__c 
                FROM MyCalendar__c 
                ORDER BY CreatedDate DESC
                LIMIT 100];
    }
    
    @AuraEnabled
    public static Id createEvent(String event) {

        if (String.isBlank(event)) {
            return null;
        }

        Map<String, Object> eventMap = (Map<String, Object>) JSON.deserializeUntyped(event);
        
        MyCalendar__c newEvent = new MyCalendar__c();

        newEvent.Name = (String) eventMap.get('title');

        // Convert start and end dates to Datetime format
        String startdateStr = (String) eventMap.get('start');
        String enddateStr = (String) eventMap.get('end');
        Datetime startDatetime = parseIsoDatetime(startdateStr);
        Datetime endDatetime = parseIsoDatetime(enddateStr);

        newEvent.StartDateTime__c = startDatetime;
        newEvent.EndDateTime__c = endDatetime;

        try {
            insert newEvent;
            return newEvent.Id;
        } catch (Exception e) {
            System.debug('Error inserting event: ' + e.getMessage());
            return null;
        }
    }

    @AuraEnabled
    public static Boolean deleteEvent(String eventid) {
        try {
            if (!String.isBlank(eventid)) {
                MyCalendar__c deleteEvent = new MyCalendar__c(Id = eventid);
                delete deleteEvent;
                return true;
            }
            return false;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static Datetime parseIsoDatetime(String datetimeStr) {
        // ISO 8601 format: 2024-06-30T10:00:00.000Z
        String formattedStr = datetimeStr.replace('T', ' ').replace('Z', '');
        try {
            return Datetime.valueOfGmt(formattedStr);
        } catch (Exception e) {
            System.debug('Error parsing datetime: ' + e.getMessage());
            return null;
        }
    }
}