/**
 * Controller for Predictive Maintenance LWC
 * Handles AI predictions display and Work Plan creation for proactive maintenance
 */
public with sharing class PredictiveMaintenanceController {

    /**
     * Get predictive maintenance data for an asset
     */
    @AuraEnabled(cacheable=true)
    public static PredictiveData getPredictiveData(Id assetId) {
        Asset ast = [
            SELECT Id, Name, Product2.Name, Status, InstallDate,
                   Account.Name, Location.Name, ParentId, Parent.Name
            FROM Asset
            WHERE Id = :assetId
            LIMIT 1
        ];

        PredictiveData data = new PredictiveData();
        data.assetId = ast.Id;
        data.assetName = ast.Name;
        data.productName = ast.Product2?.Name;
        data.status = ast.Status;
        data.installDate = ast.InstallDate;
        data.accountName = ast.Account?.Name;
        data.locationName = ast.Location?.Name;
        data.parentAssetName = ast.Parent?.Name;

        // Simulated predictive analytics (in production, this would come from Data Cloud/Einstein)
        data.healthScore = calculateHealthScore(ast);
        data.failureProbability = calculateFailureProbability(ast);
        data.predictedFailureDate = calculatePredictedFailureDate(ast);
        data.daysUntilFailure = data.predictedFailureDate != null
            ? Date.today().daysBetween(data.predictedFailureDate)
            : null;
        data.recommendation = getRecommendation(data);
        data.telemetryData = generateTelemetryData(ast);
        data.riskLevel = getRiskLevel(data.failureProbability);

        // Check for existing upcoming maintenance
        data.hasUpcomingMaintenance = checkUpcomingMaintenance(assetId);
        data.upcomingWorkOrderId = getUpcomingWorkOrderId(assetId);

        return data;
    }

    /**
     * Get work orders at the same location for adding work
     */
    @AuraEnabled(cacheable=true)
    public static List<WorkOrderOption> getLocationWorkOrders(Id assetId) {
        Asset ast = [SELECT LocationId, AccountId FROM Asset WHERE Id = :assetId];

        List<WorkOrderOption> options = new List<WorkOrderOption>();

        // Find upcoming work orders at same location or account
        List<WorkOrder> wos = [
            SELECT Id, WorkOrderNumber, Subject, Status, StartDate,
                   (SELECT Id FROM ServiceAppointments WHERE Status != 'Completed' LIMIT 1)
            FROM WorkOrder
            WHERE (LocationId = :ast.LocationId OR AccountId = :ast.AccountId)
            AND Status NOT IN ('Completed', 'Closed', 'Canceled')
            ORDER BY StartDate ASC
            LIMIT 10
        ];

        for (WorkOrder wo : wos) {
            WorkOrderOption opt = new WorkOrderOption();
            opt.workOrderId = wo.Id;
            opt.workOrderNumber = wo.WorkOrderNumber;
            opt.subject = wo.Subject;
            opt.status = wo.Status;
            opt.hasAppointment = !wo.ServiceAppointments.isEmpty();
            options.add(opt);
        }

        return options;
    }

    /**
     * Create a preventive maintenance Work Plan on an existing Work Order
     */
    @AuraEnabled
    public static String createPreventiveWorkPlan(Id workOrderId, Id assetId, String predictionData) {
        try {
            Asset ast = [SELECT Name, Product2.Name FROM Asset WHERE Id = :assetId];

            // Create Work Plan
            WorkPlan plan = new WorkPlan();
            plan.Name = '⚠️ Predictive Maintenance: ' + ast.Name;
            plan.Description = 'AI-predicted maintenance work plan for ' + ast.Name + ' (' + ast.Product2?.Name + '). ' +
                              'Analysis indicates elevated failure risk within 90 days. ' +
                              'Proactively addressing this during scheduled visit.';
            plan.ParentRecordId = workOrderId;
            insert plan;

            // Create Work Steps
            List<WorkStep> steps = new List<WorkStep>();
            Integer order = 1;

            steps.add(createWorkStep(plan.Id, 'Pre-Inspection Safety Check',
                'Ensure power isolation procedures are followed. Verify lockout/tagout if needed.', order++));

            steps.add(createWorkStep(plan.Id, 'Visual Inspection - ' + ast.Name,
                'Inspect ' + ast.Name + ' for signs of wear, corrosion, or damage. Check LED indicators and display panels for error codes.', order++));

            steps.add(createWorkStep(plan.Id, 'Telemetry Verification',
                'Compare current telemetry readings with baseline. Verify temperature, voltage, and performance metrics are within specification.', order++));

            steps.add(createWorkStep(plan.Id, 'Component Health Check',
                'Test critical components: power supply, cooling fans, capacitors (if applicable). Listen for unusual sounds.', order++));

            steps.add(createWorkStep(plan.Id, 'Preventive Replacement Assessment',
                'Based on inspection findings, determine if any components should be proactively replaced. Document parts needed.', order++));

            steps.add(createWorkStep(plan.Id, 'Firmware/Software Update Check',
                'Verify current firmware version. Apply updates if available and approved for this equipment type.', order++));

            steps.add(createWorkStep(plan.Id, 'Documentation & Asset Update',
                'Update asset record with inspection findings. Attach photos. Update next maintenance date.', order++));

            insert steps;

            return plan.Id;
        } catch (Exception e) {
            throw new AuraHandledException('Error creating preventive work plan: ' + e.getMessage());
        }
    }

    private static WorkStep createWorkStep(Id planId, String name, String description, Integer executionOrder) {
        WorkStep step = new WorkStep();
        step.Name = name;
        step.Description = description;
        step.ExecutionOrder = executionOrder;
        step.WorkPlanId = planId;
        return step;
    }

    // Simulated AI calculations (would be replaced by actual Data Cloud/Einstein in production)
    private static Integer calculateHealthScore(Asset ast) {
        // Demo logic: Older assets have lower health scores
        Integer score = 95;
        if (ast.InstallDate != null) {
            Integer ageMonths = ast.InstallDate.monthsBetween(Date.today());
            score = Math.max(40, 100 - (ageMonths / 2));
        }
        // Add some variation based on product type
        String productName = ast.Product2?.Name?.toLowerCase();
        if (productName != null && productName.contains('ups')) {
            score = Math.min(score, 72); // UPS units show higher risk for demo
        }
        return score;
    }

    private static Integer calculateFailureProbability(Asset ast) {
        String productName = ast.Product2?.Name?.toLowerCase();
        // For demo: UPS units show elevated failure probability
        if (productName != null && productName.contains('ups')) {
            return 78; // High probability for demo
        }
        if (productName != null && productName.contains('olt')) {
            return 35;
        }
        return 15;
    }

    private static Date calculatePredictedFailureDate(Asset ast) {
        String productName = ast.Product2?.Name?.toLowerCase();
        // For demo: UPS predicted to fail in ~45 days
        if (productName != null && productName.contains('ups')) {
            return Date.today().addDays(45);
        }
        if (productName != null && productName.contains('olt')) {
            return Date.today().addDays(120);
        }
        return Date.today().addDays(365);
    }

    private static String getRecommendation(PredictiveData data) {
        if (data.failureProbability >= 70) {
            return 'URGENT: Schedule preventive maintenance within 30 days. Battery replacement likely needed.';
        } else if (data.failureProbability >= 40) {
            return 'ATTENTION: Add inspection to next scheduled visit. Monitor telemetry closely.';
        } else {
            return 'NORMAL: Continue standard maintenance schedule.';
        }
    }

    private static String getRiskLevel(Integer probability) {
        if (probability >= 70) return 'High';
        if (probability >= 40) return 'Medium';
        return 'Low';
    }

    private static List<TelemetryReading> generateTelemetryData(Asset ast) {
        List<TelemetryReading> readings = new List<TelemetryReading>();
        String productName = ast.Product2?.Name?.toLowerCase();

        if (productName != null && productName.contains('ups')) {
            readings.add(new TelemetryReading('Battery Health', 68, '%', 80, 100, 'critical'));
            readings.add(new TelemetryReading('Load Capacity', 72, '%', 0, 80, 'normal'));
            readings.add(new TelemetryReading('Internal Temp', 42, '°C', 15, 40, 'warning'));
            readings.add(new TelemetryReading('Input Voltage', 478, 'V', 456, 504, 'normal'));
            readings.add(new TelemetryReading('Runtime Remaining', 12, 'min', 15, 60, 'warning'));
            readings.add(new TelemetryReading('Charge Cycles', 847, 'cycles', 0, 1000, 'warning'));
        } else if (productName != null && productName.contains('olt')) {
            readings.add(new TelemetryReading('Temperature', 38, '°C', 10, 45, 'normal'));
            readings.add(new TelemetryReading('CPU Utilization', 42, '%', 0, 85, 'normal'));
            readings.add(new TelemetryReading('Optical Power Rx', -19, 'dBm', -28, -8, 'normal'));
            readings.add(new TelemetryReading('Active Ports', 14, 'ports', 1, 16, 'normal'));
        } else {
            readings.add(new TelemetryReading('Temperature', 35, '°C', 10, 50, 'normal'));
            readings.add(new TelemetryReading('Power Draw', 2.4, 'kW', 0, 4, 'normal'));
        }

        return readings;
    }

    private static Boolean checkUpcomingMaintenance(Id assetId) {
        Integer count = [
            SELECT COUNT()
            FROM WorkOrder
            WHERE AssetId = :assetId
            AND Status NOT IN ('Completed', 'Closed', 'Canceled')
        ];
        return count > 0;
    }

    private static Id getUpcomingWorkOrderId(Id assetId) {
        List<WorkOrder> wos = [
            SELECT Id
            FROM WorkOrder
            WHERE AssetId = :assetId
            AND Status NOT IN ('Completed', 'Closed', 'Canceled')
            ORDER BY StartDate ASC
            LIMIT 1
        ];
        return wos.isEmpty() ? null : wos[0].Id;
    }

    // Wrapper classes
    public class PredictiveData {
        @AuraEnabled public Id assetId { get; set; }
        @AuraEnabled public String assetName { get; set; }
        @AuraEnabled public String productName { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public Date installDate { get; set; }
        @AuraEnabled public String accountName { get; set; }
        @AuraEnabled public String locationName { get; set; }
        @AuraEnabled public String parentAssetName { get; set; }
        @AuraEnabled public Integer healthScore { get; set; }
        @AuraEnabled public Integer failureProbability { get; set; }
        @AuraEnabled public Date predictedFailureDate { get; set; }
        @AuraEnabled public Integer daysUntilFailure { get; set; }
        @AuraEnabled public String recommendation { get; set; }
        @AuraEnabled public String riskLevel { get; set; }
        @AuraEnabled public List<TelemetryReading> telemetryData { get; set; }
        @AuraEnabled public Boolean hasUpcomingMaintenance { get; set; }
        @AuraEnabled public Id upcomingWorkOrderId { get; set; }
    }

    public class TelemetryReading {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public Decimal value { get; set; }
        @AuraEnabled public String unit { get; set; }
        @AuraEnabled public Decimal minThreshold { get; set; }
        @AuraEnabled public Decimal maxThreshold { get; set; }
        @AuraEnabled public String status { get; set; }

        public TelemetryReading(String n, Decimal v, String u, Decimal minT, Decimal maxT, String s) {
            this.name = n;
            this.value = v;
            this.unit = u;
            this.minThreshold = minT;
            this.maxThreshold = maxT;
            this.status = s;
        }
    }

    public class WorkOrderOption {
        @AuraEnabled public Id workOrderId { get; set; }
        @AuraEnabled public String workOrderNumber { get; set; }
        @AuraEnabled public String subject { get; set; }
        @AuraEnabled public String status { get; set; }
        @AuraEnabled public Boolean hasAppointment { get; set; }
    }
}
