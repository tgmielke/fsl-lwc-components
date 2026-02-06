/**
 * Service Appointment Status Update Component
 * For Field Service Mobile - Offline Capable
 *
 * Features:
 * - View current SA status
 * - Suggest next status (Travel, In Progress, Completed)
 * - Block appointment (Cannot Complete) with reason
 * - Trigger RSO for blocked appointments (including dependency chains)
 */
import { LightningElement, api, wire, track } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import { updateRecord } from 'lightning/uiRecordApi';
import SA_ID from '@salesforce/schema/ServiceAppointment.Id';
import SA_STATUS from '@salesforce/schema/ServiceAppointment.Status';

// Apex methods for RSO
import triggerRSOForBlockedAppointment from '@salesforce/apex/SAStatusUpdateController.triggerRSOForBlockedAppointment';
import getAppointmentChain from '@salesforce/apex/SAStatusUpdateController.getAppointmentChain';

// Status configuration
const STATUS_CONFIG = {
    'None': { next: ['Scheduled'], color: '#706e6b', icon: 'utility:clock' },
    'Scheduled': { next: ['Dispatched', 'Travel'], color: '#0070d2', icon: 'utility:event' },
    'Dispatched': { next: ['Travel', 'In Progress'], color: '#ff9a3c', icon: 'utility:routing_offline' },
    'Travel': { next: ['In Progress'], color: '#1589ee', icon: 'utility:travel_and_places' },
    'In Progress': { next: ['Completed', 'Cannot Complete'], color: '#04844b', icon: 'utility:activity' },
    'Completed': { next: [], color: '#2e844a', icon: 'utility:check' },
    'Cannot Complete': { next: [], color: '#c23934', icon: 'utility:close' },
    'Canceled': { next: [], color: '#706e6b', icon: 'utility:ban' }
};

const BLOCK_REASONS = [
    { label: 'Customer Not Available', value: 'Customer Not Available' },
    { label: 'Equipment Failure', value: 'Equipment Failure' },
    { label: 'Parts Not Available', value: 'Parts Not Available' },
    { label: 'Access Issue', value: 'Access Issue' },
    { label: 'Weather Conditions', value: 'Weather Conditions' },
    { label: 'Safety Concern', value: 'Safety Concern' },
    { label: 'Dependency Not Complete', value: 'Dependency Not Complete' },
    { label: 'Other', value: 'Other' }
];

export default class SaStatusUpdate extends LightningElement {
    @api recordId;

    @track isProcessing = false;
    @track showBlockModal = false;
    @track blockReason = '';
    @track blockNotes = '';
    @track dependentAppointments = [];
    @track showDependencyWarning = false;

    blockReasons = BLOCK_REASONS;

    // GraphQL query for Service Appointment details
    @wire(graphql, {
        query: gql`
            query getServiceAppointmentDetails($recordId: ID!) {
                uiapi {
                    query {
                        ServiceAppointment(where: { Id: { eq: $recordId } }) {
                            edges {
                                node {
                                    Id
                                    AppointmentNumber { value }
                                    Status { value }
                                    StatusCategory { value }
                                    Subject { value }
                                    SchedStartTime { value }
                                    SchedEndTime { value }
                                    FSL__Time_Dependency__c { value }
                                    FSL__Related_Service__c { value }
                                    ServiceTerritoryId { value }
                                    ServiceTerritory {
                                        Name { value }
                                    }
                                    ParentRecordId { value }
                                    Account {
                                        Name { value }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        variables: '$queryVariables'
    })
    serviceAppointmentResult;

    get queryVariables() {
        return { recordId: this.recordId };
    }

    // Process the GraphQL result
    get serviceAppointment() {
        if (this.serviceAppointmentResult?.data?.uiapi?.query?.ServiceAppointment?.edges?.length > 0) {
            return this.serviceAppointmentResult.data.uiapi.query.ServiceAppointment.edges[0].node;
        }
        return null;
    }

    // Computed properties
    get appointmentNumber() {
        return this.serviceAppointment?.AppointmentNumber?.value || 'Loading...';
    }

    get currentStatus() {
        return this.serviceAppointment?.Status?.value || 'None';
    }

    get subject() {
        return this.serviceAppointment?.Subject?.value || 'Service Appointment';
    }

    get accountName() {
        return this.serviceAppointment?.Account?.Name?.value || 'N/A';
    }

    get territoryName() {
        return this.serviceAppointment?.ServiceTerritory?.Name?.value || 'N/A';
    }

    get scheduledTime() {
        const start = this.serviceAppointment?.SchedStartTime?.value;
        if (start) {
            return new Date(start).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        }
        return 'Not Scheduled';
    }

    get hasDependency() {
        return this.serviceAppointment?.FSL__Related_Service__c?.value != null ||
               this.serviceAppointment?.FSL__Time_Dependency__c?.value != null;
    }

    get dependencyType() {
        return this.serviceAppointment?.FSL__Time_Dependency__c?.value || '';
    }

    get statusConfig() {
        return STATUS_CONFIG[this.currentStatus] || STATUS_CONFIG['None'];
    }

    get statusColor() {
        return `color: ${this.statusConfig.color}; font-weight: 600;`;
    }

    get statusIcon() {
        return this.statusConfig.icon;
    }

    get nextStatusOptions() {
        const config = this.statusConfig;
        return config.next.map(status => ({
            label: status,
            value: status,
            variant: status === 'Completed' ? 'success' : 'neutral',
            icon: STATUS_CONFIG[status]?.icon || 'utility:forward'
        }));
    }

    get canUpdateStatus() {
        return this.statusConfig.next.length > 0;
    }

    get showBlockButton() {
        return this.currentStatus !== 'Cannot Complete' &&
               this.currentStatus !== 'Completed' &&
               this.currentStatus !== 'Canceled';
    }

    get isBlockReasonSelected() {
        return this.blockReason && this.blockReason.trim() !== '';
    }

    // Event handlers
    handleStatusUpdate(event) {
        const newStatus = event.target.dataset.status;
        this.updateAppointmentStatus(newStatus);
    }

    async updateAppointmentStatus(newStatus) {
        this.isProcessing = true;
        try {
            const fields = {};
            fields[SA_ID.fieldApiName] = this.recordId;
            fields[SA_STATUS.fieldApiName] = newStatus;

            await updateRecord({ fields });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Status Updated',
                message: `Appointment status changed to ${newStatus}`,
                variant: 'success'
            }));

        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to update status',
                variant: 'error'
            }));
        } finally {
            this.isProcessing = false;
        }
    }

    handleBlockClick() {
        this.showBlockModal = true;
        this.loadDependentAppointments();
    }

    handleCloseBlockModal() {
        this.showBlockModal = false;
        this.blockReason = '';
        this.blockNotes = '';
        this.dependentAppointments = [];
        this.showDependencyWarning = false;
    }

    handleBlockReasonChange(event) {
        this.blockReason = event.detail.value;
    }

    handleBlockNotesChange(event) {
        this.blockNotes = event.target.value;
    }

    async loadDependentAppointments() {
        try {
            const chainData = await getAppointmentChain({ appointmentId: this.recordId });
            if (chainData && chainData.length > 0) {
                this.dependentAppointments = chainData;
                this.showDependencyWarning = true;
            }
        } catch (error) {
            console.error('Error loading dependencies:', error);
        }
    }

    async handleConfirmBlock() {
        if (!this.blockReason) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: 'Please select a block reason',
                variant: 'error'
            }));
            return;
        }

        this.isProcessing = true;
        try {
            // Update status to Cannot Complete
            const fields = {};
            fields[SA_ID.fieldApiName] = this.recordId;
            fields[SA_STATUS.fieldApiName] = 'Cannot Complete';

            await updateRecord({ fields });

            // Trigger RSO for this appointment and dependencies
            const rsoResult = await triggerRSOForBlockedAppointment({
                appointmentId: this.recordId,
                blockReason: this.blockReason,
                blockNotes: this.blockNotes
            });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Appointment Blocked',
                message: `RSO triggered for ${rsoResult.rsoCount} resource(s)`,
                variant: 'success'
            }));

            this.handleCloseBlockModal();

        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to block appointment',
                variant: 'error'
            }));
        } finally {
            this.isProcessing = false;
        }
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }
}
