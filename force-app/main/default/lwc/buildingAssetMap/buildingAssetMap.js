/**
 * Building Asset Map Component - Haven Enterprises Data Center
 * Displays GIS info and assets by floor for the Haven Enterprises Bellevue Data Center
 * Digital Twin view with Asset Attributes for telemetry monitoring
 * For Field Service Mobile
 */
import { LightningElement, api, track } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createInspectionWorkPlan from '@salesforce/apex/BuildingAssetMapController.createInspectionWorkPlan';

// Haven Enterprises Data Center - Bellevue facility (matches demo story)
const HAVEN_DATA_CENTER = {
    name: 'Haven Enterprises - Bellevue Data Center',
    address: '10414 Beardslee Blvd, Bothell, WA 98011',
    latitude: 47.7623,
    longitude: -122.1889,
    buildingCode: 'HAVEN-DC-01',
    totalFloors: 4,
    totalSqFt: '125,000',
    yearBuilt: 2018,
    tierLevel: 'Tier III',
    powerCapacity: '15 MW',
    coolingCapacity: '4,200 tons'
};

export default class BuildingAssetMap extends LightningElement {
    @api recordId;

    // View state
    @track activeView = 'floors'; // 'floors' or 'gis'
    @track selectedFloor = '1';
    @track selectedAsset = null;
    @track showAssetDetail = false;
    @track isLoading = false;
    @track isCreatingWorkPlan = false;
    @track workPlanCreated = false;
    @track layerControlsExpanded = false; // Collapsed by default
    @track isMapMaximized = false; // Fullscreen map mode

    // GIS Layer visibility - now controls actual map elements
    @track gisLayers = [
        { id: 'backbone', name: 'Fiber Backbone', visible: true, color: '#2563eb', colorStyle: 'background-color: #2563eb', type: 'line' },
        { id: 'distribution', name: 'Distribution', visible: true, color: '#16a34a', colorStyle: 'background-color: #16a34a', type: 'line' },
        { id: 'zones', name: 'Facility Zones', visible: true, color: '#7c3aed', colorStyle: 'background-color: #7c3aed', type: 'polygon' },
        { id: 'assets', name: 'Assets', visible: true, color: '#f97316', colorStyle: 'background-color: #f97316', type: 'marker' }
    ];

    // Location (hardcoded to Haven Enterprises Bellevue DC)
    location = HAVEN_DATA_CENTER;

    // Assets organized by floor
    @track assetsByFloor = [];

    connectedCallback() {
        this.loadHavenDataCenterAssets();
    }

    loadHavenDataCenterAssets() {
        this.assetsByFloor = [
            {
                floor: '1',
                floorLabel: 'Floor 1 - Network Core',
                description: 'Primary network infrastructure and fiber distribution',
                isExpanded: true,
                assets: [
                    {
                        id: 'haven-olt-001',
                        name: 'OLT-A01-001',
                        type: 'Optical Line Terminal',
                        status: 'Active',
                        room: 'Network Core',
                        rack: 'NC-A01',
                        position: 'U1-U4',
                        serialNumber: 'OLT-2024-HAVEN-00123',
                        manufacturer: 'Nokia',
                        model: 'ISAM FX-16',
                        lastService: '2025-12-15',
                        iconName: 'standard:connected_apps',
                        gisX: 120,
                        gisY: 80,
                        coordinates: '47.7623, -122.1889',
                        attributes: [
                            { name: 'Temperature', value: 42, minThreshold: 10, maxThreshold: 65, unit: '°C', category: 'Environmental' },
                            { name: 'CPU Utilization', value: 38, minThreshold: 0, maxThreshold: 85, unit: '%', category: 'Performance' },
                            { name: 'Memory Usage', value: 52, minThreshold: 0, maxThreshold: 90, unit: '%', category: 'Performance' },
                            { name: 'Optical Power Rx', value: -18.5, minThreshold: -28, maxThreshold: -8, unit: 'dBm', category: 'Signal' },
                            { name: 'Active PON Ports', value: 14, minThreshold: 1, maxThreshold: 16, unit: 'ports', category: 'Connectivity' },
                            { name: 'Uptime', value: 99.98, minThreshold: 99, maxThreshold: 100, unit: '%', category: 'Availability' }
                        ]
                    },
                    {
                        id: 'haven-olt-002',
                        name: 'OLT-A01-002',
                        type: 'Optical Line Terminal',
                        status: 'Warning',
                        room: 'Network Core',
                        rack: 'NC-A01',
                        position: 'U5-U8',
                        serialNumber: 'OLT-2024-HAVEN-00124',
                        manufacturer: 'Nokia',
                        model: 'ISAM FX-16',
                        lastService: '2025-11-20',
                        iconName: 'standard:connected_apps',
                        gisX: 120,
                        gisY: 110,
                        coordinates: '47.7623, -122.1889',
                        attributes: [
                            { name: 'Temperature', value: 72, minThreshold: 10, maxThreshold: 65, unit: '°C', category: 'Environmental' }, // EXCEEDS - overheating
                            { name: 'CPU Utilization', value: 92, minThreshold: 0, maxThreshold: 85, unit: '%', category: 'Performance' }, // EXCEEDS - overloaded
                            { name: 'Memory Usage', value: 88, minThreshold: 0, maxThreshold: 90, unit: '%', category: 'Performance' },
                            { name: 'Optical Power Rx', value: -26.5, minThreshold: -28, maxThreshold: -8, unit: 'dBm', category: 'Signal' }, // NEAR threshold
                            { name: 'Active PON Ports', value: 16, minThreshold: 1, maxThreshold: 16, unit: 'ports', category: 'Connectivity' },
                            { name: 'Uptime', value: 98.2, minThreshold: 99, maxThreshold: 100, unit: '%', category: 'Availability' } // BELOW - degraded
                        ]
                    },
                    {
                        id: 'sea-002',
                        name: 'CORE-SW-001',
                        type: 'Core Switch',
                        status: 'Active',
                        room: 'Network Core',
                        rack: 'NC-A01',
                        position: 'U5-U8',
                        serialNumber: 'CSW-2024-SEA-00456',
                        manufacturer: 'Cisco',
                        model: 'Nexus 9508',
                        lastService: '2025-11-20',
                        iconName: 'standard:data_streams',
                        gisX: 120,
                        gisY: 120,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Temperature', value: 38, minThreshold: 10, maxThreshold: 70, unit: '°C', category: 'Environmental' },
                            { name: 'Throughput', value: 847, minThreshold: 0, maxThreshold: 1000, unit: 'Gbps', category: 'Performance' },
                            { name: 'Packet Loss', value: 0.001, minThreshold: 0, maxThreshold: 0.1, unit: '%', category: 'Performance' },
                            { name: 'Active Ports', value: 42, minThreshold: 1, maxThreshold: 48, unit: 'ports', category: 'Connectivity' },
                            { name: 'Fan Speed', value: 4200, minThreshold: 2000, maxThreshold: 8000, unit: 'RPM', category: 'Environmental' },
                            { name: 'Power Draw', value: 2.8, minThreshold: 0, maxThreshold: 4.5, unit: 'kW', category: 'Power' }
                        ]
                    },
                    {
                        id: 'sea-003',
                        name: 'EDGE-RTR-001',
                        type: 'Edge Router',
                        status: 'Active',
                        room: 'Network Core',
                        rack: 'NC-A02',
                        position: 'U1-U4',
                        serialNumber: 'RTR-2024-SEA-00789',
                        manufacturer: 'Juniper',
                        model: 'MX480',
                        lastService: '2025-10-05',
                        iconName: 'standard:flow',
                        gisX: 180,
                        gisY: 80,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Temperature', value: 45, minThreshold: 10, maxThreshold: 65, unit: '°C', category: 'Environmental' },
                            { name: 'BGP Sessions', value: 28, minThreshold: 1, maxThreshold: 50, unit: 'sessions', category: 'Connectivity' },
                            { name: 'Route Table Size', value: 892000, minThreshold: 0, maxThreshold: 1000000, unit: 'routes', category: 'Performance' },
                            { name: 'CPU Utilization', value: 24, minThreshold: 0, maxThreshold: 80, unit: '%', category: 'Performance' },
                            { name: 'Interface Errors', value: 0, minThreshold: 0, maxThreshold: 100, unit: 'errors/hr', category: 'Health' },
                            { name: 'Latency', value: 1.2, minThreshold: 0, maxThreshold: 10, unit: 'ms', category: 'Performance' }
                        ]
                    },
                    {
                        id: 'sea-004',
                        name: 'FDP-SEA-001',
                        type: 'Fiber Distribution Panel',
                        status: 'Active',
                        room: 'MDF Room',
                        rack: 'MDF-01',
                        position: 'U1-U4',
                        serialNumber: 'FDP-2024-SEA-00234',
                        manufacturer: 'Corning',
                        model: 'CCH-04U',
                        lastService: '2025-09-18',
                        iconName: 'standard:hierarchy',
                        gisX: 60,
                        gisY: 150,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Connected Fibers', value: 144, minThreshold: 1, maxThreshold: 288, unit: 'strands', category: 'Connectivity' },
                            { name: 'Avg Insertion Loss', value: 0.18, minThreshold: 0, maxThreshold: 0.5, unit: 'dB', category: 'Signal' },
                            { name: 'Temperature', value: 22, minThreshold: 15, maxThreshold: 35, unit: '°C', category: 'Environmental' },
                            { name: 'Humidity', value: 42, minThreshold: 20, maxThreshold: 60, unit: '%', category: 'Environmental' }
                        ]
                    }
                ]
            },
            {
                floor: '2',
                floorLabel: 'Floor 2 - Transport & DWDM',
                description: 'Optical transport equipment and wavelength services',
                isExpanded: false,
                assets: [
                    {
                        id: 'sea-005',
                        name: 'DWDM-SEA-001',
                        type: 'DWDM System',
                        status: 'Active',
                        room: 'Transport Room A',
                        rack: 'TR-A01',
                        position: 'U1-U10',
                        serialNumber: 'DWDM-2024-SEA-00567',
                        manufacturer: 'Ciena',
                        model: '6500 T-Series',
                        lastService: '2026-01-10',
                        iconName: 'standard:calibration',
                        gisX: 100,
                        gisY: 100,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Active Wavelengths', value: 80, minThreshold: 1, maxThreshold: 96, unit: 'λ', category: 'Capacity' },
                            { name: 'Total Bandwidth', value: 9.6, minThreshold: 0, maxThreshold: 12, unit: 'Tbps', category: 'Performance' },
                            { name: 'OSNR', value: 28, minThreshold: 18, maxThreshold: 40, unit: 'dB', category: 'Signal' },
                            { name: 'Amplifier Temp', value: 35, minThreshold: 10, maxThreshold: 50, unit: '°C', category: 'Environmental' },
                            { name: 'Laser Bias Current', value: 42, minThreshold: 20, maxThreshold: 80, unit: 'mA', category: 'Health' },
                            { name: 'Chromatic Dispersion', value: 850, minThreshold: 0, maxThreshold: 1500, unit: 'ps/nm', category: 'Signal' }
                        ]
                    },
                    {
                        id: 'sea-006',
                        name: 'ROADM-SEA-001',
                        type: 'ROADM Node',
                        status: 'Active',
                        room: 'Transport Room A',
                        rack: 'TR-A02',
                        position: 'U1-U6',
                        serialNumber: 'ROADM-2024-SEA-00891',
                        manufacturer: 'Infinera',
                        model: 'DTN-X',
                        lastService: '2025-12-20',
                        iconName: 'standard:loop',
                        gisX: 160,
                        gisY: 100,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Add/Drop Channels', value: 16, minThreshold: 0, maxThreshold: 20, unit: 'channels', category: 'Capacity' },
                            { name: 'Express Channels', value: 64, minThreshold: 0, maxThreshold: 80, unit: 'channels', category: 'Capacity' },
                            { name: 'WSS Insertion Loss', value: 5.2, minThreshold: 0, maxThreshold: 8, unit: 'dB', category: 'Signal' },
                            { name: 'Power Consumption', value: 1.8, minThreshold: 0, maxThreshold: 3, unit: 'kW', category: 'Power' },
                            { name: 'Temperature', value: 32, minThreshold: 10, maxThreshold: 45, unit: '°C', category: 'Environmental' }
                        ]
                    },
                    {
                        id: 'sea-007',
                        name: 'OTN-SW-001',
                        type: 'OTN Switch',
                        status: 'Warning',
                        room: 'Transport Room B',
                        rack: 'TR-B01',
                        position: 'U1-U8',
                        serialNumber: 'OTN-2024-SEA-00345',
                        manufacturer: 'Huawei',
                        model: 'OptiX OSN 9800',
                        lastService: '2025-08-15',
                        iconName: 'standard:network_contract',
                        gisX: 100,
                        gisY: 160,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Temperature', value: 68, minThreshold: 10, maxThreshold: 65, unit: '°C', category: 'Environmental' }, // EXCEEDS THRESHOLD
                            { name: 'Fan Status', value: 3, minThreshold: 4, maxThreshold: 6, unit: 'fans OK', category: 'Health' }, // BELOW THRESHOLD - fan failure
                            { name: 'CPU Utilization', value: 78, minThreshold: 0, maxThreshold: 85, unit: '%', category: 'Performance' },
                            { name: 'FEC Corrections', value: 245, minThreshold: 0, maxThreshold: 100, unit: 'errors/min', category: 'Health' }, // EXCEEDS THRESHOLD
                            { name: 'Active ODU Clients', value: 42, minThreshold: 0, maxThreshold: 80, unit: 'clients', category: 'Capacity' },
                            { name: 'Power Draw', value: 4.2, minThreshold: 0, maxThreshold: 5, unit: 'kW', category: 'Power' }
                        ]
                    }
                ]
            },
            {
                floor: '3',
                floorLabel: 'Floor 3 - Compute & Storage',
                description: 'Server infrastructure and storage arrays',
                isExpanded: false,
                assets: [
                    {
                        id: 'sea-008',
                        name: 'BLADE-SEA-001',
                        type: 'Blade Chassis',
                        status: 'Active',
                        room: 'Compute Hall A',
                        rack: 'CH-A01',
                        position: 'U1-U10',
                        serialNumber: 'BLD-2024-SEA-01234',
                        manufacturer: 'Dell',
                        model: 'PowerEdge MX7000',
                        lastService: '2025-12-01',
                        iconName: 'standard:apps',
                        gisX: 80,
                        gisY: 80,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Active Blades', value: 7, minThreshold: 1, maxThreshold: 8, unit: 'blades', category: 'Capacity' },
                            { name: 'Avg CPU Temp', value: 58, minThreshold: 10, maxThreshold: 85, unit: '°C', category: 'Environmental' },
                            { name: 'Total vCPUs', value: 448, minThreshold: 0, maxThreshold: 512, unit: 'cores', category: 'Capacity' },
                            { name: 'Memory Allocated', value: 2.8, minThreshold: 0, maxThreshold: 4, unit: 'TB', category: 'Capacity' },
                            { name: 'Network I/O', value: 185, minThreshold: 0, maxThreshold: 400, unit: 'Gbps', category: 'Performance' },
                            { name: 'Power Draw', value: 8.5, minThreshold: 0, maxThreshold: 12, unit: 'kW', category: 'Power' }
                        ]
                    },
                    {
                        id: 'sea-009',
                        name: 'STORAGE-SEA-001',
                        type: 'Storage Array',
                        status: 'Active',
                        room: 'Storage Vault',
                        rack: 'SV-01',
                        position: 'U1-U8',
                        serialNumber: 'STO-2024-SEA-05678',
                        manufacturer: 'NetApp',
                        model: 'AFF A800',
                        lastService: '2025-11-15',
                        iconName: 'standard:record',
                        gisX: 180,
                        gisY: 80,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Capacity Used', value: 72, minThreshold: 0, maxThreshold: 85, unit: '%', category: 'Capacity' },
                            { name: 'IOPS', value: 485000, minThreshold: 0, maxThreshold: 1000000, unit: 'ops/s', category: 'Performance' },
                            { name: 'Latency', value: 0.4, minThreshold: 0, maxThreshold: 2, unit: 'ms', category: 'Performance' },
                            { name: 'Throughput', value: 18.5, minThreshold: 0, maxThreshold: 25, unit: 'GB/s', category: 'Performance' },
                            { name: 'Drive Health', value: 100, minThreshold: 90, maxThreshold: 100, unit: '%', category: 'Health' },
                            { name: 'Temperature', value: 28, minThreshold: 15, maxThreshold: 40, unit: '°C', category: 'Environmental' }
                        ]
                    },
                    {
                        id: 'sea-010',
                        name: 'BACKUP-SEA-001',
                        type: 'Backup Appliance',
                        status: 'Active',
                        room: 'Storage Vault',
                        rack: 'SV-02',
                        position: 'U1-U4',
                        serialNumber: 'BKP-2024-SEA-07890',
                        manufacturer: 'Veeam',
                        model: 'Backup Appliance',
                        lastService: '2025-10-20',
                        iconName: 'standard:file',
                        gisX: 180,
                        gisY: 140,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Backup Success Rate', value: 99.8, minThreshold: 98, maxThreshold: 100, unit: '%', category: 'Health' },
                            { name: 'Dedup Ratio', value: 4.2, minThreshold: 2, maxThreshold: 10, unit: ':1', category: 'Efficiency' },
                            { name: 'Repository Used', value: 68, minThreshold: 0, maxThreshold: 90, unit: '%', category: 'Capacity' },
                            { name: 'Jobs Running', value: 3, minThreshold: 0, maxThreshold: 12, unit: 'jobs', category: 'Performance' },
                            { name: 'Last Backup Age', value: 2.5, minThreshold: 0, maxThreshold: 24, unit: 'hours', category: 'Health' }
                        ]
                    }
                ]
            },
            {
                floor: '4',
                floorLabel: 'Floor 4 - Power & Cooling',
                description: 'Critical power and environmental systems',
                isExpanded: false,
                assets: [
                    {
                        id: 'haven-ups-001',
                        name: 'UPS-A01-001',
                        type: 'UPS System',
                        status: 'Warning',
                        room: 'Power Room A',
                        rack: 'Floor Mount',
                        position: 'N/A',
                        serialNumber: 'UPS-2023-HAVEN-00890',
                        manufacturer: 'Eaton',
                        model: '93PM 500kVA',
                        lastService: '2025-08-22',
                        iconName: 'standard:lightning_usage',
                        gisX: 60,
                        gisY: 100,
                        coordinates: '47.7623, -122.1889',
                        attributes: [
                            { name: 'Load', value: 62, minThreshold: 0, maxThreshold: 80, unit: '%', category: 'Capacity' },
                            { name: 'Battery Health', value: 68, minThreshold: 70, maxThreshold: 100, unit: '%', category: 'Health' }, // BELOW - critical (matches predictive maintenance)
                            { name: 'Charge Cycles', value: 847, minThreshold: 0, maxThreshold: 850, unit: 'cycles', category: 'Health' }, // NEAR threshold (matches predictive)
                            { name: 'Input Voltage', value: 478, minThreshold: 456, maxThreshold: 504, unit: 'V', category: 'Power' },
                            { name: 'Output Voltage', value: 480, minThreshold: 470, maxThreshold: 490, unit: 'V', category: 'Power' },
                            { name: 'Battery Temp', value: 32, minThreshold: 15, maxThreshold: 35, unit: '°C', category: 'Environmental' }, // Elevated but OK
                            { name: 'Runtime Remaining', value: 12, minThreshold: 10, maxThreshold: 60, unit: 'min', category: 'Health' } // Low but OK
                        ]
                    },
                    {
                        id: 'sea-012',
                        name: 'PDU-SEA-001',
                        type: 'Power Distribution',
                        status: 'Active',
                        room: 'Power Room A',
                        rack: 'PDU-01',
                        position: 'N/A',
                        serialNumber: 'PDU-2024-SEA-01122',
                        manufacturer: 'Schneider',
                        model: 'Galaxy VX',
                        lastService: '2025-09-10',
                        iconName: 'standard:metrics',
                        gisX: 120,
                        gisY: 100,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Total Load', value: 285, minThreshold: 0, maxThreshold: 400, unit: 'kW', category: 'Capacity' },
                            { name: 'Phase A Current', value: 198, minThreshold: 0, maxThreshold: 300, unit: 'A', category: 'Power' },
                            { name: 'Phase B Current', value: 205, minThreshold: 0, maxThreshold: 300, unit: 'A', category: 'Power' },
                            { name: 'Phase C Current', value: 192, minThreshold: 0, maxThreshold: 300, unit: 'A', category: 'Power' },
                            { name: 'Power Factor', value: 0.95, minThreshold: 0.85, maxThreshold: 1, unit: '', category: 'Efficiency' },
                            { name: 'Breaker Trips', value: 0, minThreshold: 0, maxThreshold: 1, unit: 'events', category: 'Health' }
                        ]
                    },
                    {
                        id: 'sea-013',
                        name: 'CRAC-SEA-001',
                        type: 'CRAC Unit',
                        status: 'Warning',
                        room: 'Cooling Zone A',
                        rack: 'Floor Mount',
                        position: 'N/A',
                        serialNumber: 'CRAC-2024-SEA-03344',
                        manufacturer: 'Liebert',
                        model: 'CRV 35kW',
                        lastService: '2025-07-15',
                        iconName: 'standard:environment_hub',
                        gisX: 180,
                        gisY: 100,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Supply Air Temp', value: 19, minThreshold: 15, maxThreshold: 22, unit: '°C', category: 'Environmental' },
                            { name: 'Return Air Temp', value: 32, minThreshold: 20, maxThreshold: 30, unit: '°C', category: 'Environmental' }, // EXCEEDS THRESHOLD
                            { name: 'Humidity', value: 58, minThreshold: 40, maxThreshold: 55, unit: '%', category: 'Environmental' }, // EXCEEDS THRESHOLD
                            { name: 'Compressor Status', value: 1, minThreshold: 2, maxThreshold: 2, unit: 'active', category: 'Health' }, // BELOW THRESHOLD - compressor issue
                            { name: 'Refrigerant Pressure', value: 285, minThreshold: 250, maxThreshold: 350, unit: 'PSI', category: 'Health' },
                            { name: 'Airflow', value: 8500, minThreshold: 8000, maxThreshold: 12000, unit: 'CFM', category: 'Performance' }
                        ]
                    },
                    {
                        id: 'sea-014',
                        name: 'GEN-SEA-001',
                        type: 'Diesel Generator',
                        status: 'Active',
                        room: 'Generator Yard',
                        rack: 'Outdoor',
                        position: 'N/A',
                        serialNumber: 'GEN-2023-SEA-05566',
                        manufacturer: 'Caterpillar',
                        model: 'C32 1250kW',
                        lastService: '2025-11-01',
                        iconName: 'standard:product_service_campaign',
                        gisX: 60,
                        gisY: 160,
                        coordinates: '47.6145, -122.3418',
                        attributes: [
                            { name: 'Fuel Level', value: 85, minThreshold: 25, maxThreshold: 100, unit: '%', category: 'Capacity' },
                            { name: 'Battery Voltage', value: 26.4, minThreshold: 24, maxThreshold: 28, unit: 'V', category: 'Health' },
                            { name: 'Coolant Temp', value: 45, minThreshold: 30, maxThreshold: 95, unit: '°C', category: 'Environmental' },
                            { name: 'Oil Pressure', value: 62, minThreshold: 40, maxThreshold: 80, unit: 'PSI', category: 'Health' },
                            { name: 'Run Hours', value: 142, minThreshold: 0, maxThreshold: 500, unit: 'hours', category: 'Maintenance' },
                            { name: 'Last Test', value: 3, minThreshold: 0, maxThreshold: 30, unit: 'days ago', category: 'Maintenance' }
                        ]
                    }
                ]
            }
        ];

        // Process attributes and add status class to each asset
        this.assetsByFloor.forEach(floor => {
            floor.assets.forEach(asset => {
                asset.statusClass = this.getStatusClass(asset.status);
                // Process attributes to add status
                if (asset.attributes) {
                    asset.attributes = asset.attributes.map(attr => this.processAttribute(attr));
                    asset.warningAttributes = asset.attributes.filter(a => a.status === 'warning' || a.status === 'critical');
                    asset.hasWarnings = asset.warningAttributes.length > 0;
                }
            });
        });
    }

    // Process an attribute to determine its status
    processAttribute(attr) {
        let status = 'normal';
        let statusClass = 'attr-normal';
        let statusIcon = 'utility:success';

        if (attr.value < attr.minThreshold) {
            status = 'critical';
            statusClass = 'attr-critical';
            statusIcon = 'utility:error';
        } else if (attr.value > attr.maxThreshold) {
            status = 'warning';
            statusClass = 'attr-warning';
            statusIcon = 'utility:warning';
        }

        // Calculate percentage for gauge display
        const range = attr.maxThreshold - attr.minThreshold;
        let percentage = ((attr.value - attr.minThreshold) / range) * 100;
        percentage = Math.max(0, Math.min(100, percentage));

        return {
            ...attr,
            status,
            statusClass,
            statusIcon,
            percentage: percentage.toFixed(0),
            gaugeStyle: `width: ${Math.min(percentage, 100)}%`,
            displayValue: this.formatValue(attr.value, attr.unit),
            thresholdDisplay: `${attr.minThreshold} - ${attr.maxThreshold} ${attr.unit}`
        };
    }

    formatValue(value, unit) {
        if (typeof value === 'number') {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M ' + unit;
            } else if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K ' + unit;
            }
            return value.toLocaleString() + ' ' + unit;
        }
        return value + ' ' + unit;
    }

    // Computed properties
    get isFloorsView() {
        return this.activeView === 'floors';
    }

    get isGisView() {
        return this.activeView === 'gis';
    }

    get floorsButtonVariant() {
        return this.activeView === 'floors' ? 'brand' : 'neutral';
    }

    get gisButtonVariant() {
        return this.activeView === 'gis' ? 'brand' : 'neutral';
    }

    get totalAssetCount() {
        return this.assetsByFloor.reduce((sum, floor) => sum + floor.assets.length, 0);
    }

    get activeAssetCount() {
        return this.assetsByFloor.reduce((sum, floor) =>
            sum + floor.assets.filter(a => a.status === 'Active').length, 0);
    }

    get warningAssetCount() {
        return this.assetsByFloor.reduce((sum, floor) =>
            sum + floor.assets.filter(a => a.status === 'Warning').length, 0);
    }

    get currentFloorAssets() {
        const floor = this.assetsByFloor.find(f => f.floor === this.selectedFloor);
        return floor ? floor.assets : [];
    }

    get currentFloorInfo() {
        return this.assetsByFloor.find(f => f.floor === this.selectedFloor);
    }

    get floorOptions() {
        return this.assetsByFloor.map(f => ({
            label: f.floorLabel,
            value: f.floor
        }));
    }

    get googleMapsUrl() {
        return `https://www.google.com/maps?q=${this.location.latitude},${this.location.longitude}`;
    }

    get arcgisMapUrl() {
        return `https://www.arcgis.com/apps/mapviewer/index.html?center=${this.location.longitude},${this.location.latitude}&level=18`;
    }

    // GIS Layer visibility getters
    get showBackbone() {
        return this.gisLayers.find(l => l.id === 'backbone')?.visible ?? true;
    }

    get showDistribution() {
        return this.gisLayers.find(l => l.id === 'distribution')?.visible ?? true;
    }

    get showDrop() {
        return this.gisLayers.find(l => l.id === 'drop')?.visible ?? true;
    }

    get showSplice() {
        return this.gisLayers.find(l => l.id === 'splice')?.visible ?? true;
    }

    get showAssets() {
        return this.gisLayers.find(l => l.id === 'assets')?.visible ?? true;
    }

    // CSS class getters for SVG layer visibility
    get backboneClass() {
        return this.showBackbone ? 'layer-backbone' : 'layer-backbone layer-hidden';
    }

    get distributionClass() {
        return this.showDistribution ? 'layer-distribution' : 'layer-distribution layer-hidden';
    }

    get dropClass() {
        return this.showDrop ? 'layer-drop' : 'layer-drop layer-hidden';
    }

    get spliceClass() {
        return this.showSplice ? 'layer-splice' : 'layer-splice layer-hidden';
    }

    // Get icon based on asset type
    getAssetIcon(assetType, status) {
        // Warning assets get warning icon
        if (status === 'Warning') {
            return 'utility:warning';
        }

        const typeIconMap = {
            'Optical Line Terminal': 'standard:connected_apps',
            'Core Switch': 'standard:data_streams',
            'Edge Router': 'standard:flow',
            'Fiber Distribution Panel': 'standard:hierarchy',
            'DWDM System': 'standard:calibration',
            'ROADM Node': 'standard:loop',
            'OTN Switch': 'standard:network_contract',
            'Blade Chassis': 'standard:apps',
            'Storage Array': 'standard:record',
            'Backup Appliance': 'standard:file',
            'UPS System': 'standard:lightning_usage',
            'Power Distribution': 'standard:metrics',
            'CRAC Unit': 'standard:environment_hub',
            'Diesel Generator': 'standard:product_service_campaign'
        };

        return typeIconMap[assetType] || 'standard:asset_object';
    }

    // Check if a layer is visible
    isLayerVisible(layerId) {
        const layer = this.gisLayers.find(l => l.id === layerId);
        return layer ? layer.visible : true;
    }

    // Map markers for lightning-map component - includes markers, lines, and polygons
    get mapMarkers() {
        const markers = [];
        const baseLat = this.location.latitude;
        const baseLng = this.location.longitude;

        // Add main data center marker (always visible)
        markers.push({
            location: { Latitude: baseLat, Longitude: baseLng },
            title: this.location.name,
            description: `<b>${this.location.buildingCode}</b><br/>${this.location.address}<br/>${this.location.tierLevel} | ${this.location.totalSqFt} sq ft`,
            icon: 'standard:location',
            value: 'data-center'
        });

        // Add Fiber Backbone Lines (thick blue lines - main trunk)
        if (this.isLayerVisible('backbone')) {
            // Main east-west backbone
            markers.push({
                location: { Latitude: baseLat, Longitude: baseLng - 0.003 },
                title: 'Fiber Backbone - Main Trunk',
                description: '<b>96-Strand Single Mode Fiber</b><br/>Capacity: 9.6 Tbps<br/>Status: <span style="color:#16a34a">✓ Active</span>',
                type: 'Polygon',
                paths: [
                    { lat: baseLat + 0.0002, lng: baseLng - 0.003 },
                    { lat: baseLat + 0.0002, lng: baseLng + 0.003 },
                    { lat: baseLat - 0.0002, lng: baseLng + 0.003 },
                    { lat: baseLat - 0.0002, lng: baseLng - 0.003 }
                ],
                strokeColor: '#2563eb',
                strokeOpacity: 0.9,
                strokeWeight: 6,
                fillColor: '#2563eb',
                fillOpacity: 0.3,
                value: 'backbone-main'
            });

            // North-south backbone branch
            markers.push({
                location: { Latitude: baseLat + 0.002, Longitude: baseLng },
                title: 'Fiber Backbone - N/S Branch',
                description: '<b>48-Strand Single Mode Fiber</b><br/>Capacity: 4.8 Tbps<br/>Status: <span style="color:#16a34a">✓ Active</span>',
                type: 'Polygon',
                paths: [
                    { lat: baseLat + 0.003, lng: baseLng - 0.0002 },
                    { lat: baseLat + 0.003, lng: baseLng + 0.0002 },
                    { lat: baseLat - 0.002, lng: baseLng + 0.0002 },
                    { lat: baseLat - 0.002, lng: baseLng - 0.0002 }
                ],
                strokeColor: '#2563eb',
                strokeOpacity: 0.9,
                strokeWeight: 5,
                fillColor: '#2563eb',
                fillOpacity: 0.3,
                value: 'backbone-ns'
            });
        }

        // Add Distribution Lines (green - connects to buildings)
        if (this.isLayerVisible('distribution')) {
            // Distribution to northwest
            markers.push({
                location: { Latitude: baseLat + 0.001, Longitude: baseLng - 0.0015 },
                title: 'Distribution Fiber - NW Sector',
                description: '<b>24-Strand Distribution</b><br/>Serving: Network Core<br/>Status: <span style="color:#16a34a">✓ Active</span>',
                type: 'Polygon',
                paths: [
                    { lat: baseLat, lng: baseLng },
                    { lat: baseLat + 0.0015, lng: baseLng - 0.002 },
                    { lat: baseLat + 0.0017, lng: baseLng - 0.0018 },
                    { lat: baseLat + 0.0002, lng: baseLng + 0.0002 }
                ],
                strokeColor: '#16a34a',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                fillColor: '#16a34a',
                fillOpacity: 0.2,
                value: 'dist-nw'
            });

            // Distribution to northeast
            markers.push({
                location: { Latitude: baseLat + 0.001, Longitude: baseLng + 0.0015 },
                title: 'Distribution Fiber - NE Sector',
                description: '<b>24-Strand Distribution</b><br/>Serving: Transport/DWDM<br/>Status: <span style="color:#16a34a">✓ Active</span>',
                type: 'Polygon',
                paths: [
                    { lat: baseLat, lng: baseLng },
                    { lat: baseLat + 0.0015, lng: baseLng + 0.002 },
                    { lat: baseLat + 0.0017, lng: baseLng + 0.0018 },
                    { lat: baseLat + 0.0002, lng: baseLng - 0.0002 }
                ],
                strokeColor: '#16a34a',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                fillColor: '#16a34a',
                fillOpacity: 0.2,
                value: 'dist-ne'
            });

            // Distribution to south
            markers.push({
                location: { Latitude: baseLat - 0.001, Longitude: baseLng },
                title: 'Distribution Fiber - S Sector',
                description: '<b>24-Strand Distribution</b><br/>Serving: Power/Cooling<br/>Status: <span style="color:#16a34a">✓ Active</span>',
                type: 'Polygon',
                paths: [
                    { lat: baseLat, lng: baseLng },
                    { lat: baseLat - 0.002, lng: baseLng - 0.001 },
                    { lat: baseLat - 0.002, lng: baseLng + 0.001 },
                    { lat: baseLat, lng: baseLng }
                ],
                strokeColor: '#16a34a',
                strokeOpacity: 0.8,
                strokeWeight: 4,
                fillColor: '#16a34a',
                fillOpacity: 0.2,
                value: 'dist-s'
            });
        }

        // Add Facility Zone Polygons (purple - building areas)
        if (this.isLayerVisible('zones')) {
            // Main data center building footprint
            markers.push({
                location: { Latitude: baseLat, Longitude: baseLng },
                title: 'Data Center - Main Building',
                description: '<b>HAVEN-DC-01 Main Facility</b><br/>125,000 sq ft | Tier III<br/>4 Floors | 15 MW Power Capacity',
                type: 'Polygon',
                paths: [
                    { lat: baseLat + 0.0008, lng: baseLng - 0.001 },
                    { lat: baseLat + 0.0008, lng: baseLng + 0.001 },
                    { lat: baseLat - 0.0008, lng: baseLng + 0.001 },
                    { lat: baseLat - 0.0008, lng: baseLng - 0.001 }
                ],
                strokeColor: '#7c3aed',
                strokeOpacity: 0.9,
                strokeWeight: 3,
                fillColor: '#7c3aed',
                fillOpacity: 0.15,
                value: 'zone-main'
            });

            // Generator yard
            markers.push({
                location: { Latitude: baseLat - 0.0012, Longitude: baseLng - 0.0008 },
                title: 'Generator Yard',
                description: '<b>Backup Power Zone</b><br/>2x 1250kW Diesel Generators<br/>Fuel Storage: 10,000 gal',
                type: 'Polygon',
                paths: [
                    { lat: baseLat - 0.001, lng: baseLng - 0.0015 },
                    { lat: baseLat - 0.001, lng: baseLng - 0.0005 },
                    { lat: baseLat - 0.0016, lng: baseLng - 0.0005 },
                    { lat: baseLat - 0.0016, lng: baseLng - 0.0015 }
                ],
                strokeColor: '#f59e0b',
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: '#f59e0b',
                fillOpacity: 0.2,
                value: 'zone-generator'
            });

            // Cooling plant area
            markers.push({
                location: { Latitude: baseLat - 0.0012, Longitude: baseLng + 0.0008 },
                title: 'Cooling Plant',
                description: '<b>HVAC Zone</b><br/>Capacity: 4,200 tons<br/>6x Chiller Units',
                type: 'Polygon',
                paths: [
                    { lat: baseLat - 0.001, lng: baseLng + 0.0005 },
                    { lat: baseLat - 0.001, lng: baseLng + 0.0015 },
                    { lat: baseLat - 0.0016, lng: baseLng + 0.0015 },
                    { lat: baseLat - 0.0016, lng: baseLng + 0.0005 }
                ],
                strokeColor: '#0ea5e9',
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: '#0ea5e9',
                fillOpacity: 0.2,
                value: 'zone-cooling'
            });

            // Parking/staging area
            markers.push({
                location: { Latitude: baseLat + 0.0014, Longitude: baseLng },
                title: 'Service Yard',
                description: '<b>Staging & Parking</b><br/>Loading Docks: 4<br/>Service Vehicle Parking: 12 spaces',
                type: 'Polygon',
                paths: [
                    { lat: baseLat + 0.001, lng: baseLng - 0.0012 },
                    { lat: baseLat + 0.001, lng: baseLng + 0.0012 },
                    { lat: baseLat + 0.0018, lng: baseLng + 0.0012 },
                    { lat: baseLat + 0.0018, lng: baseLng - 0.0012 }
                ],
                strokeColor: '#6b7280',
                strokeOpacity: 0.7,
                strokeWeight: 2,
                fillColor: '#6b7280',
                fillOpacity: 0.1,
                value: 'zone-parking'
            });
        }

        // Add asset markers (if layer visible)
        if (this.isLayerVisible('assets')) {
            const assetOffsets = [
                { id: 'haven-olt-001', latOff: 0.0006, lngOff: -0.0007 },
                { id: 'haven-olt-002', latOff: 0.0005, lngOff: -0.0006 },
                { id: 'sea-002', latOff: 0.0004, lngOff: -0.0005 },
                { id: 'sea-003', latOff: 0.0006, lngOff: 0.0003 },
                { id: 'sea-004', latOff: 0.0002, lngOff: -0.0008 },
                { id: 'sea-005', latOff: 0.0003, lngOff: 0.0006 },
                { id: 'sea-006', latOff: 0.0001, lngOff: 0.0008 },
                { id: 'sea-007', latOff: -0.0003, lngOff: 0.0005 },
                { id: 'sea-008', latOff: -0.0005, lngOff: -0.0004 },
                { id: 'sea-009', latOff: 0.0005, lngOff: 0.0007 },
                { id: 'sea-010', latOff: -0.0001, lngOff: 0.0009 },
                { id: 'haven-ups-001', latOff: -0.0012, lngOff: -0.001 },
                { id: 'sea-012', latOff: -0.0006, lngOff: -0.0002 },
                { id: 'sea-013', latOff: -0.0012, lngOff: 0.001 },
                { id: 'sea-014', latOff: -0.0014, lngOff: -0.0008 }
            ];

            assetOffsets.forEach(offset => {
                const asset = this.findAssetById(offset.id);
                if (asset) {
                    const assetIcon = this.getAssetIcon(asset.type, asset.status);
                    const statusText = asset.status === 'Warning' ? '<span style="color:#dc2626"><b>⚠ Warning</b></span>' : '<span style="color:#16a34a">✓ Active</span>';
                    markers.push({
                        location: {
                            Latitude: baseLat + offset.latOff,
                            Longitude: baseLng + offset.lngOff
                        },
                        title: asset.name,
                        description: `<b>${asset.type}</b><br/>${asset.room} | ${asset.rack}<br/>Status: ${statusText}`,
                        icon: assetIcon,
                        value: asset.id
                    });
                }
            });
        }

        return markers;
    }

    get mapCenter() {
        return {
            Latitude: this.location.latitude,
            Longitude: this.location.longitude
        };
    }

    get mapContainerClass() {
        return this.isMapMaximized ? 'map-container-wrapper maximized' : 'map-container-wrapper';
    }

    get maximizeIcon() {
        return this.isMapMaximized ? 'utility:minimize_window' : 'utility:expand';
    }

    get maximizeLabel() {
        return this.isMapMaximized ? 'Minimize' : 'Maximize';
    }

    // Legacy map assets for SVG overlay (kept for fiber network visualization)
    get mapAssets() {
        const assetPositions = [
            { id: 'haven-olt-001', x: 28, y: 35, status: 'Active' },
            { id: 'haven-olt-002', x: 32, y: 38, status: 'Warning' },
            { id: 'sea-002', x: 32, y: 42, status: 'Active' },
            { id: 'sea-003', x: 45, y: 28, status: 'Active' },
            { id: 'sea-004', x: 15, y: 52, status: 'Active' },
            { id: 'sea-005', x: 52, y: 38, status: 'Active' },
            { id: 'sea-006', x: 62, y: 45, status: 'Active' },
            { id: 'sea-007', x: 50, y: 58, status: 'Warning' },
            { id: 'sea-008', x: 22, y: 68, status: 'Active' },
            { id: 'sea-009', x: 72, y: 32, status: 'Active' },
            { id: 'sea-010', x: 78, y: 55, status: 'Active' },
            { id: 'haven-ups-001', x: 18, y: 78, status: 'Warning' },
            { id: 'sea-012', x: 35, y: 72, status: 'Active' },
            { id: 'sea-013', x: 68, y: 75, status: 'Warning' },
            { id: 'sea-014', x: 85, y: 68, status: 'Active' }
        ];

        return assetPositions.map(pos => {
            const asset = this.findAssetById(pos.id);
            return {
                ...pos,
                name: asset?.name || pos.id,
                positionStyle: `left: ${pos.x}%; top: ${pos.y}%`,
                markerClass: pos.status === 'Warning' ? 'asset-marker warning' : 'asset-marker'
            };
        });
    }

    findAssetById(assetId) {
        for (const floor of this.assetsByFloor) {
            const asset = floor.assets.find(a => a.id === assetId);
            if (asset) return asset;
        }
        return null;
    }

    // Group attributes by category for the selected asset
    get groupedAttributes() {
        if (!this.selectedAsset?.attributes) return [];

        const groups = {};
        this.selectedAsset.attributes.forEach(attr => {
            const category = attr.category || 'General';
            if (!groups[category]) {
                groups[category] = {
                    name: category,
                    attributes: [],
                    hasWarning: false
                };
            }
            groups[category].attributes.push(attr);
            if (attr.status !== 'normal') {
                groups[category].hasWarning = true;
            }
        });

        return Object.values(groups);
    }

    // Getter for layer controls class
    get layerControlsClass() {
        return this.layerControlsExpanded ? 'layer-controls expanded' : 'layer-controls collapsed';
    }

    get layerToggleIcon() {
        return this.layerControlsExpanded ? 'utility:chevrondown' : 'utility:chevronright';
    }

    // Event handlers
    handleViewChange(event) {
        this.activeView = event.target.value;
    }

    handleToggleLayerControls() {
        this.layerControlsExpanded = !this.layerControlsExpanded;
    }

    handleToggleMapMaximize() {
        this.isMapMaximized = !this.isMapMaximized;
    }

    handleLayerToggle(event) {
        const layerId = event.target.dataset.layer;
        this.gisLayers = this.gisLayers.map(layer => {
            if (layer.id === layerId) {
                return { ...layer, visible: event.target.checked };
            }
            return layer;
        });
    }

    handleMapAssetClick(event) {
        const assetId = event.currentTarget.dataset.id;
        const asset = this.findAssetById(assetId);
        if (asset) {
            this.selectedAsset = { ...asset };
            this.showAssetDetail = true;
        }
    }

    handleMarkerSelect(event) {
        const selectedMarkerValue = event.detail.selectedMarkerValue;
        if (selectedMarkerValue && selectedMarkerValue !== 'data-center') {
            const asset = this.findAssetById(selectedMarkerValue);
            if (asset) {
                this.selectedAsset = { ...asset };
                this.showAssetDetail = true;
            }
        }
    }

    handleFloorChange(event) {
        this.selectedFloor = event.detail.value;
    }

    handleFloorToggle(event) {
        const floorIndex = parseInt(event.currentTarget.dataset.index);
        this.assetsByFloor = this.assetsByFloor.map((floor, idx) => {
            if (idx === floorIndex) {
                return { ...floor, isExpanded: !floor.isExpanded };
            }
            return floor;
        });
    }

    handleAssetClick(event) {
        const assetId = event.currentTarget.dataset.id;
        for (const floor of this.assetsByFloor) {
            const asset = floor.assets.find(a => a.id === assetId);
            if (asset) {
                this.selectedAsset = { ...asset };
                this.showAssetDetail = true;
                break;
            }
        }
    }

    handleCloseDetail() {
        this.showAssetDetail = false;
        this.selectedAsset = null;
        this.workPlanCreated = false;
    }

    async handleAddInspectionWorkPlan() {
        if (!this.selectedAsset || !this.selectedAsset.hasWarnings) {
            return;
        }

        // Check if we have a Work Order ID
        if (!this.recordId) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No Work Order',
                message: 'This component must be opened from a Work Order to create a Work Plan. (Demo: simulating success)',
                variant: 'warning'
            }));
            // For demo purposes, show success anyway
            this.workPlanCreated = true;
            return;
        }

        this.isCreatingWorkPlan = true;

        try {
            // Prepare warning attributes for Apex (using attrValue to avoid reserved word)
            const warningAttrs = this.selectedAsset.warningAttributes.map(attr => ({
                name: attr.name,
                attrValue: attr.value,
                minThreshold: attr.minThreshold,
                maxThreshold: attr.maxThreshold,
                unit: attr.unit,
                category: attr.category
            }));

            // Call Apex to create Work Plan
            const workPlanId = await createInspectionWorkPlan({
                workOrderId: this.recordId,
                assetName: this.selectedAsset.name,
                warningAttributes: JSON.stringify(warningAttrs)
            });

            this.workPlanCreated = true;

            // Show success toast
            this.dispatchEvent(new ShowToastEvent({
                title: 'Inspection Work Plan Created',
                message: `Work plan with ${warningAttrs.length + 4} inspection steps created for ${this.selectedAsset.name}`,
                variant: 'success'
            }));

        } catch (error) {
            console.error('Error creating work plan:', error);
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to create inspection work plan',
                variant: 'error'
            }));
        } finally {
            this.isCreatingWorkPlan = false;
        }
    }

    handleClose() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }

    handleOpenGoogleMaps() {
        window.open(this.googleMapsUrl, '_blank');
    }

    handleOpenArcGIS() {
        window.open(this.arcgisMapUrl, '_blank');
    }

    getStatusClass(status) {
        switch (status) {
            case 'Active':
                return 'slds-badge slds-theme_success';
            case 'Warning':
                return 'slds-badge slds-theme_warning';
            case 'Inactive':
                return 'slds-badge slds-theme_error';
            default:
                return 'slds-badge';
        }
    }
}
