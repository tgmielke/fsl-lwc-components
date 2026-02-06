/**
 * Controller for Building Asset Map LWC
 * Handles Work Plan and Work Step creation for asset inspections
 */
public with sharing class BuildingAssetMapController {

    public class WarningAttribute {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public Decimal attrValue { get; set; }
        @AuraEnabled public Decimal minThreshold { get; set; }
        @AuraEnabled public Decimal maxThreshold { get; set; }
        @AuraEnabled public String unit { get; set; }
        @AuraEnabled public String category { get; set; }
    }

    @AuraEnabled
    public static String createInspectionWorkPlan(String workOrderId, String assetName, String warningAttributes) {
        try {
            List<WarningAttribute> attrs = (List<WarningAttribute>) JSON.deserialize(warningAttributes, List<WarningAttribute>.class);

            // Determine the actual Work Order ID - workOrderId could actually be a WorkOrder or ServiceAppointment ID
            Id parentWorkOrderId = resolveWorkOrderId(workOrderId);
            if (parentWorkOrderId == null) {
                throw new AuraHandledException('Could not determine Work Order from record ID: ' + workOrderId);
            }

            WorkPlan plan = new WorkPlan();
            plan.Name = 'Inspection: ' + assetName;
            plan.Description = 'Asset inspection work plan for ' + assetName + ' - ' + attrs.size() + ' threshold alert(s) detected';
            plan.ParentRecordId = parentWorkOrderId;
            insert plan;

            List<WorkStep> steps = new List<WorkStep>();
            Integer stepOrder = 1;

            steps.add(buildWorkStep(plan.Id, 'Document Current Conditions', 'Take photos of ' + assetName + ' current state. Note any visible issues, error lights, or unusual sounds.', stepOrder++));

            for (WarningAttribute attr : attrs) {
                String stepName = buildStepName(attr);
                String stepDesc = buildStepDescription(attr, assetName);
                steps.add(buildWorkStep(plan.Id, stepName, stepDesc, stepOrder++));
            }

            steps.add(buildWorkStep(plan.Id, 'Assess Remediation Options', 'Based on inspection findings, determine if on-site repair is possible or if parts/escalation is needed.', stepOrder++));
            steps.add(buildWorkStep(plan.Id, 'Verify & Document Resolution', 'After any remediation, verify all readings are within threshold. Document final state and update asset records.', stepOrder++));

            insert steps;
            return plan.Id;
        } catch (Exception e) {
            throw new AuraHandledException('Error creating inspection work plan: ' + e.getMessage());
        }
    }

    /**
     * Resolves a recordId to a WorkOrder Id
     * Handles both WorkOrder and ServiceAppointment record types
     */
    private static Id resolveWorkOrderId(String recordId) {
        if (String.isBlank(recordId)) {
            return null;
        }

        Id recId = Id.valueOf(recordId);
        String sObjectType = recId.getSObjectType().getDescribe().getName();

        if (sObjectType == 'WorkOrder') {
            // Already a Work Order ID
            return recId;
        } else if (sObjectType == 'ServiceAppointment') {
            // Look up the parent Work Order from the Service Appointment
            List<ServiceAppointment> sas = [
                SELECT ParentRecordId
                FROM ServiceAppointment
                WHERE Id = :recId
                LIMIT 1
            ];
            if (!sas.isEmpty() && sas[0].ParentRecordId != null) {
                // Check if the parent is a WorkOrder
                Id parentId = sas[0].ParentRecordId;
                String parentType = parentId.getSObjectType().getDescribe().getName();
                if (parentType == 'WorkOrder') {
                    return parentId;
                }
                // If parent is a WorkOrderLineItem, get its parent WorkOrder
                if (parentType == 'WorkOrderLineItem') {
                    List<WorkOrderLineItem> wolis = [
                        SELECT WorkOrderId FROM WorkOrderLineItem WHERE Id = :parentId LIMIT 1
                    ];
                    if (!wolis.isEmpty()) {
                        return wolis[0].WorkOrderId;
                    }
                }
            }
        }

        return null;
    }

    private static WorkStep buildWorkStep(Id planId, String stepName, String stepDescription, Integer executionOrder) {
        WorkStep step = new WorkStep();
        step.Name = stepName;
        step.Description = stepDescription;
        step.ExecutionOrder = executionOrder;
        step.WorkPlanId = planId;
        return step;
    }

    private static String buildStepName(WarningAttribute attr) {
        String attrNameLower = attr.name.toLowerCase();
        if (attrNameLower.contains('temp')) { return 'Inspect Thermal System - ' + attr.name; }
        if (attrNameLower.contains('fan')) { return 'Inspect Cooling Fans - ' + attr.name; }
        if (attrNameLower.contains('humid')) { return 'Check Environmental Controls - ' + attr.name; }
        if (attrNameLower.contains('compressor')) { return 'Inspect HVAC Compressor - ' + attr.name; }
        if (attrNameLower.contains('error') || attrNameLower.contains('fec')) { return 'Diagnose Signal Errors - ' + attr.name; }
        if (attrNameLower.contains('power') || attrNameLower.contains('voltage')) { return 'Check Power Systems - ' + attr.name; }
        return 'Inspect ' + attr.name;
    }

    private static String buildStepDescription(WarningAttribute attr, String assetName) {
        String status = (attr.attrValue < attr.minThreshold) ? 'BELOW' : 'ABOVE';
        String result = attr.name + ' on ' + assetName + ' is ' + status + ' threshold. ';
        result = result + 'Current Value: ' + attr.attrValue + ' ' + attr.unit + '. ';
        result = result + 'Expected Range: ' + attr.minThreshold + ' - ' + attr.maxThreshold + ' ' + attr.unit + '. ';

        String attrNameLower = attr.name.toLowerCase();
        if (attrNameLower.contains('temp')) {
            result = result + 'INSPECTION: 1) Check airflow paths for obstructions 2) Verify cooling system operation 3) Check for hot spots 4) Inspect heat sinks';
        } else if (attrNameLower.contains('fan')) {
            result = result + 'INSPECTION: 1) Visually inspect all fans for rotation 2) Listen for unusual bearing noise 3) Check fan controller status 4) Verify power to fan modules';
        } else if (attrNameLower.contains('humid')) {
            result = result + 'INSPECTION: 1) Check CRAC/CRAH unit operation 2) Verify humidifier/dehumidifier status 3) Check for water leaks 4) Review environmental monitoring';
        } else if (attrNameLower.contains('compressor')) {
            result = result + 'INSPECTION: 1) Check compressor error codes 2) Verify refrigerant levels 3) Inspect electrical connections 4) Check for vibration or noise';
        } else if (attrNameLower.contains('fec') || attrNameLower.contains('error')) {
            result = result + 'INSPECTION: 1) Check fiber connections and clean if needed 2) Verify optical power levels 3) Check for fiber damage 4) Review error logs';
        } else {
            result = result + 'INSPECTION: 1) Visually inspect component 2) Check related connections 3) Review system logs 4) Document findings';
        }
        return result;
    }
}
