/**
 * Predictive Maintenance Component
 * Shows AI-powered failure predictions for assets with action to add preventive work
 * For Asset record page (desktop)
 */
import { LightningElement, api, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import getPredictiveData from '@salesforce/apex/PredictiveMaintenanceController.getPredictiveData';
import getLocationWorkOrders from '@salesforce/apex/PredictiveMaintenanceController.getLocationWorkOrders';
import createPreventiveWorkPlan from '@salesforce/apex/PredictiveMaintenanceController.createPreventiveWorkPlan';

export default class PredictiveMaintenance extends NavigationMixin(LightningElement) {
    @api recordId;

    @track data;
    @track workOrders = [];
    @track selectedWorkOrderId;
    @track isLoading = true;
    @track isCreating = false;
    @track showWorkOrderModal = false;
    @track workPlanCreated = false;
    @track createdWorkPlanId;

    wiredDataResult;

    @wire(getPredictiveData, { assetId: '$recordId' })
    wiredData(result) {
        this.wiredDataResult = result;
        if (result.data) {
            this.data = result.data;
            this.isLoading = false;
        } else if (result.error) {
            console.error('Error loading predictive data:', result.error);
            this.isLoading = false;
        }
    }

    @wire(getLocationWorkOrders, { assetId: '$recordId' })
    wiredWorkOrders({ data, error }) {
        if (data) {
            this.workOrders = data;
        }
    }

    // Computed properties
    get hasData() {
        return this.data != null;
    }

    get isHighRisk() {
        return this.data?.riskLevel === 'High';
    }

    get isMediumRisk() {
        return this.data?.riskLevel === 'Medium';
    }

    get isLowRisk() {
        return this.data?.riskLevel === 'Low';
    }

    get riskBadgeClass() {
        if (this.isHighRisk) return 'slds-badge slds-theme_error';
        if (this.isMediumRisk) return 'slds-badge slds-theme_warning';
        return 'slds-badge slds-theme_success';
    }

    get healthScoreClass() {
        const score = this.data?.healthScore || 0;
        if (score < 60) return 'health-score critical';
        if (score < 80) return 'health-score warning';
        return 'health-score good';
    }

    get healthScoreStyle() {
        const score = this.data?.healthScore || 0;
        let color = '#2e844a'; // Green
        if (score < 60) color = '#ba0517'; // Red
        else if (score < 80) color = '#fe9339'; // Orange
        return `--health-score-rotation: ${(score / 100) * 180}deg; --health-score-color: ${color};`;
    }

    get failureProbabilityStyle() {
        const prob = this.data?.failureProbability || 0;
        return `width: ${prob}%;`;
    }

    get failureProbabilityClass() {
        const prob = this.data?.failureProbability || 0;
        if (prob >= 70) return 'probability-bar critical';
        if (prob >= 40) return 'probability-bar warning';
        return 'probability-bar low';
    }

    get formattedPredictedDate() {
        if (!this.data?.predictedFailureDate) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(this.data.predictedFailureDate).toLocaleDateString('en-US', options);
    }

    get daysUntilDisplay() {
        const days = this.data?.daysUntilFailure;
        if (days == null) return '';
        return `${days} days`;
    }

    get daysUntilClass() {
        const days = this.data?.daysUntilFailure;
        if (days == null) return 'days-until-display';
        if (days <= 30) return 'days-until-display critical';
        if (days <= 60) return 'days-until-display warning';
        return 'days-until-display normal';
    }

    get telemetryReadings() {
        return (this.data?.telemetryData || []).map(reading => ({
            ...reading,
            displayValue: `${reading.value} ${reading.unit}`,
            thresholdDisplay: `Threshold: ${reading.minThreshold} - ${reading.maxThreshold} ${reading.unit}`,
            statusClass: this.getReadingStatusClass(reading.status),
            statusIcon: this.getReadingStatusIcon(reading.status),
            statusLabel: this.getReadingStatusLabel(reading.status),
            barStyle: this.getReadingBarStyle(reading),
            barClass: this.getReadingBarClass(reading.status),
            itemClass: this.getReadingItemClass(reading.status)
        }));
    }

    get workOrderOptions() {
        return this.workOrders.map(wo => ({
            label: `${wo.workOrderNumber} - ${wo.subject}`,
            value: wo.workOrderId,
            description: wo.status + (wo.hasAppointment ? ' (Scheduled)' : '')
        }));
    }

    get hasWorkOrders() {
        return this.workOrders.length > 0;
    }

    get showAddWorkButton() {
        return this.data?.failureProbability >= 40 && !this.workPlanCreated;
    }

    get isAddButtonDisabled() {
        return !this.selectedWorkOrderId;
    }

    get cardTitle() {
        return 'Predictive Maintenance';
    }

    get cardIconName() {
        return 'standard:insights';
    }

    // Helper methods
    getReadingStatusClass(status) {
        if (status === 'critical') return 'reading-status critical';
        if (status === 'warning') return 'reading-status warning';
        return 'reading-status normal';
    }

    getReadingStatusIcon(status) {
        if (status === 'critical') return 'utility:error';
        if (status === 'warning') return 'utility:warning';
        return 'utility:success';
    }

    getReadingBarStyle(reading) {
        const range = reading.maxThreshold - reading.minThreshold;
        const percentage = ((reading.value - reading.minThreshold) / range) * 100;
        return `width: ${Math.max(0, Math.min(100, percentage))}%;`;
    }

    getReadingBarClass(status) {
        if (status === 'critical') return 'reading-bar critical';
        if (status === 'warning') return 'reading-bar warning';
        return 'reading-bar normal';
    }

    getReadingStatusLabel(status) {
        if (status === 'critical') return 'OUT OF THRESHOLD';
        if (status === 'warning') return 'NEAR THRESHOLD';
        return 'WITHIN THRESHOLD';
    }

    getReadingItemClass(status) {
        if (status === 'critical') return 'telemetry-item critical';
        if (status === 'warning') return 'telemetry-item warning';
        return 'telemetry-item normal';
    }

    // Event handlers
    handleAddPreventiveWork() {
        // Check if there's already an upcoming maintenance WO for this asset
        if (this.data?.upcomingWorkOrderId) {
            this.selectedWorkOrderId = this.data.upcomingWorkOrderId;
            this.createWorkPlan();
        } else if (this.workOrders.length > 0) {
            this.showWorkOrderModal = true;
        } else {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No Work Orders Available',
                message: 'No upcoming work orders found at this location. Create a new work order first.',
                variant: 'warning'
            }));
        }
    }

    handleWorkOrderSelect(event) {
        this.selectedWorkOrderId = event.detail.value;
    }

    handleCloseModal() {
        this.showWorkOrderModal = false;
        this.selectedWorkOrderId = null;
    }

    handleConfirmWorkOrder() {
        if (this.selectedWorkOrderId) {
            this.createWorkPlan();
        }
    }

    async createWorkPlan() {
        this.isCreating = true;
        this.showWorkOrderModal = false;

        try {
            const workPlanId = await createPreventiveWorkPlan({
                workOrderId: this.selectedWorkOrderId,
                assetId: this.recordId,
                predictionData: JSON.stringify(this.data)
            });

            this.createdWorkPlanId = workPlanId;
            this.workPlanCreated = true;

            this.dispatchEvent(new ShowToastEvent({
                title: 'Preventive Work Plan Created',
                message: 'A 7-step inspection work plan has been added to the selected work order.',
                variant: 'success'
            }));

            // Refresh the data
            refreshApex(this.wiredDataResult);

        } catch (error) {
            console.error('Error creating work plan:', error);
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to create preventive work plan',
                variant: 'error'
            }));
        } finally {
            this.isCreating = false;
        }
    }

    handleViewWorkOrder() {
        if (this.selectedWorkOrderId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.selectedWorkOrderId,
                    objectApiName: 'WorkOrder',
                    actionName: 'view'
                }
            });
        }
    }

    handleViewWorkPlan() {
        if (this.createdWorkPlanId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.createdWorkPlanId,
                    objectApiName: 'WorkPlan',
                    actionName: 'view'
                }
            });
        }
    }
}
