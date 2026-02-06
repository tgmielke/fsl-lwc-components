/**
 * Controller for SA Status Update LWC
 * Handles RSO requests and dependency chain management
 */
public with sharing class SAStatusUpdateController {

    /**
     * Get all appointments in the dependency chain for a given appointment
     * Traverses both upstream (related service) and downstream (child appointments)
     */
    @AuraEnabled(cacheable=true)
    public static List<AppointmentChainItem> getAppointmentChain(Id appointmentId) {
        List<AppointmentChainItem> chainItems = new List<AppointmentChainItem>();
        Set<Id> processedIds = new Set<Id>();

        // Get the current appointment
        ServiceAppointment currentSA = [
            SELECT Id, AppointmentNumber, Status, FSL__Related_Service__c,
                   FSL__Time_Dependency__c, SchedStartTime, SchedEndTime,
                   ServiceTerritoryId
            FROM ServiceAppointment
            WHERE Id = :appointmentId
            LIMIT 1
        ];

        processedIds.add(appointmentId);

        // Traverse upstream (appointments this one depends on)
        if (currentSA.FSL__Related_Service__c != null) {
            traverseUpstream(currentSA.FSL__Related_Service__c, chainItems, processedIds);
        }

        // Traverse downstream (appointments that depend on this one)
        traverseDownstream(appointmentId, chainItems, processedIds);

        // Get assigned resources for each appointment
        Set<Id> allAppointmentIds = new Set<Id>();
        for (AppointmentChainItem item : chainItems) {
            allAppointmentIds.add(item.Id);
        }

        if (!allAppointmentIds.isEmpty()) {
            Map<Id, AssignedResource> resourceMap = new Map<Id, AssignedResource>();
            for (AssignedResource ar : [
                SELECT Id, ServiceAppointmentId, ServiceResourceId, ServiceResource.Name
                FROM AssignedResource
                WHERE ServiceAppointmentId IN :allAppointmentIds
            ]) {
                resourceMap.put(ar.ServiceAppointmentId, ar);
            }

            for (AppointmentChainItem item : chainItems) {
                AssignedResource ar = resourceMap.get(item.Id);
                if (ar != null) {
                    item.ResourceId = ar.ServiceResourceId;
                    item.ResourceName = ar.ServiceResource.Name;
                }
            }
        }

        return chainItems;
    }

    private static void traverseUpstream(Id relatedServiceId, List<AppointmentChainItem> chainItems, Set<Id> processedIds) {
        if (relatedServiceId == null || processedIds.contains(relatedServiceId)) {
            return;
        }

        ServiceAppointment sa = [
            SELECT Id, AppointmentNumber, Status, FSL__Related_Service__c,
                   FSL__Time_Dependency__c, SchedStartTime, SchedEndTime,
                   ServiceTerritoryId
            FROM ServiceAppointment
            WHERE Id = :relatedServiceId
            LIMIT 1
        ];

        processedIds.add(sa.Id);

        AppointmentChainItem item = new AppointmentChainItem();
        item.Id = sa.Id;
        item.AppointmentNumber = sa.AppointmentNumber;
        item.Status = sa.Status;
        item.DependencyType = 'Predecessor';
        item.ScheduledDate = sa.SchedStartTime != null ? sa.SchedStartTime.format('MMM d, yyyy') : 'Not Scheduled';
        item.ServiceTerritoryId = sa.ServiceTerritoryId;
        chainItems.add(item);

        // Continue upstream
        if (sa.FSL__Related_Service__c != null) {
            traverseUpstream(sa.FSL__Related_Service__c, chainItems, processedIds);
        }
    }

    private static void traverseDownstream(Id parentAppointmentId, List<AppointmentChainItem> chainItems, Set<Id> processedIds) {
        List<ServiceAppointment> childAppointments = [
            SELECT Id, AppointmentNumber, Status, FSL__Related_Service__c,
                   FSL__Time_Dependency__c, SchedStartTime, SchedEndTime,
                   ServiceTerritoryId
            FROM ServiceAppointment
            WHERE FSL__Related_Service__c = :parentAppointmentId
            AND Id NOT IN :processedIds
        ];

        for (ServiceAppointment sa : childAppointments) {
            processedIds.add(sa.Id);

            AppointmentChainItem item = new AppointmentChainItem();
            item.Id = sa.Id;
            item.AppointmentNumber = sa.AppointmentNumber;
            item.Status = sa.Status;
            item.DependencyType = 'Successor';
            item.ScheduledDate = sa.SchedStartTime != null ? sa.SchedStartTime.format('MMM d, yyyy') : 'Not Scheduled';
            item.ServiceTerritoryId = sa.ServiceTerritoryId;
            chainItems.add(item);

            // Continue downstream recursively
            traverseDownstream(sa.Id, chainItems, processedIds);
        }
    }

    // Red color for blocked appointments on Gantt
    private static final String BLOCKED_GANTT_COLOR = '#c23934';

    /**
     * Trigger RSO for a blocked appointment and its dependencies
     * Also sets Gantt color to red and posts to Chatter
     * Uses dynamic queries to handle case where FSL managed package objects may not exist
     */
    @AuraEnabled
    public static RSOResult triggerRSOForBlockedAppointment(Id appointmentId, String blockReason, String blockNotes) {
        RSOResult result = new RSOResult();
        result.rsoCount = 0;
        result.affectedResources = new List<String>();

        try {
            // Set Gantt color to red for the blocked appointment
            setGanttColorForBlockedAppointment(appointmentId);

            // Post to Chatter with the blocked reason
            postBlockedReasonToChatter(appointmentId, blockReason, blockNotes);

            // Get the appointment chain
            List<AppointmentChainItem> chainItems = getAppointmentChain(appointmentId);

            // Get all appointments that need RSO (current + chain)
            Set<Id> appointmentIds = new Set<Id>();
            appointmentIds.add(appointmentId);
            for (AppointmentChainItem item : chainItems) {
                appointmentIds.add(item.Id);
            }

            // Get assigned resources for these appointments
            Map<Id, Date> resourceDateMap = new Map<Id, Date>();
            for (AssignedResource ar : [
                SELECT Id, ServiceResourceId, ServiceAppointment.SchedStartTime
                FROM AssignedResource
                WHERE ServiceAppointmentId IN :appointmentIds
                AND ServiceAppointment.SchedStartTime != NULL
            ]) {
                Id resourceId = ar.ServiceResourceId;
                Date schedDate = ar.ServiceAppointment.SchedStartTime.date();

                // Track unique resource/date combinations
                if (!resourceDateMap.containsKey(resourceId) ||
                    resourceDateMap.get(resourceId) > schedDate) {
                    resourceDateMap.put(resourceId, schedDate);
                }
            }

            // Get resource names
            Map<Id, ServiceResource> resourceNameMap = new Map<Id, ServiceResource>([
                SELECT Id, Name
                FROM ServiceResource
                WHERE Id IN :resourceDateMap.keySet()
            ]);

            // Check if FSL RSO object exists
            Boolean rsoObjectExists = doesObjectExist('FSL__Schedule_Optimization_Request__c');

            if (rsoObjectExists) {
                // Create RSO requests using dynamic DML
                result = createRSORequests(resourceDateMap, resourceNameMap, blockReason, blockNotes);
            } else {
                // RSO object not available, just return affected resources info
                for (Id resourceId : resourceDateMap.keySet()) {
                    ServiceResource sr = resourceNameMap.get(resourceId);
                    result.affectedResources.add(sr != null ? sr.Name : 'Resource');
                }
                result.rsoCount = result.affectedResources.size();
                result.message = 'RSO object not available in org. Affected resources: ' + String.join(result.affectedResources, ', ');
            }

            result.success = true;

        } catch (Exception e) {
            result.success = false;
            result.message = e.getMessage();
        }

        return result;
    }

    /**
     * Set the Gantt color to red for a blocked appointment
     */
    private static void setGanttColorForBlockedAppointment(Id appointmentId) {
        ServiceAppointment sa = [
            SELECT Id, FSL__GanttColor__c
            FROM ServiceAppointment
            WHERE Id = :appointmentId
            LIMIT 1
        ];
        sa.FSL__GanttColor__c = BLOCKED_GANTT_COLOR;
        update sa;
    }

    /**
     * Post a Chatter message from the assigned tech to the SA feed with the blocked reason
     * Gracefully handles case where Feed Tracking is not enabled for ServiceAppointment
     */
    private static void postBlockedReasonToChatter(Id appointmentId, String blockReason, String blockNotes) {
        try {
            // Get the assigned resource (technician) for this appointment
            List<AssignedResource> assignedResources = [
                SELECT Id, ServiceResourceId, ServiceResource.Name, ServiceResource.RelatedRecordId
                FROM AssignedResource
                WHERE ServiceAppointmentId = :appointmentId
                LIMIT 1
            ];

            String techName = 'Field Technician';
            Id techUserId = UserInfo.getUserId(); // Default to current user

            if (!assignedResources.isEmpty()) {
                AssignedResource ar = assignedResources[0];
                techName = ar.ServiceResource.Name;
                // ServiceResource.RelatedRecordId points to the User record
                if (ar.ServiceResource.RelatedRecordId != null) {
                    techUserId = ar.ServiceResource.RelatedRecordId;
                }
            }

            // Build the Chatter message
            String messageBody = '🚫 **Appointment Blocked**\n\n' +
                '**Reason:** ' + blockReason + '\n';

            if (String.isNotBlank(blockNotes)) {
                messageBody += '**Notes:** ' + blockNotes + '\n';
            }

            messageBody += '\n_Reported by ' + techName + '_';

            // Create FeedItem (Chatter post)
            FeedItem post = new FeedItem();
            post.ParentId = appointmentId;
            post.Body = messageBody;
            post.Type = 'TextPost';

            // Try to post as the tech user if possible
            try {
                post.CreatedById = techUserId;
            } catch (Exception e) {
                // Permission not available, will post as current user
            }

            insert post;
        } catch (Exception e) {
            // Feed tracking may not be enabled for ServiceAppointment
            // Log but don't fail the entire operation
            System.debug(LoggingLevel.WARN, 'Could not post to Chatter (feed tracking may not be enabled): ' + e.getMessage());
        }
    }

    /**
     * Clear the Gantt color when resetting an appointment (for demo reset)
     */
    public static void clearGanttColorForAppointments(Set<Id> appointmentIds) {
        List<ServiceAppointment> appointmentsToUpdate = [
            SELECT Id, FSL__GanttColor__c
            FROM ServiceAppointment
            WHERE Id IN :appointmentIds
            AND FSL__GanttColor__c = :BLOCKED_GANTT_COLOR
        ];

        for (ServiceAppointment sa : appointmentsToUpdate) {
            sa.FSL__GanttColor__c = null;
        }

        if (!appointmentsToUpdate.isEmpty()) {
            update appointmentsToUpdate;
        }
    }

    /**
     * Check if an object exists in the org
     */
    private static Boolean doesObjectExist(String objectName) {
        try {
            Schema.getGlobalDescribe().get(objectName);
            return Schema.getGlobalDescribe().containsKey(objectName);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Create RSO requests using dynamic DML
     */
    private static RSOResult createRSORequests(Map<Id, Date> resourceDateMap, Map<Id, ServiceResource> resourceNameMap, String blockReason, String blockNotes) {
        RSOResult result = new RSOResult();
        result.rsoCount = 0;
        result.affectedResources = new List<String>();

        // Get scheduling policy using dynamic SOQL
        Id policyId = null;
        String schedulingPolicyName = 'In-Day Optimization';

        try {
            String policyQuery = 'SELECT Id, Name FROM FSL__Scheduling_Policy__c WHERE Name = :schedulingPolicyName LIMIT 1';
            List<SObject> policies = Database.query(policyQuery);
            if (!policies.isEmpty()) {
                policyId = (Id)policies[0].get('Id');
            } else {
                // Fallback to any policy
                String fallbackQuery = 'SELECT Id, Name FROM FSL__Scheduling_Policy__c LIMIT 1';
                List<SObject> fallbackPolicies = Database.query(fallbackQuery);
                if (!fallbackPolicies.isEmpty()) {
                    policyId = (Id)fallbackPolicies[0].get('Id');
                }
            }
        } catch (Exception e) {
            // Policy object doesn't exist or query failed
            result.success = false;
            result.message = 'Could not find scheduling policy: ' + e.getMessage();
            return result;
        }

        if (policyId != null) {
            // Create RSO records using dynamic SObject creation
            List<SObject> rsoRequests = new List<SObject>();
            Schema.SObjectType rsoType = Schema.getGlobalDescribe().get('FSL__Schedule_Optimization_Request__c');

            for (Id resourceId : resourceDateMap.keySet()) {
                Date schedDate = resourceDateMap.get(resourceId);
                ServiceResource sr = resourceNameMap.get(resourceId);

                SObject rso = rsoType.newSObject();
                rso.put('FSL__Service_Resource__c', resourceId);
                rso.put('FSL__Start__c', DateTime.newInstance(schedDate, Time.newInstance(0, 0, 0, 0)));
                rso.put('FSL__Finish__c', DateTime.newInstance(schedDate, Time.newInstance(23, 59, 59, 0)));
                rso.put('FSL__Scheduling_Policy__c', policyId);
                rso.put('FSL__Description__c', 'RSO triggered due to blocked appointment: ' + blockReason +
                    (String.isNotBlank(blockNotes) ? '\nNotes: ' + blockNotes : ''));

                rsoRequests.add(rso);
                result.affectedResources.add(sr != null ? sr.Name : 'Resource');
            }

            if (!rsoRequests.isEmpty()) {
                insert rsoRequests;
                result.rsoCount = rsoRequests.size();
            }
        }

        result.success = true;
        result.message = 'RSO triggered successfully';
        return result;
    }

    /**
     * Reset status for all appointments in a chain
     * Used by Demo Reset LWC
     * Also clears Gantt color for blocked appointments
     */
    @AuraEnabled
    public static Integer resetChainStatus(Id appointmentId, String targetStatus) {
        // Get the appointment chain
        List<AppointmentChainItem> chainItems = getAppointmentChain(appointmentId);

        // Include the current appointment
        Set<Id> appointmentIds = new Set<Id>();
        appointmentIds.add(appointmentId);
        for (AppointmentChainItem item : chainItems) {
            appointmentIds.add(item.Id);
        }

        // Update all appointments to target status and clear blocked Gantt color
        List<ServiceAppointment> appointmentsToUpdate = [
            SELECT Id, Status, FSL__GanttColor__c
            FROM ServiceAppointment
            WHERE Id IN :appointmentIds
        ];

        for (ServiceAppointment sa : appointmentsToUpdate) {
            sa.Status = targetStatus;
            // Clear red Gantt color if it was set for blocked status
            if (sa.FSL__GanttColor__c == BLOCKED_GANTT_COLOR) {
                sa.FSL__GanttColor__c = null;
            }
        }

        update appointmentsToUpdate;

        return appointmentsToUpdate.size();
    }

    // Wrapper classes
    public class AppointmentChainItem {
        @AuraEnabled public Id Id { get; set; }
        @AuraEnabled public String AppointmentNumber { get; set; }
        @AuraEnabled public String Status { get; set; }
        @AuraEnabled public String DependencyType { get; set; }
        @AuraEnabled public String ScheduledDate { get; set; }
        @AuraEnabled public Id ResourceId { get; set; }
        @AuraEnabled public String ResourceName { get; set; }
        @AuraEnabled public Id ServiceTerritoryId { get; set; }
    }

    public class RSOResult {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String message { get; set; }
        @AuraEnabled public Integer rsoCount { get; set; }
        @AuraEnabled public List<String> affectedResources { get; set; }
    }
}
