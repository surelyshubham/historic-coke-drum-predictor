import { db } from './index';
import { 
  users, 
  clients, 
  cokeDrums, 
  weldJoints, 
  inspections, 
  inspectionObservations, 
  physicalIndications, 
  indicationMatches, 
  repairEvents, 
  auditLogs 
} from './schema';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Seeding Phase 2 database tables...');
  
  // Clear existing records in reverse dependency order
  await db.delete(auditLogs);
  await db.delete(repairEvents);
  await db.delete(indicationMatches);
  await db.delete(physicalIndications);
  await db.delete(inspectionObservations);
  await db.delete(inspections);
  await db.delete(weldJoints);
  await db.delete(users);
  await db.delete(cokeDrums);
  await db.delete(clients);

  // 1. Create Client A
  const [client] = await db.insert(clients).values({
    name: 'Refinery Alpha (Client A)',
    description: 'Primary Industrial Client for Coke Drum PAUT Monitoring',
  }).returning();

  // 2. Create Master & Client Users
  const masterPassword = await bcrypt.hash('master123', 10);
  const clientPassword = await bcrypt.hash('client123', 10);

  const [masterUser] = await db.insert(users).values({
    email: 'master@demo.com',
    passwordHash: masterPassword,
    role: 'MASTER',
    name: 'Master Engineer',
  }).returning();

  await db.insert(users).values({
    email: 'client@demo.com',
    passwordHash: clientPassword,
    role: 'CLIENT',
    name: 'Alpha Plant Inspector',
    clientId: client.id,
  });

  // 3. Create Coke Drum C04
  const [drum] = await db.insert(cokeDrums).values({
    clientId: client.id,
    name: 'C04',
    description: 'Main Delayed Coking Unit Drum C04',
    diameter: 8000, // 8.0 meters
    nominalThickness: 32, // 32 mm
    material: 'SA-387 Grade 22 Class 2',
    status: 'active',
  }).returning();

  // 4. Create Weld Joints (W01, W02, W03)
  const [w01] = await db.insert(weldJoints).values({ drumId: drum.id, name: 'W01', referenceDistance: 0 }).returning();
  const [w02] = await db.insert(weldJoints).values({ drumId: drum.id, name: 'W02', referenceDistance: 2500 }).returning();
  const [w03] = await db.insert(weldJoints).values({ drumId: drum.id, name: 'W03', referenceDistance: 5000 }).returning();

  // 5. Create Inspection Campaigns
  const [insp1] = await db.insert(inspections).values({
    drumId: drum.id,
    inspectionDate: new Date('2023-10-15'),
    campaignName: 'Oct-2023 Campaign',
    inspectionType: 'PAUT/DRM',
    processingStatus: 'COMPLETED',
    validationStatus: 'VALIDATED',
    createdBy: masterUser.id,
  }).returning();

  const [insp2] = await db.insert(inspections).values({
    drumId: drum.id,
    inspectionDate: new Date('2024-04-20'),
    campaignName: 'Apr-2024 Campaign',
    inspectionType: 'PAUT/DRM',
    processingStatus: 'COMPLETED',
    validationStatus: 'VALIDATED',
    createdBy: masterUser.id,
  }).returning();

  const [insp3] = await db.insert(inspections).values({
    drumId: drum.id,
    inspectionDate: new Date('2025-05-10'),
    campaignName: 'May-2025 Campaign',
    inspectionType: 'PAUT/DRM',
    processingStatus: 'COMPLETED',
    validationStatus: 'VALIDATED',
    createdBy: masterUser.id,
  }).returning();

  // 6. Create Persistent Physical Indications
  const [pi1] = await db.insert(physicalIndications).values({
    code: 'PI-000001',
    drumId: drum.id,
    weldJointId: w01.id,
    approximateLocation: 450, // 450 mm circumferential
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2025-05-10'),
    currentLength: 18.5,
    currentDepth: 6.2,
    status: 'ACTIVE',
    matchingConfidence: 0.96,
    notes: 'Growing circumferential crack on Weld W01',
  }).returning();

  const [pi2] = await db.insert(physicalIndications).values({
    code: 'PI-000002',
    drumId: drum.id,
    weldJointId: w02.id,
    approximateLocation: 1200,
    firstObservedDate: new Date('2023-10-15'),
    latestObservedDate: new Date('2025-05-10'),
    currentLength: 12.0,
    currentDepth: 4.0,
    status: 'REPAIRED',
    matchingConfidence: 0.98,
    notes: 'Repaired weld flaw on W02 in late 2024',
  }).returning();

  // 7. Create Observations across inspection campaigns
  // Observations for PI-000001 (Growth timeline: 10mm -> 14mm -> 18.5mm)
  const [obs1] = await db.insert(inspectionObservations).values({
    inspectionId: insp1.id,
    sourceIndicationNumber: 'IND-01',
    weldJointId: w01.id,
    circumferentialPosition: 448,
    axialPosition: 12,
    length: 10.0,
    depth: 3.5,
    amplitude: 82,
    indicationType: 'Crack-like',
  }).returning();

  const [obs2] = await db.insert(inspectionObservations).values({
    inspectionId: insp2.id,
    sourceIndicationNumber: 'IND-04',
    weldJointId: w01.id,
    circumferentialPosition: 452,
    axialPosition: 11,
    length: 14.0,
    depth: 4.8,
    amplitude: 88,
    indicationType: 'Crack-like',
  }).returning();

  const [obs3] = await db.insert(inspectionObservations).values({
    inspectionId: insp3.id,
    sourceIndicationNumber: 'IND-09',
    weldJointId: w01.id,
    circumferentialPosition: 450,
    axialPosition: 12,
    length: 18.5,
    depth: 6.2,
    amplitude: 94,
    indicationType: 'Crack-like',
  }).returning();

  // 8. Explicit Indication Matches
  await db.insert(indicationMatches).values([
    {
      physicalIndicationId: pi1.id,
      observationId: obs1.id,
      confidenceScore: 0.95,
      confidenceLevel: 'HIGH',
      matchExplanation: 'Same weld W01, location match within 2mm',
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
      reviewedAt: new Date(),
    },
    {
      physicalIndicationId: pi1.id,
      observationId: obs2.id,
      confidenceScore: 0.96,
      confidenceLevel: 'HIGH',
      matchExplanation: 'Same weld W01, matched spatial proximity and indication type',
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
      reviewedAt: new Date(),
    },
    {
      physicalIndicationId: pi1.id,
      observationId: obs3.id,
      confidenceScore: 0.98,
      confidenceLevel: 'HIGH',
      matchExplanation: 'Same weld W01, confirmed spatial and depth progression',
      status: 'CONFIRMED',
      reviewedBy: masterUser.id,
      reviewedAt: new Date(),
    },
  ]);

  // 9. Repair Event
  await db.insert(repairEvents).values({
    drumId: drum.id,
    weldJointId: w02.id,
    physicalIndicationId: pi2.id,
    repairDate: new Date('2024-11-01'),
    repairType: 'Weld Overlay / Excavation Repair',
    notes: 'Full excavation and re-weld of indication PI-000002',
    enteredBy: masterUser.id,
  });

  // 10. Audit Log
  await db.insert(auditLogs).values({
    userId: masterUser.id,
    action: 'DATA_IMPORT',
    objectType: 'inspections',
    objectId: String(insp3.id),
    newValue: { campaign: 'May-2025 Campaign', observationsCount: 1 },
  });

  console.log('Phase 2 database seeding completed successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Failed to seed Phase 2 database:', err);
  process.exit(1);
});
