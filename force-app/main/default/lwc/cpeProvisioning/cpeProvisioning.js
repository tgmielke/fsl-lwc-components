/**
 * CPE Provisioning & Activation Component
 * For Field Service Mobile - Offline Capable
 *
 * Simulates interaction with legacy ADAPT system for ONT/CPE provisioning
 * Demo Context: Used for Haven Enterprises SASE circuit activation workflow
 */
import { LightningElement, api, wire, track } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import { getBarcodeScanner } from 'lightning/mobileCapabilities';

// ADAPT System Status Codes (simulated)
const ADAPT_STATUS = {
    DISCONNECTED: 'Disconnected',
    CONNECTING: 'Connecting...',
    CONNECTED: 'Connected',
    VALIDATING: 'Validating...',
    VALIDATED: 'Validated',
    PROVISIONING: 'Provisioning...',
    PROVISIONED: 'Provisioned',
    ACTIVATING: 'Activating...',
    ACTIVATED: 'Activated',
    ERROR: 'Error'
};

export default class CpeProvisioning extends LightningElement {
    @api recordId; // Service Appointment Id

    @track currentStep = 1;
    @track adaptStatus = ADAPT_STATUS.DISCONNECTED;
    @track isProcessing = false;
    @track errorMessage = '';
    @track provisioningComplete = false;

    // CPE/Asset data
    @track serialNumber = '';
    @track macAddress = '';
    @track assetName = '';
    @track assetId = '';
    @track workOrderNumber = '';
    @track accountName = '';

    // Manual serial entry (for barcode scan or manual input)
    @track manualSerialNumber = '';
    @track manualSerialEntered = false;
    @track isChangingCpe = false;

    // Signal test results (simulated)
    @track signalStrength = null;
    @track opticalPower = null;
    @track connectionSpeed = null;

    // Provisioning log
    @track provisioningLog = [];

    // Barcode scanner
    barcodeScanner;

    connectedCallback() {
        // Initialize barcode scanner if available
        this.barcodeScanner = getBarcodeScanner();
    }

    // GraphQL query for Service Appointment and related Asset data
    // Using uiGraphQLApi for offline support
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
        return {
            recordId: this.recordId
        };
    }

    // Process the GraphQL result
    get serviceAppointment() {
        if (this.serviceAppointmentResult?.data?.uiapi?.query?.ServiceAppointment?.edges?.length > 0) {
            return this.serviceAppointmentResult.data.uiapi.query.ServiceAppointment.edges[0].node;
        }
        return null;
    }

    // Wire for Work Order details
    @wire(graphql, {
        query: gql`
            query getWorkOrderDetails($workOrderId: ID!) {
                uiapi {
                    query {
                        WorkOrder(where: { Id: { eq: $workOrderId } }) {
                            edges {
                                node {
                                    Id
                                    WorkOrderNumber { value }
                                    Subject { value }
                                    AssetId { value }
                                    Asset {
                                        Id
                                        Name { value }
                                        SerialNumber { value }
                                        Product2 {
                                            Name { value }
                                            Family { value }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        variables: '$workOrderVariables'
    })
    workOrderResult;

    get workOrderVariables() {
        if (this.serviceAppointment?.ParentRecordId?.value) {
            return {
                workOrderId: this.serviceAppointment.ParentRecordId.value
            };
        }
        return { workOrderId: '' };
    }

    get workOrder() {
        if (this.workOrderResult?.data?.uiapi?.query?.WorkOrder?.edges?.length > 0) {
            return this.workOrderResult.data.uiapi.query.WorkOrder.edges[0].node;
        }
        return null;
    }

    // Computed properties for display
    get appointmentNumber() {
        return this.serviceAppointment?.AppointmentNumber?.value || 'Loading...';
    }

    get displayWorkOrderNumber() {
        return this.workOrder?.WorkOrderNumber?.value || 'Loading...';
    }

    get displayAccountName() {
        return this.serviceAppointment?.Account?.Name?.value || 'N/A';
    }

    get displayAssetName() {
        return this.workOrder?.Asset?.Name?.value || 'No CPE Assigned';
    }

    get displaySerialNumber() {
        if (this.manualSerialEntered) {
            return this.manualSerialNumber;
        }
        return this.workOrder?.Asset?.SerialNumber?.value || 'N/A';
    }

    get displayProductName() {
        return this.workOrder?.Asset?.Product2?.Name?.value || 'N/A';
    }

    get hasAsset() {
        return this.workOrder?.Asset?.Id != null || this.manualSerialEntered;
    }

    get showCpeDisplay() {
        // Show display when we have an asset AND not actively changing it
        return this.hasAsset && !this.isChangingCpe;
    }

    get isManualSerialEmpty() {
        return !this.manualSerialNumber || this.manualSerialNumber.trim() === '';
    }

    get disableStartProvisioning() {
        return this.isProcessing || (!this.workOrder?.Asset?.Id && !this.manualSerialEntered);
    }

    // Step indicators
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }

    // Step dot classes
    get step1Class() { return this.currentStep >= 1 ? 'step-dot active' : 'step-dot'; }
    get step2Class() { return this.currentStep >= 2 ? 'step-dot active' : 'step-dot'; }
    get step3Class() { return this.currentStep >= 3 ? 'step-dot active' : 'step-dot'; }
    get step4Class() { return this.currentStep >= 4 ? 'step-dot active' : 'step-dot'; }

    get signalClass() {
        if (!this.signalStrength) return '';
        const strength = parseInt(this.signalStrength);
        if (strength >= -20) return 'signal-excellent';
        if (strength >= -25) return 'signal-good';
        return 'signal-fair';
    }

    get adaptStatusClass() {
        if (this.adaptStatus === ADAPT_STATUS.ERROR) {
            return 'slds-badge_inverse slds-theme_error';
        }
        if (this.adaptStatus === ADAPT_STATUS.ACTIVATED || this.adaptStatus === ADAPT_STATUS.PROVISIONED) {
            return 'slds-badge_inverse slds-theme_success';
        }
        if (this.adaptStatus.includes('...')) {
            return 'slds-badge_lightest';
        }
        return '';
    }

    get signalValueClass() {
        if (!this.signalStrength) return 'signal-value';
        const strength = parseInt(this.signalStrength);
        if (strength >= -20) return 'signal-value signal-excellent';
        if (strength >= -25) return 'signal-value signal-good';
        return 'signal-value signal-fair';
    }

    // Manual serial number handlers
    handleManualSerialChange(event) {
        this.manualSerialNumber = event.target.value;
    }

    handleUseManualSerial() {
        if (this.manualSerialNumber && this.manualSerialNumber.trim() !== '') {
            this.manualSerialEntered = true;
            this.isChangingCpe = false;
            this.addLog(`CPE set: ${this.manualSerialNumber}`, 'info');
        }
    }

    handleChangeCpe() {
        this.isChangingCpe = true;
        this.manualSerialNumber = '';
    }

    handleScanBarcode() {
        if (this.barcodeScanner && this.barcodeScanner.isAvailable()) {
            const scanningOptions = {
                barcodeTypes: [
                    this.barcodeScanner.barcodeTypes.CODE_128,
                    this.barcodeScanner.barcodeTypes.CODE_39,
                    this.barcodeScanner.barcodeTypes.QR,
                    this.barcodeScanner.barcodeTypes.EAN_13,
                    this.barcodeScanner.barcodeTypes.EAN_8
                ],
                instructionText: 'Scan CPE serial number barcode',
                successText: 'Serial captured!'
            };

            this.barcodeScanner
                .beginCapture(scanningOptions)
                .then((result) => {
                    this.manualSerialNumber = result.value;
                    this.manualSerialEntered = true;
                    this.addLog(`Barcode scanned: ${result.value}`, 'success');
                    this.barcodeScanner.endCapture();
                })
                .catch((error) => {
                    this.addLog(`Scan error: ${error.message}`, 'error');
                    this.barcodeScanner.endCapture();
                });
        } else {
            // Simulate barcode scan for demo/desktop testing
            const simulatedSerial = 'ONT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            this.manualSerialNumber = simulatedSerial;
            this.manualSerialEntered = true;
            this.addLog(`Simulated scan: ${simulatedSerial}`, 'success');

            this.dispatchEvent(new ShowToastEvent({
                title: 'Barcode Simulated',
                message: 'Scanner not available - using simulated serial for demo',
                variant: 'info'
            }));
        }
    }

    // Log helper
    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        this.provisioningLog = [...this.provisioningLog, {
            id: Date.now(),
            timestamp,
            message,
            type,
            iconName: type === 'success' ? 'utility:success' :
                      type === 'error' ? 'utility:error' : 'utility:info'
        }];
    }

    // Simulated ADAPT system interaction
    async connectToADAPT() {
        this.isProcessing = true;
        this.adaptStatus = ADAPT_STATUS.CONNECTING;
        const customerContext = this.displayAccountName !== 'N/A' ? ` for ${this.displayAccountName}` : '';
        this.addLog(`Connecting to ADAPT${customerContext}...`, 'info');

        await this.delay(1500);

        this.adaptStatus = ADAPT_STATUS.CONNECTED;
        this.addLog('ADAPT connection established', 'success');
        if (this.displayWorkOrderNumber !== 'Loading...') {
            this.addLog(`WO: ${this.displayWorkOrderNumber}`, 'info');
        }
        this.currentStep = 2;
        this.isProcessing = false;
    }

    async validateSerial() {
        this.isProcessing = true;
        this.adaptStatus = ADAPT_STATUS.VALIDATING;
        const serial = this.manualSerialEntered ? this.manualSerialNumber : this.displaySerialNumber;
        this.addLog(`Validating: ${serial}`, 'info');

        await this.delay(2000);

        this.adaptStatus = ADAPT_STATUS.VALIDATED;
        this.addLog('Serial validated', 'success');
        this.addLog(`MAC: ${this.generateMacAddress()}`, 'info');
        this.isProcessing = false;
    }

    async provisionCPE() {
        this.isProcessing = true;
        this.adaptStatus = ADAPT_STATUS.PROVISIONING;
        this.addLog('Provisioning CPE...', 'info');

        await this.delay(1000);
        this.addLog('Creating service profile', 'info');

        await this.delay(1500);
        this.addLog('Configuring VLAN', 'info');

        await this.delay(1000);
        this.addLog('Setting QoS parameters', 'info');

        await this.delay(1500);

        this.adaptStatus = ADAPT_STATUS.PROVISIONED;
        this.addLog('CPE provisioned', 'success');
        this.currentStep = 3;
        this.isProcessing = false;
    }

    async runSignalTest() {
        this.isProcessing = true;
        this.addLog('Running signal test...', 'info');

        await this.delay(2000);

        // Simulate signal test results
        this.signalStrength = '-' + (Math.floor(Math.random() * 10) + 18) + ' dBm';
        this.opticalPower = (Math.random() * 2 + 1).toFixed(2) + ' mW';
        this.connectionSpeed = '1 Gbps';

        this.addLog(`Signal: ${this.signalStrength}`, 'success');
        this.isProcessing = false;
    }

    async activateService() {
        this.isProcessing = true;
        this.adaptStatus = ADAPT_STATUS.ACTIVATING;
        this.addLog('Activating service...', 'info');

        await this.delay(2000);
        this.addLog('Enabling data path', 'info');

        await this.delay(1500);
        this.addLog('Verifying connectivity', 'info');

        await this.delay(1000);

        this.adaptStatus = ADAPT_STATUS.ACTIVATED;
        const customerContext = this.displayAccountName !== 'N/A' ? ` - ${this.displayAccountName}` : '';
        this.addLog(`SERVICE ACTIVATED${customerContext}`, 'success');
        this.currentStep = 4;
        this.provisioningComplete = true;
        this.isProcessing = false;

        const toastMessage = this.displayAccountName !== 'N/A'
            ? `CPE provisioned and service activated for ${this.displayAccountName}`
            : 'CPE provisioned and service activated';

        this.dispatchEvent(new ShowToastEvent({
            title: 'Provisioning Complete',
            message: toastMessage,
            variant: 'success'
        }));
    }

    // Button handlers
    handleStartProvisioning() {
        this.connectToADAPT();
    }

    async handleStep2Actions() {
        await this.validateSerial();
        await this.delay(500);
        await this.provisionCPE();
    }

    handleRunSignalTest() {
        this.runSignalTest();
    }

    handleActivate() {
        this.activateService();
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateMacAddress() {
        const hex = '0123456789ABCDEF';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            mac += hex.charAt(Math.floor(Math.random() * 16));
            mac += hex.charAt(Math.floor(Math.random() * 16));
            if (i < 5) mac += ':';
        }
        return mac;
    }
}
