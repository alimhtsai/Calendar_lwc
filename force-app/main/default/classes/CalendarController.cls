public without sharing class CalendarController {

    /**
     * When an @AuraEnabled apex method is marked with cacheable=true, 
     * the LWC won't let you modify the data returned directly. 
     * We have to copy it to a different array or use it in read only format.
     */
    @AuraEnabled(cacheable=true)
    public static List<MyCalendar__c> fetchEvents() {
        return [SELECT Id, Name, StartDateTime__c, EndDateTime__c, Hours__c 
                FROM MyCalendar__c 
                ORDER BY CreatedDate DESC
                LIMIT 100];
    }
    
    @AuraEnabled
    public static Id createEvent(String event) {
        try {
            if (!String.isBlank(event)) {
                Map<String, Object> eventMap = (Map<String, Object>) JSON.deserializeUntyped(event);
            
                MyCalendar__c newEvent = new MyCalendar__c();
                
                String startdateStr = (String) eventMap.get('start');
                String enddateStr = (String) eventMap.get('end');
                Datetime startDatetime = parseIsoDatetime(startdateStr);
                Datetime endDatetime = parseIsoDatetime(enddateStr);
        
                newEvent.Name = (String) eventMap.get('title');
                newEvent.StartDateTime__c = startDatetime;
                newEvent.EndDateTime__c = endDatetime;
                newEvent.Hours__c = getHoursBetweenDates(startDatetime, endDatetime);
        
                insert newEvent;
                return newEvent.Id;
            }
            return null;
        } catch (Exception e) {
            System.debug('Error inserting event: ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static Boolean deleteEvent(String eventId) {
        try {
            if (!String.isBlank(eventId)) {
                MyCalendar__c deleteEvent = new MyCalendar__c(Id = eventId);
                delete deleteEvent;
                // delete [SELECT Id FROM MyCalendar__c Where Id=:eventid];
                return true;
            }
            return false;
        } catch (Exception e) {
            System.debug('Error deleting event: ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static Boolean updateEvent(String eventId, String event) {
        try {
            if (!String.isBlank(eventId)) {
                MyCalendar__c updateEvent = [
                    SELECT 
                    Id, Name, StartDateTime__c, EndDateTime__c, Hours__c 
                    FROM MyCalendar__c
                    WHERE Id = :eventId];
                
                Map<String, Object> eventMap = (Map<String, Object>) JSON.deserializeUntyped(event);
            
                updateEvent.Name = (String) eventMap.get('title');
        
                // Convert start and end dates to Datetime format
                String startdateStr = (String) eventMap.get('start');
                String enddateStr = (String) eventMap.get('end');
                Datetime startDatetime = parseIsoDatetime(startdateStr);
                Datetime endDatetime = parseIsoDatetime(enddateStr);
        
                updateEvent.StartDateTime__c = startDatetime;
                updateEvent.EndDateTime__c = endDatetime;
                updateEvent.Hours__c = getHoursBetweenDates(startDatetime, endDatetime);

                update updateEvent;
                return true;
            }
            return false;
        } catch (Exception e) {
            System.debug('Error updating event' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static Datetime parseIsoDatetime(String datetimeStr) {
        String formattedStr = datetimeStr.replace('T', ' ').replace('Z', '');
        try {
            return Datetime.valueOf(formattedStr);
        } catch (Exception e) {
            System.debug('Error parsing datetime: ' + e.getMessage());
            return null;
        }
    }

    private static Decimal getHoursBetweenDates(Datetime startTime, Datetime endTime) {
        Long diffInMs = Math.abs(endTime.getTime() - startTime.getTime());
        Integer millisecondsPerHour = 1000 * 60 * 60;
        Decimal diffInHours = Decimal.valueOf(diffInMs) / millisecondsPerHour;
        return diffInHours.setScale(2, RoundingMode.HALF_UP);
    }
}