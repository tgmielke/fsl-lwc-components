/**
 * Order Progress Mobile Component
 * For Field Service Mobile - Offline Capable
 *
 * Shows parent Order's orchestration journey from Work Order context.
 * Card-based UI with dependency badges and expandable stage details.
 *
 * Demo Context: Haven Enterprises SASE circuit installation - 7 stage journey
 */
import { LightningElement, api, wire, track } from 'lwc';
import { gql, graphql } from 'lightning/uiGraphQLApi';

// Orchestration stages matching the demo story
const ORCHESTRATION_STAGES = [
    {
        stage: 1,
        name: 'Order Intake',
        description: 'Order received, validated, and credit approved',
        icon: 'utility:new',
        dependencies: [],
        parallelWith: [],
        steps: [
            { name: 'Validate Order Details', complete: true },
            { name: 'Credit Check', complete: true },
            { name: 'Assign Project Manager', complete: true }
        ],
        fieldTechInfo: 'Order was processed by the sales team. Contract value: ~$67K.',
        estimatedDuration: '1-2 days'
    },
    {
        stage: 2,
        name: 'Design & Planning',
        description: 'Technical design and customer approval',
        icon: 'utility:strategy',
        dependencies: [{ stage: 1, type: 'finish-to-start', label: 'Order Intake' }],
        parallelWith: [],
        steps: [
            { name: 'Schedule Site Survey', complete: true },
            { name: 'Complete Network Design', complete: true },
            { name: 'Customer Design Approval', complete: true }
        ],
        fieldTechInfo: 'Design team completed network architecture. Site survey completed.',
        estimatedDuration: '3-5 days'
    },
    {
        stage: 3,
        name: 'Procurement',
        description: 'Hardware ordering and configuration',
        icon: 'utility:package',
        dependencies: [{ stage: 2, type: 'finish-to-start', label: 'Design & Planning' }],
        parallelWith: [],
        steps: [
            { name: 'Order CPE Equipment', complete: true },
            { name: 'Stage & Configure Hardware', complete: true },
            { name: 'Quality Verification', complete: true }
        ],
        fieldTechInfo: 'CPE hardware staged and configured. Ready for field installation.',
        estimatedDuration: '5-7 days'
    },
    {
        stage: 4,
        name: 'Construction',
        description: 'Physical circuit build and verification',
        icon: 'utility:builder',
        dependencies: [{ stage: 3, type: 'finish-to-start', label: 'Procurement' }],
        parallelWith: [],
        steps: [
            { name: 'Fiber Path Construction', complete: true },
            { name: 'Splice Completion', complete: true },
            { name: 'Path Verification Test', complete: true }
        ],
        fieldTechInfo: 'Fiber construction complete. Circuit path verified and tested.',
        estimatedDuration: '7-14 days'
    },
    {
        stage: 5,
        name: 'Field Installation',
        description: 'On-site CPE installation and activation',
        icon: 'utility:travel_and_places',
        dependencies: [{ stage: 4, type: 'finish-to-start', label: 'Construction' }],
        parallelWith: [{ label: 'Remote Config Team', type: 'same-start' }],
        steps: [
            { name: 'Dispatch Field Technician', complete: true },
            { name: 'CPE Installation', complete: false },
            { name: 'Circuit Activation', complete: false },
            { name: 'Signal Verification', complete: false }
        ],
        fieldTechInfo: 'YOUR TASK: Install CPE at Haven DC, activate circuit, verify signal levels.',
        estimatedDuration: '4-6 hours'
    },
    {
        stage: 6,
        name: 'Testing & Turnup',
        description: 'End-to-end testing and customer acceptance',
        icon: 'utility:check',
        dependencies: [{ stage: 5, type: 'finish-to-start', label: 'Field Installation' }],
        parallelWith: [],
        steps: [
            { name: 'End-to-End Testing', complete: false },
            { name: 'Speed Verification', complete: false },
            { name: 'Customer Acceptance', complete: false }
        ],
        fieldTechInfo: 'After installation, NOC will run end-to-end tests before customer sign-off.',
        estimatedDuration: '1-2 days'
    },
    {
        stage: 7,
        name: 'Billing Activation',
        description: 'Billing activation and order closure',
        icon: 'utility:money',
        dependencies: [{ stage: 6, type: 'finish-to-start', label: 'Testing & Turnup' }],
        parallelWith: [],
        steps: [
            { name: 'Activate Billing', complete: false },
            { name: 'Send Welcome Kit', complete: false },
            { name: 'Close Order', complete: false }
        ],
        fieldTechInfo: 'Billing team activates recurring charges after customer acceptance.',
        estimatedDuration: '1 day'
    }
];

// Current stage for demo (Stage 5 - Field Installation)
const CURRENT_STAGE = 5;

export default class OrderProgressMobile extends LightningElement {
    @api recordId;

    @track expandedStages = new Set([CURRENT_STAGE]); // Current stage expanded by default
    @track isLoading = true;

    // GraphQL query for Work Order with parent Order details
    @wire(graphql, {
        query: gql`
            query getWorkOrderWithOrder($recordId: ID!) {
                uiapi {
                    query {
                        WorkOrder(where: { Id: { eq: $recordId } }) {
                            edges {
                                node {
                                    Id
                                    WorkOrderNumber { value }
                                    Subject { value }
                                    COM_Order__c { value }
                                    COM_Order__r {
                                        Id
                                        Name { value }
                                        COM_Fulfillment_State__c { value }
                                        COM_Fulfillment_Message__c { value }
                                        COM_Fulfillment_StepType__c { value }
                                        Account {
                                            Name { value }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        variables: '$graphqlVariables'
    })
    handleWorkOrderResult({ data, errors }) {
        this.isLoading = false;
        if (errors) {
            console.error('GraphQL errors:', errors);
        }
        if (data) {
            const edges = data?.uiapi?.query?.WorkOrder?.edges;
            if (edges && edges.length > 0) {
                this._workOrderData = edges[0].node;
            }
        }
    }

    _workOrderData;

    get graphqlVariables() {
        return { recordId: this.recordId };
    }

    get workOrderNumber() {
        return this._workOrderData?.WorkOrderNumber?.value || 'Loading...';
    }

    get workOrderSubject() {
        return this._workOrderData?.Subject?.value || '';
    }

    get hasParentOrder() {
        return !!this._workOrderData?.COM_Order__c?.value;
    }

    get orderName() {
        return this._workOrderData?.COM_Order__r?.Name?.value || 'No linked order';
    }

    get accountName() {
        return this._workOrderData?.COM_Order__r?.Account?.Name?.value || '';
    }

    get fulfillmentState() {
        return this._workOrderData?.COM_Order__r?.COM_Fulfillment_State__c?.value || 'Not Started';
    }

    get fulfillmentMessage() {
        return this._workOrderData?.COM_Order__r?.COM_Fulfillment_Message__c?.value || '';
    }

    get progressPercentage() {
        const completedStages = CURRENT_STAGE - 1;
        const totalStages = ORCHESTRATION_STAGES.length;
        const currentProgress = 0.3; // Partial progress in current stage
        return Math.round(((completedStages + currentProgress) / totalStages) * 100);
    }

    get progressStyle() {
        return `width: ${this.progressPercentage}%`;
    }

    get currentStageNumber() {
        return CURRENT_STAGE;
    }

    get currentStageName() {
        const current = ORCHESTRATION_STAGES.find(s => s.stage === CURRENT_STAGE);
        return current ? current.name : '';
    }

    get stages() {
        return ORCHESTRATION_STAGES.map(stage => {
            let status = 'pending';
            let statusLabel = 'Pending';
            let statusClass = 'stage-pending';
            let statusIcon = 'utility:clock';

            if (stage.stage < CURRENT_STAGE) {
                status = 'completed';
                statusLabel = 'Complete';
                statusClass = 'stage-completed';
                statusIcon = 'utility:check';
            } else if (stage.stage === CURRENT_STAGE) {
                status = 'current';
                statusLabel = 'In Progress';
                statusClass = 'stage-current';
                statusIcon = 'utility:sync';
            }

            const isExpanded = this.expandedStages.has(stage.stage);

            return {
                ...stage,
                status,
                statusLabel,
                statusClass,
                statusIcon,
                statusBadgeClass: `${statusClass} status-badge`,
                isExpanded,
                isCurrent: stage.stage === CURRENT_STAGE,
                isCompleted: stage.stage < CURRENT_STAGE,
                isPending: stage.stage > CURRENT_STAGE,
                stageKey: `stage-${stage.stage}`,
                cardClass: `stage-card ${statusClass}${stage.stage === CURRENT_STAGE ? ' current-stage' : ''}`,
                chevronIcon: isExpanded ? 'utility:chevrondown' : 'utility:chevronright',
                hasDependencies: stage.dependencies && stage.dependencies.length > 0,
                hasParallel: stage.parallelWith && stage.parallelWith.length > 0,
                formattedSteps: stage.steps.map((step, idx) => ({
                    ...step,
                    stepKey: `step-${stage.stage}-${idx}`,
                    stepIcon: step.complete ? 'utility:check' : 'utility:clock',
                    stepClass: step.complete ? 'step-complete' : 'step-pending'
                }))
            };
        });
    }

    get showHavenBranding() {
        return this.accountName && this.accountName.toLowerCase().includes('haven');
    }

    handleStageClick(event) {
        const stageNum = parseInt(event.currentTarget.dataset.stage, 10);
        if (this.expandedStages.has(stageNum)) {
            this.expandedStages.delete(stageNum);
        } else {
            this.expandedStages.add(stageNum);
        }
        // Force reactivity
        this.expandedStages = new Set(this.expandedStages);
    }

    handleExpandAll() {
        this.expandedStages = new Set(ORCHESTRATION_STAGES.map(s => s.stage));
    }

    handleCollapseAll() {
        this.expandedStages = new Set([CURRENT_STAGE]);
    }
}
