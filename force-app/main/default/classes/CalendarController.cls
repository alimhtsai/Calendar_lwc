public with sharing class CalendarController {
    
    @AuraEnabled
    public static Id createEvent(String event) {

        if (String.isBlank(event)) {
            return null;
        }

        Map<String, Object> eventMap = (Map<String, Object>) JSON.deserializeUntyped(event);
        
        Event newEvent = new Event();
        newEvent.Subject = eventMap.get('title') != null ? (String)eventMap.get('title') : null;

        String startdate = eventMap.get('start') != null ? 
                            ((String) eventMap.get('start')).replace('T', ' ').replace('.000Z', '') : 
                            null;
        String endDate = eventMap.get('end') != null ? 
                            ((String)eventMap.get('end')).replace('T', ' ').replace('.000Z', '') : 
                            null;

        newEvent.StartDateTime = startdate != null ? Datetime.valueOfGmt(startdate) : null;
        newEvent.EndDateTime = endDate != null ? Datetime.valueOfGmt(endDate) : null;
        insert newEvent;

        return newEvent.Id;
    }
}